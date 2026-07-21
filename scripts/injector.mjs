import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readImageMetadata } from "./image-metadata.mjs";

const FILE = fileURLToPath(import.meta.url);
const PROJECT = path.resolve(path.dirname(FILE), "..");
const VERSION = "1.11.6";
const MAX_ART_BYTES = 16 * 1024 * 1024;
const ID_PATTERN = /^[A-Za-z0-9._-]{1,200}$/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

class BrowserChangedError extends Error {}

function readOptions(args) {
  const result = {
    mode: "watch",
    port: 9335,
    browserId: null,
    timeoutMs: 30_000,
    themeDir: path.join(PROJECT, "assets"),
    pauseFile: null,
    screenshot: null,
    reload: false,
  };
  const valueAfter = (index, flag) => {
    if (index + 1 >= args.length) throw new Error(`${flag} needs a value`);
    return args[index + 1];
  };
  for (let index = 0; index < args.length; index += 1) {
    const flag = args[index];
    if (flag === "--watch") result.mode = "watch";
    else if (flag === "--once") result.mode = "once";
    else if (flag === "--verify") result.mode = "verify";
    else if (flag === "--remove") result.mode = "remove";
    else if (flag === "--self-test") result.mode = "self-test";
    else if (flag === "--check-payload") result.mode = "check-payload";
    else if (flag === "--reload") result.reload = true;
    else if (flag === "--port") result.port = Number(valueAfter(index++, flag));
    else if (flag === "--browser-id") result.browserId = valueAfter(index++, flag);
    else if (flag === "--timeout-ms") result.timeoutMs = Number(valueAfter(index++, flag));
    else if (flag === "--theme-dir") result.themeDir = path.resolve(valueAfter(index++, flag));
    else if (flag === "--pause-file") result.pauseFile = path.resolve(valueAfter(index++, flag));
    else if (flag === "--screenshot") result.screenshot = path.resolve(valueAfter(index++, flag));
    else throw new Error(`Unknown option: ${flag}`);
  }
  if (!Number.isInteger(result.port) || result.port < 1024 || result.port > 65_535) {
    throw new Error(`Invalid debugger port: ${result.port}`);
  }
  if (!Number.isInteger(result.timeoutMs) || result.timeoutMs < 250 || result.timeoutMs > 120_000) {
    throw new Error(`Invalid timeout: ${result.timeoutMs}`);
  }
  if (result.browserId !== null && !ID_PATTERN.test(result.browserId)) {
    throw new Error("Invalid browser identity");
  }
  if (["watch", "once", "verify", "remove"].includes(result.mode) && !result.browserId) {
    throw new Error(`${result.mode} mode requires --browser-id`);
  }
  return result;
}

function safeDebuggerSocket(raw, port, targetKind = null, targetId = null) {
  const source = typeof raw === "string" ? raw : raw?.webSocketDebuggerUrl;
  if (!source) throw new Error("Debugger target has no WebSocket endpoint");
  const socket = new URL(source);
  const match = socket.pathname.match(/^\/devtools\/(page|browser)\/([A-Za-z0-9._-]{1,200})$/);
  if (
    socket.protocol !== "ws:" || !LOCAL_HOSTS.has(socket.hostname) || Number(socket.port) !== port ||
    socket.username || socket.password || socket.search || socket.hash || !match
  ) throw new Error("Debugger endpoint is not a permitted loopback URL");
  if (targetKind && match[1] !== targetKind) throw new Error(`Expected a ${targetKind} debugger endpoint`);
  if (targetId && match[2] !== targetId) throw new Error("Debugger target ID does not match its endpoint");
  return { href: socket.href, kind: match[1], id: match[2] };
}

async function fetchDebuggerJson(port, pathname) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 2_000);
  try {
    const response = await fetch(`http://127.0.0.1:${port}${pathname}`, {
      redirect: "error",
      signal: abort.signal,
    });
    if (!response.ok) throw new Error(`Debugger HTTP ${response.status}`);
    return await response.json();
  } finally {
    clearTimeout(timer);
  }
}

async function currentBrowser(port) {
  const version = await fetchDebuggerJson(port, "/json/version");
  const endpoint = safeDebuggerSocket(version, port, "browser");
  return { id: endpoint.id, socket: endpoint.href };
}

