#!/bin/zsh
set -euo pipefail

DESTINATION="$HOME/Library/Application Support/Codex Native 2007"
DESKTOP="$HOME/Desktop"

if [[ -x "$DESTINATION/bin/restore.sh" ]]; then
  "$DESTINATION/bin/restore.sh" >/dev/null 2>&1 || true
fi
/bin/launchctl remove "io.github.shitsuten.codex-native2007.watcher" >/dev/null 2>&1 || true
rm -rf "$DESTINATION" "$DESTINATION.previous"
rm -f "$DESKTOP/Launch Codex Native 2007.command" "$DESKTOP/Restore Official Codex.command"

print -- "Codex Native 2007 has been removed."
