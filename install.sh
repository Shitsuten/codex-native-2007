#!/bin/zsh
set -euo pipefail

if [[ "$(uname -s)" != "Darwin" ]]; then
  print -u2 -- "Codex Native 2007 currently supports macOS only."
  exit 1
fi

SOURCE="${0:A:h}"
DESTINATION="$HOME/Library/Application Support/Codex Native 2007"
DESKTOP="$HOME/Desktop"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/codex-native2007.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT

if [[ -x "$DESTINATION/bin/restore.sh" ]]; then
  "$DESTINATION/bin/restore.sh" >/dev/null 2>&1 || true
fi

mkdir -p "$STAGE/package" "$DESKTOP"
/usr/bin/ditto "$SOURCE/assets" "$STAGE/package/assets"
/usr/bin/ditto "$SOURCE/bin" "$STAGE/package/bin"
/usr/bin/ditto "$SOURCE/scripts" "$STAGE/package/scripts"
chmod +x "$STAGE/package/bin/"*.sh

rm -rf "$DESTINATION.previous"
if [[ -d "$DESTINATION" ]]; then
  mv "$DESTINATION" "$DESTINATION.previous"
fi
mkdir -p "${DESTINATION:h}"
mv "$STAGE/package" "$DESTINATION"
rm -rf "$DESTINATION.previous"

/usr/bin/ditto "$SOURCE/commands/Launch Codex Native 2007.command" "$DESKTOP/Launch Codex Native 2007.command"
/usr/bin/ditto "$SOURCE/commands/Restore Official Codex.command" "$DESKTOP/Restore Official Codex.command"
chmod +x "$DESKTOP/Launch Codex Native 2007.command" "$DESKTOP/Restore Official Codex.command"

/usr/bin/osascript -e 'display notification "桌面启动入口已经创建" with title "Codex Native 2007 安装完成"' >/dev/null 2>&1 || true
print -- "Installed to: $DESTINATION"
print -- "Launch from: $DESKTOP/Launch Codex Native 2007.command"