async function assertBrowser(port, expected) {
  const browser = await currentBrowser(port);
  if (browser.id !== expected) {
    throw new BrowserChangedError(`Debugger identity changed (${expected} → ${browser.id})`);
  }
  return browser;
}

async function listPages(port, expectedBrowserId) {
  if (expectedBrowserId) await assertBrowser(port, expectedBrowserId);
  const raw = await fetchDebuggerJson(port, "/json/list");
  if (!Array.isArray(raw)) throw new Error("Debugger target list is invalid");
  return raw.filter((item) => {
    if (item?.type !== "page" || typeof item.id !== "string" || !ID_PATTERN.test(item.id)) return false;
    if (typeof item.url !== "string" || !item.url.startsWith("app://")) return false;
    try {
      safeDebuggerSocket(item, port, "page", item.id);
      return true;
    } catch {
      return false;
    }
  });
}

class DevtoolsPage {
  constructor(target, port) {
    this.target = target;
    this.socket = new WebSocket(safeDebuggerSocket(target, port, "page", target.id).href);
    this.sequence = 0;
    this.waiters = new Map();
    this.events = new Map();
    this.closed = false;
    this.socket.addEventListener("message", (event) => this.#receive(event));
    this.socket.addEventListener("close", () => this.#finish("Debugger page closed"));
    this.socket.addEventListener("error", () => this.#finish("Debugger page failed"));
  }

  async open() {
    if (this.socket.readyState !== WebSocket.OPEN) {
      await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("Timed out opening debugger page")), 5_000);
        this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
        this.socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not open debugger page")); }, { once: true });
      });
    }
    await this.command("Runtime.enable");
    await this.command("Page.enable");
    return this;
  }

  #receive(event) {
    let message;
    try { message = JSON.parse(String(event.data)); } catch { return; }
    if (message.id) {
      const waiter = this.waiters.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      this.waiters.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message || "Debugger command failed"));
      else waiter.resolve(message.result);
      return;
    }
    for (const listener of this.events.get(message.method) ?? []) listener(message.params ?? {});
  }

  #finish(reason) {
    if (this.closed) return;
    this.closed = true;
    for (const waiter of this.waiters.values()) {
      clearTimeout(waiter.timer);
      waiter.reject(new Error(reason));
    }
    this.waiters.clear();
  }

  on(name, listener) {
    const listeners = this.events.get(name) ?? new Set();
    listeners.add(listener);
    this.events.set(name, listeners);
  }

  command(method, params = {}) {
    if (this.closed) return Promise.reject(new Error("Debugger page is closed"));
    const id = ++this.sequence;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiters.delete(id);
        reject(new Error(`Debugger command timed out: ${method}`));
      }, 10_000);
      this.waiters.set(id, { resolve, reject, timer });
      try { this.socket.send(JSON.stringify({ id, method, params })); }
      catch (error) {
        clearTimeout(timer);
        this.waiters.delete(id);
        reject(error);
      }
    });
  }

  async evaluate(expression) {
    const reply = await this.command("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
    });
    if (reply.exceptionDetails) {
      const detail = reply.exceptionDetails.exception?.description ?? reply.exceptionDetails.text;
      throw new Error(`Page script failed: ${detail}`);
    }
    return reply.result?.value;
  }

  close() {
    this.#finish("Debugger page closed by injector");
    try { this.socket.close(); } catch {}
  }
}

class BrowserLifetime {
  constructor(socketUrl) {
    this.socket = new WebSocket(socketUrl);
    this.ended = false;
    this.socket.addEventListener("close", () => { this.ended = true; });
    this.socket.addEventListener("error", () => { this.ended = true; });
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return this;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timed out anchoring debugger browser")), 5_000);
      this.socket.addEventListener("open", () => { clearTimeout(timer); resolve(); }, { once: true });
      this.socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Could not anchor debugger browser")); }, { once: true });
    });
    return this;
  }

  close() {
    this.ended = true;
    try { this.socket.close(); } catch {}
  }
}

const permitted = {
  appearance: new Set(["auto", "light", "dark"]),
  safeArea: new Set(["auto", "left", "right", "center", "none"]),
  taskMode: new Set(["auto", "ambient", "banner", "off"]),
};

