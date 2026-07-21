#!/bin/zsh
set -euo pipefail

INSTALL_ROOT="$HOME/Library/Application Support/Codex Native 2007"
STATE_ROOT="$INSTALL_ROOT/state"
STATE_FILE="$STATE_ROOT/state.json"
INJECTOR="$INSTALL_ROOT/scripts/injector.mjs"
THEME_DIR="$INSTALL_ROOT/assets"
LOG_FILE="$STATE_ROOT/injector.log"
ERROR_LOG="$STATE_ROOT/injector-error.log"
VERIFY_LOG="$STATE_ROOT/verify.log"
PREFERRED_PORT=9335
WATCHER_LABEL="io.github.shitsuten.codex-native2007.watcher"
WATCHER_DOMAIN="gui/$(/usr/bin/id -u)/$WATCHER_LABEL"
WATCHER_RUNNER="$INSTALL_ROOT/bin/watch.sh"

mkdir -p "$STATE_ROOT"

notify() {
  /usr/bin/osascript -e "display notification \"$1\" with title \"Codex Native 2007\"" >/dev/null 2>&1 || true
}

fail() {
  notify "启动失败，详情已写入日志"
  /usr/bin/osascript -e "display dialog \"Codex Native 2007 启动失败：\\n\\n$1\\n\\n日志：$ERROR_LOG\" buttons {\"好\"} default button \"好\" with icon stop" >/dev/null 2>&1 || true
  print -u2 -- "$1"
  exit 1
}

find_node() {
  local candidate
  local -a candidates
  candidates=(
    /opt/homebrew/bin/node
    /usr/local/bin/node
    "$HOME/.local/bin/node"
    "$HOME"/.nvm/versions/node/*/bin/node(N)
    "$HOME"/.fnm/node-versions/*/installation/bin/node(N)
    "$HOME"/.asdf/installs/nodejs/*/bin/node(N)
    "$HOME"/.local/share/mise/installs/node/*/bin/node(N)
  )
  for candidate in "${candidates[@]}"; do
    if [[ -x "$candidate" ]] &&
      "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 && typeof WebSocket === "function" ? 0 : 1)' >/dev/null 2>&1; then
      print -r -- "$candidate"
      return 0
    fi
  done
  candidate="$(command -v node 2>/dev/null || true)"
  if [[ -x "$candidate" ]] &&
    "$candidate" -e 'process.exit(Number(process.versions.node.split(".")[0]) >= 22 && typeof WebSocket === "function" ? 0 : 1)' >/dev/null 2>&1; then
    print -r -- "$candidate"
    return 0
  fi
  return 1
}

find_codex_app() {
  local candidate
  for candidate in /Applications/ChatGPT.app /Applications/Codex.app "$HOME/Applications/ChatGPT.app" "$HOME/Applications/Codex.app"; do
    if [[ -d "$candidate" ]]; then
      print -r -- "$candidate"
      return 0
    fi
  done
  return 1
}

read_state_field() {
  local field="$1"
  [[ -f "$STATE_FILE" ]] || return 1
  "$NODE" -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]];
    if (value !== undefined && value !== null) process.stdout.write(String(value));
  ' "$STATE_FILE" "$field" 2>/dev/null
}

stop_recorded_watcher() {
  local pid command
  /bin/launchctl remove "$WATCHER_LABEL" >/dev/null 2>&1 || true
  pid="$(read_state_field injectorPid || true)"
  [[ "$pid" == <-> ]] || return 0
  if kill -0 "$pid" 2>/dev/null; then
    command="$(ps -p "$pid" -o command= 2>/dev/null || true)"
    if [[ "$command" == *"$INJECTOR"* ]]; then
      kill "$pid" 2>/dev/null || true
      for _ in {1..20}; do
        kill -0 "$pid" 2>/dev/null || break
        sleep 0.1
      done
    fi
  fi
}

app_main_pids() {
  pgrep -f "^${EXECUTABLE}( |$)" 2>/dev/null || true
}

select_port() {
  local port
  for port in {$PREFERRED_PORT..9345}; do
    if ! /usr/sbin/lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1; then
      print -r -- "$port"
      return 0
    fi
  done
  return 1
}

NODE="$(find_node)" || fail "没有找到兼容的 Node.js 运行环境（需要 Node.js 22 或更高版本）。"
APP="$(find_codex_app)" || fail "没有在 Applications 中找到 Codex。"
APP_NAME="${APP:t:r}"
EXECUTABLE="$APP/Contents/MacOS/$APP_NAME"
if [[ ! -x "$EXECUTABLE" ]]; then
  EXECUTABLE="$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist" 2>/dev/null || true)"
fi
[[ -x "$EXECUTABLE" ]] || fail "找到了 $APP，但无法定位它的主程序。"

"$NODE" "$INJECTOR" --self-test --port "$PREFERRED_PORT" >>"$VERIFY_LOG" 2>>"$ERROR_LOG" ||
  fail "注入器自检没有通过。"
"$NODE" "$INJECTOR" --check-payload --theme-dir "$THEME_DIR" >>"$VERIFY_LOG" 2>>"$ERROR_LOG" ||
  fail "主题文件校验没有通过。"

