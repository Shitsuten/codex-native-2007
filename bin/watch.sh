#!/bin/zsh
set -u

if (( $# != 6 )); then
  exit 64
fi

LABEL="$1"
NODE="$2"
INJECTOR="$3"
PORT="$4"
BROWSER_ID="$5"
THEME_DIR="$6"

"$NODE" "$INJECTOR" --watch --port "$PORT" --browser-id "$BROWSER_ID" \
  --theme-dir "$THEME_DIR"
STATUS=$?

# A submitted job is otherwise kept alive by launchd. Remove this one-shot
# wrapper when Codex closes or its local debugging identity changes.
/bin/launchctl remove "$LABEL" >/dev/null 2>&1 || true
exit "$STATUS"