function shortText(value, fallback, field, limit = 120) {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value !== "string" || value.length > limit || /[\u0000-\u001f]/.test(value)) {
    throw new Error(`${field} must be a short single-line string`);
  }
  return value;
}

function choice(value, fallback, field) {
  const answer = value || fallback;
  if (!permitted[field].has(answer)) throw new Error(`Unsupported ${field}: ${answer}`);
  return answer;
}

function fraction(value, field) {
  if (value === undefined || value === null || value === "") return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) throw new Error(`${field} must be between 0 and 1`);
  return number;
}

async function readTheme(themeDir) {
  const directory = await fs.realpath(themeDir);
  const configPath = path.join(directory, "theme.json");
  const configSource = await fs.readFile(configPath, "utf8");
  const source = JSON.parse(configSource);
  if (!source || typeof source !== "object" || Array.isArray(source)) throw new Error("theme.json must contain an object");

  const imageName = shortText(source.image, null, "image", 240);
  let imagePath = null;
  let imageBytes = null;
  let artMetadata = null;
  if (imageName) {
    if (path.isAbsolute(imageName)) throw new Error("Theme artwork must use a relative path");
    const requestedImage = path.resolve(directory, imageName);
    const relative = path.relative(directory, requestedImage);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Theme artwork escapes its directory");
    imagePath = await fs.realpath(requestedImage);
    const realRelative = path.relative(directory, imagePath);
    if (!realRelative || realRelative.startsWith("..") || path.isAbsolute(realRelative)) throw new Error("Linked artwork escapes its directory");
    const extension = path.extname(imagePath).toLowerCase();
    if (![".png", ".jpg", ".jpeg", ".webp"].includes(extension)) throw new Error(`Unsupported artwork type: ${extension}`);
    imageBytes = await fs.readFile(imagePath);
    if (imageBytes.length < 1 || imageBytes.length > MAX_ART_BYTES) throw new Error("Theme artwork must be between 1 byte and 16 MB");
    artMetadata = readImageMetadata(imageBytes, extension);
    if (!artMetadata) throw new Error("Theme artwork has invalid or unsafe dimensions");
  }

  const art = source.art && typeof source.art === "object" && !Array.isArray(source.art) ? source.art : {};
  const palette = source.palette && typeof source.palette === "object" && !Array.isArray(source.palette) ? source.palette : {};
  const theme = {
    ...source,
    id: shortText(source.id, "native2007", "id", 80),
    name: shortText(source.name, "Codex Native 2007", "name"),
    image: imageName ?? null,
    appearance: choice(source.appearance, "light", "appearance"),
    palette: {},
    art: {
      focusX: fraction(art.focusX, "art.focusX"),
      focusY: fraction(art.focusY, "art.focusY"),
      safeArea: choice(art.safeArea, "none", "safeArea"),
      taskMode: choice(art.taskMode, "off", "taskMode"),
    },
    artMetadata,
  };
  if (typeof palette.accent === "string" && palette.accent.trim()) {
    const accent = palette.accent.trim();
    if (!/^(?:#[\da-f]{3,8}|(?:rgb|hsl|oklch|oklab)\([^;{}]{1,96}\))$/i.test(accent)) {
      throw new Error("palette.accent is not a supported CSS color");
    }
    theme.palette.accent = accent;
  }
  const configStat = await fs.stat(configPath);
  const imageStat = imagePath ? await fs.stat(imagePath) : null;
  const fingerprintSource = createHash("sha256").update(configSource);
  if (imageBytes) fingerprintSource.update("\0").update(imageBytes);
  const fingerprint = fingerprintSource.digest("hex");
  return {
    theme,
    imagePath,
    imageBytes,
    fingerprint,
    stamp: imageStat
      ? `${configStat.size}:${configStat.mtimeMs}:${imageStat.size}:${imageStat.mtimeMs}`
      : `${configStat.size}:${configStat.mtimeMs}:no-art`,
  };
}

const EMBEDDED_ASSETS = Object.freeze({
  "__NATIVE2007_USER_AVATAR_DATA__": ["hat-penguin.png", "image/png"],
  "__QQ2007_ICON_NEW_TASK_DATA__": ["icons2007/new-task.png", "image/png"],
  "__QQ2007_ICON_SCHEDULED_DATA__": ["icons2007/scheduled.png", "image/png"],
  "__QQ2007_ICON_PLUGINS_DATA__": ["icons2007/plugins.png", "image/png"],
  "__QQ2007_ICON_PROJECT_DATA__": ["icons2007/project-folder.png", "image/png"],
  "__QQ2007_ICON_QUICK_CHAT_DATA__": ["icons2007/quick-chat.png", "image/png"],
  "__QQ2007_ICON_ATTACH_DATA__": ["icons2007/attach.png", "image/png"],
  "__QQ2007_ICON_PULL_REQUESTS_DATA__": ["icons2007/pull-requests.png", "image/png"],
  "__QQ2007_ICON_SITES_DATA__": ["icons2007/sites.png", "image/png"],
  "__QQ2007_ICON_SEARCH_DATA__": ["icons2007/search.png", "image/png"],
  "__QQ2007_ICON_HELP_DATA__": ["icons2007/help.png", "image/png"],
});

async function buildPayload(themeDir) {
  const loaded = await readTheme(themeDir);
  const assets = path.join(PROJECT, "assets");
  const entries = Object.entries(EMBEDDED_ASSETS);
  const [cssSource, renderer, font, ...artwork] = await Promise.all([
    fs.readFile(path.join(assets, "native2007.css"), "utf8"),
    fs.readFile(path.join(assets, "renderer-native2007.js"), "utf8"),
    fs.readFile(path.join(assets, "fonts", "ChillRoundGothic_Medium.woff")),
    ...entries.map(([, [filename]]) => fs.readFile(path.join(assets, filename))),
  ]);
  let css = cssSource.replace("__RETRO_MENU_FONT_DATA__", `data:font/woff;base64,${font.toString("base64")}`);
  entries.forEach(([token, [, mime]], index) => {
    css = css.replaceAll(token, `data:${mime};base64,${artwork[index].toString("base64")}`);
  });
  if (/__(?:RETRO_MENU_FONT|NATIVE2007_USER_AVATAR|QQ2007_ICON_)[A-Z0-9_]*__/.test(css)) {
    throw new Error("A CSS asset placeholder could not be resolved");
  }
  const extension = loaded.imagePath ? path.extname(loaded.imagePath).toLowerCase() : "";
  const mime = extension === ".webp" ? "image/webp" : [".jpg", ".jpeg"].includes(extension) ? "image/jpeg" : "image/png";
  const artData = loaded.imageBytes ? `data:${mime};base64,${loaded.imageBytes.toString("base64")}` : "";
  const payload = renderer
    .replace("__NATIVE2007_CSS_JSON__", JSON.stringify(css))
    .replace("__NATIVE2007_ART_JSON__", JSON.stringify(artData))
    .replace("__NATIVE2007_CONFIG_JSON__", JSON.stringify(loaded.theme));
  if (/__NATIVE2007_(?:CSS|ART|CONFIG)_JSON__/.test(payload)) throw new Error("Renderer placeholders could not be resolved");
  return { ...loaded, payload };
}

function shellProbeExpression() {
  return `(() => ({
    codex: location.protocol === 'app:' && Boolean(document.querySelector('main.main-surface')) && Boolean(document.querySelector('aside.app-shell-left-panel')),
    markers: {
      main: Boolean(document.querySelector('main.main-surface')),
      sidebar: Boolean(document.querySelector('aside.app-shell-left-panel')),
      composer: Boolean(document.querySelector('.composer-surface-chrome'))
    }
  }))()`;
}

async function waitForShell(page, timeoutMs = 2_000) {
  const deadline = Date.now() + timeoutMs;
  let last = null;
  while (!page.closed && Date.now() < deadline) {
    try {
      last = await page.evaluate(shellProbeExpression());
      if (last?.codex) return last;
    } catch {}
    await delay(60);
  }
  return last;
}

export function earlyInstallSource(payload, revision) {
  return `(() => {
    const revision = ${JSON.stringify(revision)};
    window.__CODEX_NATIVE_2007_PENDING__ = revision;
    const attempt = () => {
      if (window.__CODEX_NATIVE_2007_PENDING__ !== revision) return true;
      if (!document.documentElement || !document.body) return false;
      if (!document.querySelector('main.main-surface') || !document.querySelector('aside.app-shell-left-panel')) return false;
      ${payload};
      window.__CODEX_NATIVE_2007_EARLY__ = revision;
      return true;
    };
    if (attempt()) return;
    const observer = new MutationObserver(() => {
      if (attempt()) observer.disconnect();
    });
    const attach = () => {
      if (document.documentElement) observer.observe(document.documentElement, { childList: true, subtree: true });
      else setTimeout(attach, 0);
    };
    attach();
    setTimeout(() => observer.disconnect(), 10000);
  })()`;
}

async function registerEarly(page, payload) {
  const reply = await page.command("Page.addScriptToEvaluateOnNewDocument", {
    source: earlyInstallSource(payload.payload, payload.fingerprint),
  });
  return reply.identifier ?? null;
}

async function unregisterEarly(page, identifier) {
  if (!identifier || page.closed) return;
  await page.command("Page.removeScriptToEvaluateOnNewDocument", { identifier }).catch(() => {});
}

const REMOVE_SOURCE = `(() => {
  window.__CODEX_NATIVE_2007_DISABLED__ = true;
  const state = window.__CODEX_NATIVE_2007_STATE__;
  if (typeof state?.cleanup === 'function') return state.cleanup();
  document.documentElement?.classList.remove('codex-native2007', 'dream-theme-light', 'dream-theme-dark', 'dream-home-shell');
  document.querySelectorAll('.dream-home').forEach((node) => node.classList.remove('dream-home'));
  document.querySelectorAll('.dream-task').forEach((node) => node.classList.remove('dream-task'));
  document.getElementById('codex-native2007-style')?.remove();
  document.getElementById('codex-native2007-chrome')?.remove();
  delete window.__CODEX_NATIVE_2007_STATE__;
  return true;
})()`;

const VERIFY_REMOVED_SOURCE = `(() =>
  !document.documentElement.classList.contains('codex-native2007') &&
  !document.getElementById('codex-native2007-style') &&
  !document.getElementById('codex-native2007-chrome') &&
  !window.__CODEX_NATIVE_2007_STATE__
)()`;

function verifySource() {
  return `(() => {
    const state = window.__CODEX_NATIVE_2007_STATE__;
    const style = document.getElementById('codex-native2007-style');
    const chrome = document.getElementById('codex-native2007-chrome');
    const result = {
      installed: document.documentElement.classList.contains('codex-native2007'),
      version: state?.version ?? null,
      expectedVersion: ${JSON.stringify(VERSION)},
      stylePresent: Boolean(style),
      chromePresent: Boolean(chrome),
      sidebarPresent: Boolean(document.querySelector('aside.app-shell-left-panel')),
      mainPresent: Boolean(document.querySelector('main.main-surface')),
      chromePointerEvents: chrome ? getComputedStyle(chrome).pointerEvents : null
    };
    result.pass = result.installed && result.version === result.expectedVersion && result.stylePresent &&
      result.chromePresent && result.sidebarPresent && result.mainPresent && result.chromePointerEvents === 'none';
    return result;
  })()`;
}

async function waitForVerification(page, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let result = null;
  while (!page.closed && Date.now() < deadline) {
    try {
      result = await page.evaluate(verifySource());
      if (result?.pass) return result;
    } catch {}
    await delay(350);
  }
  return result;
}

async function connectCodexPages(options) {
  const deadline = Date.now() + options.timeoutMs;
  let reason = "No Codex page found";
  while (Date.now() < deadline) {
    let pages = [];
    try {
      for (const target of await listPages(options.port, options.browserId)) {
        let page;
        try {
          page = await new DevtoolsPage(target, options.port).open();
          const probe = await waitForShell(page, 900);
          if (probe?.codex) pages.push({ target, page, probe });
          else page.close();
        } catch (error) {
          page?.close();
          reason = error.message;
        }
      }
      if (pages.length) return pages;
    } catch (error) {
      if (error instanceof BrowserChangedError) throw error;
      reason = error.message;
    }
    await delay(300);
  }
  throw new Error(`Could not find a verified Codex renderer: ${reason}`);
}

async function saveScreenshot(page, filename) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const result = await page.command("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  await fs.writeFile(filename, Buffer.from(result.data, "base64"));
}

async function oneShot(options) {
  const pages = await connectCodexPages(options);
  const payload = options.mode === "once" || options.reload ? await buildPayload(options.themeDir) : null;
  const reports = [];
  let captured = false;
  try {
    for (const { target, page, probe } of pages) {
      try {
        if (options.mode === "remove") await page.evaluate(REMOVE_SOURCE);
        if (options.mode === "once") await page.evaluate(payload.payload);
        if (options.reload) {
          await page.command("Page.reload", { ignoreCache: true });
          await delay(1_000);
          if (options.mode !== "remove") await page.evaluate(payload.payload);
        }
        const result = options.mode === "remove"
          ? await page.evaluate(VERIFY_REMOVED_SOURCE)
          : await waitForVerification(page, options.timeoutMs);
        reports.push({ targetId: target.id, markers: probe.markers, result });
        if (options.screenshot && !captured) {
          await saveScreenshot(page, options.screenshot);
          captured = true;
        }
      } finally {
        page.close();
      }
    }
  } finally {
    pages.forEach(({ page }) => page.close());
  }
  console.log(JSON.stringify({ mode: options.mode, port: options.port, targets: reports }, null, 2));
  if (!reports.length || reports.some(({ result }) => options.mode === "remove" ? result !== true : !result?.pass)) {
    process.exitCode = 2;
  }
}

async function fileStamp(themeDir) {
  const directory = await fs.realpath(themeDir);
  const configPath = path.join(directory, "theme.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const configStat = await fs.stat(configPath);
  if (!config.image) return `${configStat.size}:${configStat.mtimeMs}:no-art`;
  const imageStat = await fs.stat(path.resolve(directory, config.image));
  return `${configStat.size}:${configStat.mtimeMs}:${imageStat.size}:${imageStat.mtimeMs}`;
}

async function exists(filename) {
  if (!filename) return false;
  try { return (await fs.stat(filename)).isFile(); }
  catch (error) {
    if (error?.code === "ENOENT") return false;
    throw error;
  }
}

async function watch(options) {
  const browser = await assertBrowser(options.port, options.browserId);
  const lifetime = await new BrowserLifetime(browser.socket).open();
  const active = new Map();
  let payload = await buildPayload(options.themeDir);
  let paused = await exists(options.pauseFile);
  let stopping = false;
  let nextThemeCheck = 0;
  let lastErrorAt = 0;
  const stop = () => { stopping = true; };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  const forget = async (id) => {
    const entry = active.get(id);
    if (!entry) return;
    await unregisterEarly(entry.page, entry.earlyId);
    entry.page.close();
    active.delete(id);
  };

  const install = async (entry) => {
    await unregisterEarly(entry.page, entry.earlyId);
    entry.earlyId = null;
    if (paused) {
      await entry.page.evaluate(REMOVE_SOURCE);
      return;
    }
    entry.earlyId = await registerEarly(entry.page, payload);
    await entry.page.evaluate(payload.payload);
  };

  try {
    while (!stopping && !lifetime.ended) {
      let targets;
      try {
        targets = await listPages(options.port, options.browserId);
      } catch (error) {
        if (error instanceof BrowserChangedError || lifetime.ended) break;
        if (Date.now() - lastErrorAt > 15_000) {
          console.error(`[native2007] target scan failed: ${error.message}`);
          lastErrorAt = Date.now();
        }
        await delay(800);
        continue;
      }

      const nextPaused = await exists(options.pauseFile);
      let refresh = nextPaused !== paused;
      paused = nextPaused;
      if (!paused && Date.now() >= nextThemeCheck) {
        nextThemeCheck = Date.now() + 1_500;
        try {
          const stamp = await fileStamp(options.themeDir);
          if (stamp !== payload.stamp) {
            const next = await buildPayload(options.themeDir);
            refresh ||= next.fingerprint !== payload.fingerprint;
            payload = next;
          }
        } catch (error) {
          if (Date.now() - lastErrorAt > 15_000) {
            console.error(`[native2007] theme update ignored: ${error.message}`);
            lastErrorAt = Date.now();
          }
        }
      }

      const ids = new Set(targets.map(({ id }) => id));
      for (const [id, entry] of active) {
        if (!ids.has(id) || entry.page.closed) await forget(id);
      }
      if (refresh) {
        for (const [id, entry] of active) {
          try { await install(entry); }
          catch (error) {
            console.error(`[native2007] refresh failed for ${id}: ${error.message}`);
            await forget(id);
          }
        }
        console.log(paused ? "[native2007] paused" : `[native2007] theme ${payload.theme.id} refreshed`);
      }

      for (const target of targets) {
        if (active.has(target.id)) continue;
        let page;
        try {
          page = await new DevtoolsPage(target, options.port).open();
          const entry = { page, earlyId: null };
          if (!paused) {
            entry.earlyId = await registerEarly(page, payload);
            await page.evaluate(earlyInstallSource(payload.payload, payload.fingerprint));
          }
          const probe = await waitForShell(page, 2_500);
          if (!probe?.codex) {
            await unregisterEarly(page, entry.earlyId);
            page.close();
            continue;
          }
          if (paused) await page.evaluate(REMOVE_SOURCE);
          else {
            const earlyApplied = await page.evaluate(
              `window.__CODEX_NATIVE_2007_EARLY__ === ${JSON.stringify(payload.fingerprint)}`,
            ).catch(() => false);
            if (!earlyApplied) await page.evaluate(payload.payload);
          }
          page.on("Page.loadEventFired", () => {
            if (paused || page.closed) return;
            setTimeout(() => page.evaluate(earlyInstallSource(payload.payload, payload.fingerprint)).catch(() => {}), 80);
          });
          active.set(target.id, entry);
          console.log(`[native2007] attached ${target.id}`);
        } catch (error) {
          page?.close();
          if (Date.now() - lastErrorAt > 15_000) {
            console.error(`[native2007] attach failed for ${target.id}: ${error.message}`);
            lastErrorAt = Date.now();
          }
        }
      }
      await delay(900);
    }
  } finally {
    for (const id of [...active.keys()]) await forget(id);
    lifetime.close();
  }
}

async function selfTest(options) {
  const page = safeDebuggerSocket(`ws://127.0.0.1:${options.port}/devtools/page/test-page`, options.port, "page", "test-page");
  const browser = safeDebuggerSocket(`ws://127.0.0.1:${options.port}/devtools/browser/test-browser`, options.port, "browser");
  const unsafe = [
    `ws://example.com:${options.port}/devtools/page/test-page`,
    `wss://127.0.0.1:${options.port}/devtools/page/test-page`,
    `ws://127.0.0.1:${options.port + 1}/devtools/page/test-page`,
    `ws://user@127.0.0.1:${options.port}/devtools/page/test-page`,
    `ws://127.0.0.1:${options.port}/devtools/page/test-page?q=1`,
  ];
  for (const candidate of unsafe) {
    let rejected = false;
    try { safeDebuggerSocket(candidate, options.port); } catch { rejected = true; }
    if (!rejected) throw new Error(`Unsafe debugger URL accepted: ${candidate}`);
  }
  console.log(JSON.stringify({ pass: page.id === "test-page" && browser.id === "test-browser", version: VERSION }));
}

async function checkPayload(options) {
  const payload = await buildPayload(options.themeDir);
  console.log(JSON.stringify({
    pass: true,
    version: VERSION,
    themeId: payload.theme.id,
    payloadBytes: Buffer.byteLength(payload.payload),
    artMetadata: payload.theme.artMetadata,
  }));
}

async function main() {
  const options = readOptions(process.argv.slice(2));
  if (options.mode === "self-test") await selfTest(options);
  else if (options.mode === "check-payload") await checkPayload(options);
  else if (options.mode === "watch") await watch(options);
  else await oneShot(options);
}

const invokedPath = process.argv[1]
  ? await fs.realpath(process.argv[1]).catch(() => path.resolve(process.argv[1]))
  : "";
const modulePath = await fs.realpath(FILE).catch(() => path.resolve(FILE));

if (invokedPath === modulePath) {
  main().catch((error) => {
    console.error(`[native2007] ${error.stack || error.message}`);
    process.exitCode = 1;
  });
}
