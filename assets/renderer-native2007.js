((cssText, _artDataUrl, _rawConfig) => {
  const STATE_KEY = "__CODEX_NATIVE_2007_STATE__";
  const STYLE_ID = "codex-native2007-style";
  const CHROME_ID = "codex-native2007-chrome";
  const USAGE_BUTTON_ID = "qq2007-usage-button";
  const USAGE_POPOVER_ID = "qq2007-usage-popover";
  const PALETTE_BUTTON_ID = "qq2007-palette-button";
  const PALETTE_POPOVER_ID = "qq2007-palette-popover";
  const PALETTE_STORAGE_KEY = "codex-native2007-palette";
  const VERSION = "1.11.6";
  const PALETTES = [
    { id: "blue", label: "经典蓝", colors: ["#55a7df", "#1268b5"] },
    { id: "pink", label: "樱桃牛奶", colors: ["#d85b89", "#e1aa3a"] },
    { id: "violet", label: "葡萄汽水", colors: ["#8263c7", "#38a8ac"] },
    { id: "mint", label: "海盐橘子", colors: ["#29988f", "#e38b2e"] },
  ];
  const ROOT_CLASSES = [
    "codex-native2007",
    "dream-theme-light",
    "dream-home-shell",
  ];
  let observer = null;
  let timer = null;
  let scheduled = false;
  let usageCaptureTimer = null;
  let usageCaptureInFlight = false;
  let usageData = null;
  const ICON_HOST_CLASSES = [
    "qq2007-icon-host",
    "qq2007-icon-new-task",
    "qq2007-icon-scheduled",
    "qq2007-icon-plugins",
    "qq2007-icon-project",
    "qq2007-icon-quick-chat",
    "qq2007-icon-attach",
    "qq2007-icon-pull-requests",
    "qq2007-icon-sites",
    "qq2007-icon-search",
    "qq2007-icon-help",
  ];

  window.__CODEX_NATIVE_2007_DISABLED__ = false;

  const clearScopes = () => {
    document.querySelectorAll(".dream-home").forEach((node) => {
      node.classList.remove("dream-home");
    });
    document.querySelectorAll(".dream-task").forEach((node) => {
      node.classList.remove("dream-task");
    });
    document.querySelector("main.main-surface")?.classList.remove("dream-home-shell");
    document.querySelectorAll(".qq2007-workspace-shell").forEach((node) => {
      node.classList.remove("qq2007-workspace-shell");
    });
    document.querySelectorAll(".qq2007-icon-host").forEach((node) => {
      node.classList.remove(...ICON_HOST_CLASSES);
    });
    document.querySelectorAll(".qq2007-native-icon").forEach((node) => {
      node.classList.remove("qq2007-native-icon");
    });
    document.querySelectorAll(
      [
        ".qq2007-forum-post",
        ".qq2007-forum-content",
        ".qq2007-forum-extras",
        ".qq2007-forum-resource-card",
        ".qq2007-forum-diff-card",
        ".qq2007-forum-actions",
        ".qq2007-forum-time",
        ".qq2007-system-row",
        ".qq2007-system-reconnect",
        ".qq2007-work-heading",
        ".qq2007-work-summary-button",
        ".qq2007-work-duration",
        ".qq2007-work-live",
        ".qq2007-user-message",
        ".qq2007-user-bubble",
      ].join(", "),
    ).forEach((node) => {
      node.classList.remove(
        "qq2007-forum-post",
        "qq2007-forum-content",
        "qq2007-forum-extras",
        "qq2007-forum-resource-card",
        "qq2007-forum-diff-card",
        "qq2007-forum-actions",
        "qq2007-forum-time",
        "qq2007-system-row",
        "qq2007-system-reconnect",
        "qq2007-work-heading",
        "qq2007-work-summary-button",
        "qq2007-work-duration",
        "qq2007-work-live",
        "qq2007-user-message",
        "qq2007-user-bubble",
      );
    });
    document.querySelectorAll("[data-qq2007-forum-label]").forEach((node) => {
      node.removeAttribute("data-qq2007-forum-label");
    });
    document.querySelectorAll("[data-qq2007-work-duration]").forEach((node) => {
      node.removeAttribute("data-qq2007-work-duration");
    });
    document.querySelectorAll(
      [
        ".qq2007-composer-footer",
        ".qq2007-composer-editor",
        ".qq2007-composer-tools",
        ".qq2007-composer-left-tools",
        ".qq2007-composer-right-tools",
        ".qq2007-composer-empty-attachments",
      ].join(", "),
    ).forEach((node) => {
      node.classList.remove(
        "qq2007-composer-footer",
        "qq2007-composer-editor",
        "qq2007-composer-tools",
        "qq2007-composer-left-tools",
        "qq2007-composer-right-tools",
        "qq2007-composer-empty-attachments",
      );
    });
    document.querySelectorAll(".qq2007-composer-shell").forEach((surface) => {
      surface.classList.remove("qq2007-composer-shell");
      surface.style.removeProperty("border-color");
      surface.style.removeProperty("border-style");
      surface.style.removeProperty("border-width");
    });
    document.getElementById(USAGE_BUTTON_ID)?.remove();
    document.getElementById(USAGE_POPOVER_ID)?.remove();
    document.getElementById(PALETTE_BUTTON_ID)?.remove();
    document.getElementById(PALETTE_POPOVER_ID)?.remove();
    document.documentElement?.removeAttribute("data-qq2007-palette");
    document.documentElement?.classList.remove("qq2007-usage-capturing");
  };

  const wait = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

  const addClassesOnce = (node, ...names) => {
    if (!node) return false;
    const missing = names.filter((name) => !node.classList.contains(name));
    if (!missing.length) return false;
    node.classList.add(...missing);
    return true;
  };

  const setClassOnce = (node, name, enabled) => {
    if (!node || node.classList.contains(name) === enabled) return false;
    node.classList.toggle(name, enabled);
    return true;
  };

  const setAttributeOnce = (node, name, value) => {
    const next = String(value);
    if (!node || node.getAttribute(name) === next) return false;
    node.setAttribute(name, next);
    return true;
  };

  const setTextOnce = (node, value) => {
    const next = String(value);
    if (!node || node.textContent === next) return false;
    node.textContent = next;
    return true;
  };

  const setStyleOnce = (node, name, value) => {
    if (!node || node.style.getPropertyValue(name) === value) return false;
    node.style.setProperty(name, value);
    return true;
  };

  const activate = (control) => {
    if (!control) return false;
    const pointerInit = {
      bubbles: true,
      button: 0,
      pointerType: "mouse",
      isPrimary: true,
    };
    const mouseInit = { bubbles: true, button: 0 };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
      control.dispatchEvent(
        type.startsWith("pointer")
          ? new PointerEvent(type, pointerInit)
          : new MouseEvent(type, mouseInit),
      );
    }
    return true;
  };

  const nativeUsageGroup = () => {
    for (const menu of document.querySelectorAll('[role="menu"]')) {
      for (const group of menu.querySelectorAll("div[data-state]")) {
        const item = group.querySelector(':scope > [role="menuitem"]');
        if (item?.textContent.trim() === "Usage remaining") {
          return { menu, group, item };
        }
      }
    }
    return null;
  };

  const readNativeUsage = () => {
    const native = nativeUsageGroup();
    if (!native) return null;
    const row = [...native.group.querySelectorAll(".grid")]
      .find((candidate) => /\d+(?:\.\d+)?%/.test(candidate.textContent));
    if (!row) return null;
    const period = row.children[0]?.textContent.trim() || "Weekly";
    const valueText = row.children[1]?.textContent || "";
    const remaining = valueText.match(/\d+(?:\.\d+)?%/)?.[0];
    if (!remaining) return null;
    return {
      period,
      remaining,
      reset:
        row.querySelector("[title]")?.getAttribute("title") ||
        valueText.replace(remaining, "").replace("·", "").trim(),
      percent: Math.max(0, Math.min(100, Number.parseFloat(remaining))),
    };
  };

  const updateUsageUI = () => {
    const button = document.getElementById(USAGE_BUTTON_ID);
    if (button) {
      const value = button.querySelector(".qq2007-usage-value");
      setTextOnce(
        value,
        usageData ? `${usageData.remaining} · ${usageData.reset}` : "Usage",
      );
      const title = usageData
        ? `${usageData.period} usage remaining: ${usageData.remaining}, resets ${usageData.reset}`
        : "View usage remaining";
      if (button.title !== title) button.title = title;
      setStyleOnce(
        button,
        "--qq2007-usage-percent",
        `${usageData?.percent ?? 0}%`,
      );
    }

    const popover = document.getElementById(USAGE_POPOVER_ID);
    if (!popover) return;
    setTextOnce(
      popover.querySelector(".qq2007-usage-period"),
      usageData?.period || "Usage remaining",
    );
    setTextOnce(
      popover.querySelector(".qq2007-usage-number"),
      usageData?.remaining || "Reading…",
    );
    setTextOnce(
      popover.querySelector(".qq2007-usage-reset"),
      usageData?.reset ? `Resets ${usageData.reset}` : "Syncing with Codex",
    );
    setStyleOnce(
      popover.querySelector(".qq2007-usage-meter-fill"),
      "width",
      `${usageData?.percent ?? 0}%`,
    );
  };

  const positionUsagePopover = () => {
    const button = document.getElementById(USAGE_BUTTON_ID);
    const popover = document.getElementById(USAGE_POPOVER_ID);
    if (!button || !popover || popover.hidden) return;
    const anchor = button.getBoundingClientRect();
    const popup = popover.getBoundingClientRect();
    const left = Math.max(8, Math.min(anchor.left, innerWidth - popup.width - 8));
    const top = Math.max(8, anchor.top - popup.height - 8);
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  };

  const captureUsage = async () => {
    if (usageCaptureInFlight || window.__CODEX_NATIVE_2007_DISABLED__) return;
    const profile = document.querySelector(
      'button[aria-label="Open profile menu"]',
    );
    if (!profile) return;

    usageCaptureInFlight = true;
    const focused = document.activeElement;
    const profileWasOpen = profile.dataset.state === "open";
    document.documentElement.classList.add("qq2007-usage-capturing");
    try {
      if (!profileWasOpen) {
        activate(profile);
        await wait(120);
      }
      const native = nativeUsageGroup();
      if (!native) return;
      if (native.group.dataset.state !== "open") {
        activate(native.item);
        await wait(180);
      }
      usageData = readNativeUsage() || usageData;
      updateUsageUI();
    } finally {
      if (!profileWasOpen && profile.dataset.state === "open") {
        activate(profile);
        await wait(80);
      }
      document.documentElement.classList.remove("qq2007-usage-capturing");
      if (focused instanceof HTMLElement && focused.isConnected) {
        focused.focus({ preventScroll: true });
      }
      usageCaptureInFlight = false;
    }
  };

  const ensureUsagePopover = () => {
    let popover = document.getElementById(USAGE_POPOVER_ID);
    if (popover) return popover;
    popover = document.createElement("div");
    popover.id = USAGE_POPOVER_ID;
    popover.className = "qq2007-usage-popover";
    popover.hidden = true;
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "Usage remaining");

    const heading = document.createElement("div");
    heading.className = "qq2007-usage-heading";
    heading.textContent = "Usage remaining";
    const row = document.createElement("div");
    row.className = "qq2007-usage-row";
    const period = document.createElement("span");
    period.className = "qq2007-usage-period";
    const number = document.createElement("strong");
    number.className = "qq2007-usage-number";
    row.append(period, number);
    const meter = document.createElement("div");
    meter.className = "qq2007-usage-meter";
    const fill = document.createElement("span");
    fill.className = "qq2007-usage-meter-fill";
    meter.append(fill);
    const reset = document.createElement("div");
    reset.className = "qq2007-usage-reset";
    popover.append(heading, row, meter, reset);
    document.body.appendChild(popover);
    updateUsageUI();
    return popover;
  };

  const toggleUsagePopover = () => {
    const button = document.getElementById(USAGE_BUTTON_ID);
    const popover = ensureUsagePopover();
    const opening = popover.hidden;
    popover.hidden = !opening;
    button?.setAttribute("aria-expanded", String(opening));
    if (!opening) return;
    updateUsageUI();
    requestAnimationFrame(positionUsagePopover);
    void captureUsage().then(() => {
      updateUsageUI();
      positionUsagePopover();
    });
  };

  const closeUsagePopover = () => {
    const popover = document.getElementById(USAGE_POPOVER_ID);
    if (!popover || popover.hidden) return;
    popover.hidden = true;
    document
      .getElementById(USAGE_BUTTON_ID)
      ?.setAttribute("aria-expanded", "false");
  };

  const onUsageOutsidePointerDown = (event) => {
    if (
      usageCaptureInFlight ||
      document.documentElement.classList.contains("qq2007-usage-capturing")
    ) return;
    const button = document.getElementById(USAGE_BUTTON_ID);
    const popover = document.getElementById(USAGE_POPOVER_ID);
    if (
      popover &&
      !popover.hidden &&
      !popover.contains(event.target) &&
      !button?.contains(event.target)
    ) {
      closeUsagePopover();
    }
  };

  const onUsageKeyDown = (event) => {
    if (event.key === "Escape") {
      closeUsagePopover();
      closePalettePopover();
    }
  };

  const readPalette = () => {
    try {
      const stored = localStorage.getItem(PALETTE_STORAGE_KEY);
      if (PALETTES.some(({ id }) => id === stored)) return stored;
    } catch {}
    return "pink";
  };

  const applyPalette = (paletteId, persist = false) => {
    const palette = PALETTES.find(({ id }) => id === paletteId) || PALETTES[0];
    if (document.documentElement.dataset.qq2007Palette !== palette.id) {
      document.documentElement.dataset.qq2007Palette = palette.id;
    }
    const trigger = document.getElementById(PALETTE_BUTTON_ID);
    if (trigger) {
      const title = `当前配色：${palette.label}`;
      if (trigger.title !== title) trigger.title = title;
      setAttributeOnce(trigger, "aria-label", `切换配色，当前为${palette.label}`);
      if (trigger.dataset.palette !== palette.id) {
        trigger.dataset.palette = palette.id;
      }
    }
    document
      .querySelectorAll(`#${PALETTE_POPOVER_ID} [data-palette]`)
      .forEach((option) => {
        const selected = option.dataset.palette === palette.id;
        setClassOnce(option, "is-selected", selected);
        setAttributeOnce(option, "aria-checked", selected);
      });
    if (persist) {
      try {
        if (localStorage.getItem(PALETTE_STORAGE_KEY) !== palette.id) {
          localStorage.setItem(PALETTE_STORAGE_KEY, palette.id);
        }
      } catch {}
    }
  };

  const closePalettePopover = () => {
    const popover = document.getElementById(PALETTE_POPOVER_ID);
    const trigger = document.getElementById(PALETTE_BUTTON_ID);
    if (!popover || popover.hidden) return;
    popover.hidden = true;
    trigger?.setAttribute("aria-expanded", "false");
  };

  const togglePalettePopover = () => {
    const popover = document.getElementById(PALETTE_POPOVER_ID);
    const trigger = document.getElementById(PALETTE_BUTTON_ID);
    if (!popover || !trigger) return;
    const opening = popover.hidden;
    popover.hidden = !opening;
    trigger.setAttribute("aria-expanded", String(opening));
    if (opening) closeUsagePopover();
  };

  const onPaletteOutsidePointerDown = (event) => {
    const popover = document.getElementById(PALETTE_POPOVER_ID);
    const trigger = document.getElementById(PALETTE_BUTTON_ID);
    if (
      popover &&
      !popover.hidden &&
      !popover.contains(event.target) &&
      !trigger?.contains(event.target)
    ) {
      closePalettePopover();
    }
  };

  const ensurePaletteControl = () => {
    let trigger = document.getElementById(PALETTE_BUTTON_ID);
    let popover = document.getElementById(PALETTE_POPOVER_ID);
    if (!trigger) {
      trigger = document.createElement("button");
      trigger.id = PALETTE_BUTTON_ID;
      trigger.className = "qq2007-palette-button";
      trigger.type = "button";
      trigger.setAttribute("aria-haspopup", "menu");
      trigger.setAttribute("aria-controls", PALETTE_POPOVER_ID);
      trigger.setAttribute("aria-expanded", "false");
      const icon = document.createElement("span");
      icon.className = "qq2007-palette-grid";
      icon.setAttribute("aria-hidden", "true");
      PALETTES.forEach(({ colors }) => {
        const swatch = document.createElement("i");
        swatch.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
        icon.appendChild(swatch);
      });
      trigger.appendChild(icon);
      trigger.addEventListener("click", togglePalettePopover);
      document.body.appendChild(trigger);
    }

    if (!popover) {
      popover = document.createElement("div");
      popover.id = PALETTE_POPOVER_ID;
      popover.className = "qq2007-palette-popover";
      popover.hidden = true;
      popover.setAttribute("role", "menu");
      popover.setAttribute("aria-label", "Codex 2007 配色");
      const heading = document.createElement("div");
      heading.className = "qq2007-palette-heading";
      heading.textContent = "选择配色";
      popover.appendChild(heading);
      PALETTES.forEach(({ id, label, colors }) => {
        const option = document.createElement("button");
        option.type = "button";
        option.className = "qq2007-palette-option";
        option.dataset.palette = id;
        option.setAttribute("role", "menuitemradio");
        const swatch = document.createElement("span");
        swatch.className = "qq2007-palette-swatch";
        swatch.style.background = `linear-gradient(135deg, ${colors[0]}, ${colors[1]})`;
        const text = document.createElement("span");
        text.textContent = label;
        const check = document.createElement("span");
        check.className = "qq2007-palette-check";
        check.textContent = "✓";
        option.append(swatch, text, check);
        option.addEventListener("click", () => {
          applyPalette(id, true);
          closePalettePopover();
        });
        popover.appendChild(option);
      });
      document.body.appendChild(popover);
    }
    applyPalette(
      document.documentElement.dataset.qq2007Palette || readPalette(),
      false,
    );
  };

  const scheduleUsageCapture = () => {
    if (usageData || usageCaptureTimer || usageCaptureInFlight) return;
    usageCaptureTimer = setTimeout(() => {
      usageCaptureTimer = null;
      const active = document.activeElement;
      const composerFocused = active?.closest?.(".composer-surface-chrome");
      const anotherMenuOpen = [...document.querySelectorAll('[role="menu"]')]
        .some((menu) => menu.getBoundingClientRect().width > 0);
      if (composerFocused || anotherMenuOpen) {
        scheduleUsageCapture();
        return;
      }
      void captureUsage();
    }, 1600);
  };

  const decorateIcon = (control, className) => {
    if (!control) return false;
    const primary = control.matches('[class~="group/folder-row"]')
      ? control.firstElementChild?.querySelector("svg")
      : control.querySelector("svg");
    if (!primary?.parentElement) return false;
    addClassesOnce(primary, "qq2007-native-icon");
    addClassesOnce(primary.parentElement, "qq2007-icon-host", className);
    return true;
  };

  const decorateNativeIcons = (sidebar) => {
    const exactButton = (label) => [...sidebar.querySelectorAll("button")]
      .find((button) => button.innerText.trim() === label);

    decorateIcon(exactButton("New chat"), "qq2007-icon-new-task");
    decorateIcon(exactButton("Scheduled"), "qq2007-icon-scheduled");
    decorateIcon(exactButton("Plugins"), "qq2007-icon-plugins");
    decorateIcon(exactButton("Pull requests"), "qq2007-icon-pull-requests");
    decorateIcon(exactButton("Sites"), "qq2007-icon-sites");
    decorateIcon(
      sidebar.querySelector('button[aria-label="Search"]'),
      "qq2007-icon-search",
    );
    decorateIcon(
      sidebar.querySelector('button[aria-label="Open help menu"]'),
      "qq2007-icon-help",
    );
    decorateIcon(
      sidebar.querySelector('button[aria-label="Quick chat"]'),
      "qq2007-icon-quick-chat",
    );

    sidebar.querySelectorAll('[class~="group/folder-row"][aria-label]').forEach((row) => {
      decorateIcon(row, "qq2007-icon-project");
    });

    document.querySelectorAll('button[aria-label="Add files and more"]').forEach((button) => {
      decorateIcon(button, "qq2007-icon-attach");
    });
  };

  const FORUM_ACTION_LABELS = new Map([
    ["Copy", "复制"],
    ["Good response", "支持"],
    ["Bad response", "反对"],
    ["Continue in new chat from here", "另开主题"],
    ["Hooks", "工具"],
  ]);

  const decorateForumReplies = (main) => {
    main.querySelectorAll('[class*="_markdownContent_"]').forEach((content) => {
      const userBubble = content.closest(
        '[class~="bg-token-foreground/5"][class~="rounded-2xl"]',
      );
      if (userBubble) {
        const userMessage = userBubble.parentElement;
        if (
          userMessage?.classList.contains("group") &&
          userMessage.classList.contains("items-end")
        ) {
          addClassesOnce(userMessage, "qq2007-user-message");
          addClassesOnce(userBubble, "qq2007-user-bubble");
        }
        return;
      }

      const post = content.parentElement;
      if (
        !post?.classList.contains("group") ||
        !post.classList.contains("flex") ||
        !post.classList.contains("min-w-0") ||
        !post.classList.contains("flex-col")
      ) {
        return;
      }

      addClassesOnce(post, "qq2007-forum-post");
      addClassesOnce(content, "qq2007-forum-content");

      const extras = [...post.children].find(
        (node) =>
          node !== content &&
          Boolean(
            node.querySelector(
              '[class~="group/end-resource"], [class~="group/turn-diff-header"]',
            ),
          ),
      );
      if (extras) {
        addClassesOnce(extras, "qq2007-forum-extras");
        extras
          .querySelectorAll('[class~="group/end-resource"]')
          .forEach((header) => {
            addClassesOnce(header.parentElement, "qq2007-forum-resource-card");
          });
        extras
          .querySelectorAll('[class~="group/turn-diff-header"]')
          .forEach((header) => {
            addClassesOnce(header.parentElement, "qq2007-forum-diff-card");
          });
      }

      const actionButton = post.querySelector(
        ':scope button[aria-label="Good response"], :scope button[aria-label="Bad response"]',
      );
      let actionBar = actionButton;
      while (actionBar?.parentElement && actionBar.parentElement !== post) {
        actionBar = actionBar.parentElement;
      }
      if (!actionBar || actionBar.parentElement !== post) return;

      addClassesOnce(actionBar, "qq2007-forum-actions");
      actionBar.querySelectorAll("button[aria-label]").forEach((button) => {
        const label = FORUM_ACTION_LABELS.get(button.getAttribute("aria-label"));
        if (label) setAttributeOnce(button, "data-qq2007-forum-label", label);
      });

      const time = [...actionBar.querySelectorAll("span")].find((node) =>
        /^\d{1,2}:\d{2}(?:\s*[AP]M)?$/i.test(node.textContent.trim()),
      );
      addClassesOnce(time, "qq2007-forum-time");
    });
  };

  const decorateSystemRows = (main) => {
    main.querySelectorAll('[class~="group/activity-header"]').forEach((row) => {
      addClassesOnce(row, "qq2007-system-row");
    });

    const walker = document.createTreeWalker(main, NodeFilter.SHOW_TEXT);
    const reconnectPattern = /^Reconnecting(?:\s+\d+\/\d+)?$/i;
    let textNode = walker.nextNode();
    while (textNode) {
      if (reconnectPattern.test(textNode.nodeValue.trim())) {
        const label = textNode.parentElement;
        const activityRows = [];
        let ancestor = label;
        while (ancestor && ancestor !== main) {
          if (
            ancestor.classList?.contains("group/activity-header") &&
            reconnectPattern.test(ancestor.textContent.trim())
          ) {
            activityRows.push(ancestor);
          }
          ancestor = ancestor.parentElement;
        }

        let row = activityRows.at(-1) ?? label;
        while (
          row &&
          row !== main &&
          (!row.querySelector("svg") || !reconnectPattern.test(row.textContent.trim()))
        ) {
          row = row.parentElement;
        }
        if (row && row !== main) {
          addClassesOnce(row, "qq2007-system-row", "qq2007-system-reconnect");
          let nested = label;
          while (nested && nested !== row) {
            nested.classList?.remove("qq2007-system-row", "qq2007-system-reconnect");
            nested = nested.parentElement;
          }
        }
      }
      textNode = walker.nextNode();
    }
  };

  const decorateWorkHeadings = (main) => {
    const workPattern = /^(Worked|Working) for\s+(.+)$/i;
    main.querySelectorAll("span.text-token-conversation-body").forEach((label) => {
      const match = label.textContent.trim().match(workPattern);
      if (!match) return;

      const [, state, duration] = match;
      const summaryButton = label.closest('button[aria-expanded]');
      if (summaryButton) {
        const heading = summaryButton.parentElement;
        addClassesOnce(heading, "qq2007-work-heading");
        addClassesOnce(summaryButton, "qq2007-work-summary-button");
        addClassesOnce(label, "qq2007-work-duration");
        setAttributeOnce(label, "data-qq2007-work-duration", `耗时 ${duration}`);
        return;
      }

      const liveHeading = label.parentElement;
      if (
        state.toLowerCase() === "working" &&
        liveHeading?.querySelector(':scope > [class~="w-full"][class~="border-t"]')
      ) {
        addClassesOnce(liveHeading, "qq2007-work-heading", "qq2007-work-live");
        addClassesOnce(label, "qq2007-work-duration");
        setAttributeOnce(label, "data-qq2007-work-duration", `处理中 · ${duration}`);
      }
    });
  };

  const decorateComposer = () => {
    document.querySelectorAll(".composer-surface-chrome").forEach((surface) => {
      if (surface.classList.contains("qq2007-composer-shell")) {
        surface.classList.remove("qq2007-composer-shell");
        surface.style.removeProperty("border-color");
        surface.style.removeProperty("border-style");
        surface.style.removeProperty("border-width");
      }

      surface
        .querySelectorAll('[class*="_attachmentsDefault_"]')
        .forEach((attachments) => {
          const isEmpty =
            attachments.childElementCount === 0 &&
            attachments.textContent.trim() === "";
          setClassOnce(attachments, "qq2007-composer-empty-attachments", isEmpty);
        });

      const addContext = surface.querySelector(
        '[data-composer-navigation-target="add-context"]',
      );
      const reasoning = surface.querySelector(
        '[data-composer-navigation-target="reasoning"]',
      );
      const editor = surface.querySelector("[data-codex-composer]");
      if (!addContext || !reasoning || !editor) return;

      let footer = addContext;
      while (footer && footer !== surface && !footer.contains(reasoning)) {
        footer = footer.parentElement;
      }
      if (!footer || footer === surface) return;

      addClassesOnce(footer, "qq2007-composer-footer");
      const editorRow = [...footer.children].find((child) => child.contains(editor));
      addClassesOnce(editorRow, "qq2007-composer-editor");
      const toolRows = [...footer.children].filter((child) => child !== editorRow);
      toolRows.forEach((row) => addClassesOnce(row, "qq2007-composer-tools"));
      addClassesOnce(toolRows[0], "qq2007-composer-left-tools");
      addClassesOnce(toolRows.at(-1), "qq2007-composer-right-tools");

      const leftTools = toolRows[0]?.querySelector(":scope > .flex");
      if (leftTools && !document.getElementById(USAGE_BUTTON_ID)) {
        const button = document.createElement("button");
        button.id = USAGE_BUTTON_ID;
        button.className = "qq2007-usage-button";
        button.type = "button";
        button.setAttribute("aria-controls", USAGE_POPOVER_ID);
        button.setAttribute("aria-expanded", "false");
        button.setAttribute("aria-label", "View usage remaining");
        const gauge = document.createElement("span");
        gauge.className = "qq2007-usage-gauge";
        gauge.setAttribute("aria-hidden", "true");
        const value = document.createElement("span");
        value.className = "qq2007-usage-value";
        button.append(gauge, value);
        button.addEventListener("pointerdown", (event) => {
          event.stopPropagation();
        });
        button.addEventListener("click", (event) => {
          event.stopPropagation();
          toggleUsagePopover();
        });
        const permissions = leftTools.querySelector(
          '[data-composer-navigation-target="permissions"]',
        );
        const permissionsHost = permissions?.closest('[aria-haspopup="menu"]');
        const anchor =
          permissionsHost && leftTools.contains(permissionsHost)
            ? permissionsHost
            : permissions;
        if (anchor?.parentElement === leftTools) {
          anchor.insertAdjacentElement("afterend", button);
        } else {
          leftTools.appendChild(button);
        }
        updateUsageUI();
      }
    });
  };

  const ensure = () => {
    if (window.__CODEX_NATIVE_2007_DISABLED__) return false;
    const root = document.documentElement;
    const sidebar = document.querySelector("aside.app-shell-left-panel");
    const main = document.querySelector("main.main-surface");
    if (!root || !document.body || !sidebar || !main) return false;

    addClassesOnce(root, "codex-native2007", "dream-theme-light");
    const workspace = sidebar.parentElement;
    if (workspace?.contains(main)) {
      addClassesOnce(workspace, "qq2007-workspace-shell");
    }

    let style = document.getElementById(STYLE_ID);
    if (!style) {
      style = document.createElement("style");
      style.id = STYLE_ID;
      (document.head || root).appendChild(style);
    }
    if (style.textContent !== cssText) style.textContent = cssText;

    let chrome = document.getElementById(CHROME_ID);
    if (!chrome || chrome.parentElement !== document.body) {
      chrome?.remove();
      chrome = document.createElement("div");
      chrome.id = CHROME_ID;
      chrome.setAttribute("aria-hidden", "true");
      document.body.appendChild(chrome);
    }

    const home = document.querySelector('[role="main"]:has([data-testid="home-icon"])');
    for (const candidate of document.querySelectorAll('[role="main"]')) {
      setClassOnce(candidate, "dream-home", candidate === home);
      setClassOnce(candidate, "dream-task", candidate !== home);
    }
    setClassOnce(main, "dream-home-shell", Boolean(home));
    setClassOnce(root, "dream-home-shell", Boolean(home));
    if (!root.dataset.qq2007Palette) applyPalette(readPalette(), false);
    ensurePaletteControl();
    decorateNativeIcons(sidebar);
    decorateForumReplies(main);
    decorateSystemRows(main);
    decorateWorkHeadings(main);
    decorateComposer();
    scheduleUsageCapture();
    return true;
  };

  const scheduleEnsure = () => {
    if (scheduled || window.__CODEX_NATIVE_2007_DISABLED__) return;
    scheduled = true;
    setTimeout(() => {
      scheduled = false;
      ensure();
    }, 80);
  };

  const mutationTouchesDecoratedUI = (record) => {
    const target = record.target;
    if (
      target instanceof Element &&
      target.closest(
        ".composer-surface-chrome, aside.app-shell-left-panel, main.main-surface",
      )
    ) {
      return true;
    }

    const selector = [
      "aside.app-shell-left-panel",
      "main.main-surface",
      ".composer-surface-chrome",
      '[role="main"]',
      `#${PALETTE_BUTTON_ID}`,
      `#${PALETTE_POPOVER_ID}`,
      `#${USAGE_BUTTON_ID}`,
      `#${USAGE_POPOVER_ID}`,
    ].join(", ");
    return [...record.addedNodes, ...record.removedNodes].some(
      (node) =>
        node instanceof Element &&
        (node.matches(selector) || Boolean(node.querySelector(selector))),
    );
  };

  const cleanup = () => {
    window.__CODEX_NATIVE_2007_DISABLED__ = true;
    observer?.disconnect();
    if (timer) clearInterval(timer);
    if (usageCaptureTimer) clearTimeout(usageCaptureTimer);
    document.removeEventListener("pointerdown", onUsageOutsidePointerDown, true);
    document.removeEventListener("pointerdown", onPaletteOutsidePointerDown, true);
    document.removeEventListener("keydown", onUsageKeyDown, true);
    window.removeEventListener("resize", positionUsagePopover);
    clearScopes();
    document.documentElement?.classList.remove(...ROOT_CLASSES);
    document.getElementById(STYLE_ID)?.remove();
    document.getElementById(CHROME_ID)?.remove();
    delete window[STATE_KEY];
    return true;
  };

  window[STATE_KEY]?.cleanup?.();
  window.__CODEX_NATIVE_2007_DISABLED__ = false;
  document.addEventListener("pointerdown", onUsageOutsidePointerDown, true);
  document.addEventListener("pointerdown", onPaletteOutsidePointerDown, true);
  document.addEventListener("keydown", onUsageKeyDown, true);
  window.addEventListener("resize", positionUsagePopover);

  ensure();
  observer = new MutationObserver((records) => {
    if (records.some(mutationTouchesDecoratedUI)) scheduleEnsure();
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
  });
  timer = setInterval(ensure, 3000);

  window[STATE_KEY] = {
    version: VERSION,
    cleanup,
    observer,
    timer,
    native2007: true,
  };

  return {
    installed: true,
    version: VERSION,
    native2007: true,
  };
})(__NATIVE2007_CSS_JSON__, __NATIVE2007_ART_JSON__, __NATIVE2007_CONFIG_JSON__);
