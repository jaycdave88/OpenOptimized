#!/usr/bin/env bash
#
# skip-onboarding.sh — force-dismiss the Setup overlay without clicking.
#
# Useful when the Tauri webview's click events aren't registering (window
# focus issues, hung JS, etc.) but you know your setup is already complete.
# This pokes localStorage via AppleScript + System Events JavaScript so
# the overlay is gone on the next reload.
#
# Usage:
#   ./scripts/skip-onboarding.sh
#
# Flow: activate the app, open devtools via the menu (if possible),
# fall back to `open` with a deeplink... but the most reliable path is
# to pkill + relaunch with a marker file that entry.tsx can detect.
#
# For now: we quit the app, stash a marker in $APPSUPPORT, and relaunch.
# entry.tsx checks this marker on mount and sets the localStorage flag
# if found (so the overlay stays dismissed from then on).

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
USER_DATA_DIR="${OO_USER_DATA_DIR:-${HOME}/Library/Application Support/dev.openoptimized.app}"
MARKER="${USER_DATA_DIR}/.skip-onboarding"
APP_BUNDLE="${ROOT}/apps/desktop/src-tauri/target/release/bundle/macos/OpenOptimized.app"

mkdir -p "${USER_DATA_DIR}"
date -u +%Y-%m-%dT%H:%M:%SZ > "${MARKER}"
echo "[skip-onboarding] marker written: ${MARKER}"

if pgrep -f "OpenWork-Dev" >/dev/null 2>&1; then
  echo "[skip-onboarding] quitting running app"
  osascript -e 'tell application "OpenOptimized" to quit' 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    pgrep -f "OpenWork-Dev" >/dev/null 2>&1 || break
    sleep 1
  done
  if pgrep -f "OpenWork-Dev" >/dev/null 2>&1; then
    echo "[skip-onboarding] graceful quit timed out; SIGKILL"
    pkill -KILL -f OpenWork-Dev 2>/dev/null || true
    sleep 1
  fi
fi

if [[ -d "${APP_BUNDLE}" ]]; then
  echo "[skip-onboarding] relaunching ${APP_BUNDLE}"
  open "${APP_BUNDLE}"
  echo "[skip-onboarding] done — the overlay should stay dismissed now."
  echo "To re-enable it later: rm \"${MARKER}\" (next launch shows it again)."
else
  echo "[skip-onboarding] no .app bundle found; run ./setup.sh to build"
  exit 1
fi