RUNNING_PIDS="$(app_main_pids)"
if [[ -n "$RUNNING_PIDS" ]]; then
  RESPONSE="$(/usr/bin/osascript -e 'display dialog "启用原生 2007 风格需要重启一次 Codex。请先保存还没有发送的文字，然后继续。" buttons {"取消", "重启并换肤"} default button "重启并换肤" cancel button "取消" with icon caution' -e 'button returned of result' 2>/dev/null || true)"
  [[ "$RESPONSE" == "重启并换肤" ]] || exit 0

  stop_recorded_watcher

  /usr/bin/osascript -e "tell application \"$APP\" to quit" >/dev/null 2>&1 || true
  for _ in {1..50}; do
    [[ -z "$(app_main_pids)" ]] && break
    sleep 0.2
  done
  RUNNING_PIDS="$(app_main_pids)"
  if [[ -n "$RUNNING_PIDS" ]]; then
    kill ${(f)RUNNING_PIDS} 2>/dev/null || true
    for _ in {1..30}; do
      [[ -z "$(app_main_pids)" ]] && break
      sleep 0.2
    done
  fi
  [[ -z "$(app_main_pids)" ]] || fail "Codex 没有正常退出。请手动关闭所有 Codex 窗口后再运行一次。"
else
  stop_recorded_watcher
fi

PORT="$(select_port)" || fail "9335–9345 端口都在使用，无法创建本机调试连接。"
rm -f "$LOG_FILE" "$ERROR_LOG"

open -na "$APP" --args \
  --remote-debugging-address=127.0.0.1 \
  --remote-debugging-port="$PORT" ||
  fail "无法启动 $APP。"

READY=false
for _ in {1..120}; do
  if /usr/bin/curl -fsS --max-time 1 "http://127.0.0.1:$PORT/json/version" >"$STATE_ROOT/version.json" 2>/dev/null; then
    READY=true
    break
  fi
  sleep 0.25
done
[[ "$READY" == true ]] || fail "Codex 没有在 30 秒内开放本机调试接口。"

BROWSER_ID="$("$NODE" -e '
  const fs = require("fs");
  const data = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
  const url = new URL(data.webSocketDebuggerUrl);
  const match = url.pathname.match(/^\/devtools\/browser\/([A-Za-z0-9._-]+)$/);
  if (url.hostname !== "127.0.0.1" || Number(url.port) !== Number(process.argv[2]) || !match) process.exit(2);
  process.stdout.write(match[1]);
' "$STATE_ROOT/version.json" "$PORT")" || fail "本机调试接口身份校验失败。"

/bin/launchctl remove "$WATCHER_LABEL" >/dev/null 2>&1 || true
/bin/launchctl submit -l "$WATCHER_LABEL" -o "$LOG_FILE" -e "$ERROR_LOG" -- \
  "$WATCHER_RUNNER" "$WATCHER_LABEL" "$NODE" "$INJECTOR" "$PORT" "$BROWSER_ID" "$THEME_DIR" ||
  fail "无法注册皮肤进程。"
/bin/launchctl kickstart "$WATCHER_DOMAIN" ||
  { /bin/launchctl remove "$WATCHER_LABEL" >/dev/null 2>&1 || true; fail "无法启动皮肤进程。"; }

INJECTOR_PID=""
for _ in {1..30}; do
  INJECTOR_PID="$(/bin/launchctl print "$WATCHER_DOMAIN" 2>/dev/null |
    /usr/bin/awk '/^[[:space:]]*pid = [0-9]+/{ print $3; exit }' || true)"
  [[ "$INJECTOR_PID" == <-> ]] && break
  sleep 0.1
done

sleep 0.8
if [[ "$INJECTOR_PID" != <-> ]] || ! kill -0 "$INJECTOR_PID" 2>/dev/null; then
  /bin/launchctl remove "$WATCHER_LABEL" >/dev/null 2>&1 || true
  fail "皮肤进程启动后意外退出。"
fi

if ! "$NODE" "$INJECTOR" --verify --port "$PORT" --browser-id "$BROWSER_ID" \
  --timeout-ms 45000 >"$VERIFY_LOG" 2>>"$ERROR_LOG"; then
  /bin/launchctl remove "$WATCHER_LABEL" >/dev/null 2>&1 || true
  fail "Codex 已启动，但皮肤验证失败。"
fi

APP_VERSION="$(/usr/libexec/PlistBuddy -c 'Print :CFBundleShortVersionString' "$APP/Contents/Info.plist" 2>/dev/null || true)"
TMP_STATE="$STATE_FILE.tmp"
"$NODE" -e '
  const fs = require("fs");
  const [file, pid, port, browserId, app, version, injector, theme] = process.argv.slice(1);
  fs.writeFileSync(file, JSON.stringify({
    schemaVersion: 1,
    platform: "macos",
    injectorPid: Number(pid),
    port: Number(port),
    browserId,
    app,
    appVersion: version,
    injector,
    themeDir: theme,
    createdAt: new Date().toISOString()
  }, null, 2) + "\n", { mode: 0o600 });
' "$TMP_STATE" "$INJECTOR_PID" "$PORT" "$BROWSER_ID" "$APP" "$APP_VERSION" "$INJECTOR" "$THEME_DIR"
mv -f "$TMP_STATE" "$STATE_FILE"

notify "Codex 原生 2007 风格已经启动"
exit 0
