#!/bin/zsh
set -euo pipefail

INSTALL_ROOT="$HOME/Library/Application Support/Codex Native 2007"
STATE_ROOT="$INSTALL_ROOT/state"
STATE_FILE="$STATE_ROOT/state.json"
INJECTOR="$INSTALL_ROOT/scripts/injector.mjs"
LOG_FILE="$STATE_ROOT/restore.log"
WATCHER_LABEL="io.github.shitsuten.codex-native2007.watcher"

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

read_state_field() {
  local field="$1"
  [[ -f "$STATE_FILE" ]] || return 1
  "$NODE" -e '
    const fs = require("fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"))[process.argv[2]];
    if (value !== undefined && value !== null) process.stdout.write(String(value));
  ' "$STATE_FILE" "$field" 2>/dev/null
}

NODE="$(find_node)" || {
  /usr/bin/osascript -e 'display dialog "没有找到兼容的 Node.js 22+，无法运行恢复脚本。" buttons {"好"} default button "好" with icon stop' >/dev/null 2>&1 || true
  exit 1
}

PORT="$(read_state_field port || true)"
BROWSER_ID="$(read_state_field browserId || true)"
INJECTOR_PID="$(read_state_field injectorPid || true)"

if [[ "$PORT" == <-> && -n "$BROWSER_ID" ]] &&
  /usr/bin/curl -fsS --max-time 1 "http://127.0.0.1:$PORT/json/version" >/dev/null 2>&1; then
  "$NODE" "$INJECTOR" --remove --port "$PORT" --browser-id "$BROWSER_ID" \
    --timeout-ms 15000 >"$LOG_FILE" 2>&1 || true
fi

if [[ "$INJECTOR_PID" == <-> ]] && kill -0 "$INJECTOR_PID" 2>/dev/null; then
  COMMAND="$(ps -p "$INJECTOR_PID" -o command= 2>/dev/null || true)"
  if [[ "$COMMAND" == *"$INJECTOR"* ]]; then
    kill "$INJECTOR_PID" 2>/dev/null || true
  fi
fi

/bin/launchctl remove "$WATCHER_LABEL" >/dev/null 2>&1 || true
rm -f "$STATE_FILE" "$STATE_ROOT/version.json"
/usr/bin/osascript -e 'display notification "已经恢复官方外观；以后从原来的 Codex 图标启动即可" with title "Codex Native 2007"' >/dev/null 2>&1 || true
exit 0
