#!/usr/bin/env bash
#
# install.sh — user-initiated Flash-MoE installer.
#
# Downloads the Flash-MoE binary (jaycdave88/flash-moe) into
# $APPSUPPORT/OpenOptimized/flash-moe/. NOT run at `.app` install time —
# the user opts in from the UI or the terminal.
#
# Outputs newline-delimited JSON so the Tauri shell can surface progress
# and errors in the UI.
#
#   ./install.sh                         # default target dir
#   ./install.sh <target-dir>            # override target

set -euo pipefail

TARGET="${1:-${HOME}/Library/Application Support/dev.openoptimized.app/flash-moe}"
REPO_URL="https://github.com/jaycdave88/flash-moe"
PINNED_REF="${FLASH_MOE_REF:-main}"

emit() { printf '%s\n' "$1"; }
err()  { emit "{\"type\":\"error\",\"stage\":\"$1\",\"message\":$(printf '%s' "$2" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))')}"; }

arch="$(uname -m)"
os="$(uname -s)"

if [[ "${os}" != "Darwin" ]]; then
  err "preflight" "Flash-MoE requires macOS (found ${os})."
  exit 2
fi

if [[ "${arch}" != "arm64" ]]; then
  err "preflight" "Flash-MoE requires Apple Silicon (found ${arch})."
  exit 2
fi

emit "{\"type\":\"status\",\"stage\":\"preflight\",\"arch\":\"${arch}\",\"os\":\"${os}\"}"

mkdir -p "${TARGET}"

# Phase 4 placeholder: the real install flow fetches a tagged release
# artifact from the Flash-MoE repo. Until upstream publishes binaries, we
# clone the repo at the pinned ref so the directory layout is ready.
emit "{\"type\":\"status\",\"stage\":\"fetch\",\"ref\":\"${PINNED_REF}\"}"
if command -v git >/dev/null; then
  rm -rf "${TARGET}/repo"
  git clone --depth=1 --branch "${PINNED_REF}" "${REPO_URL}" "${TARGET}/repo" >/dev/null 2>&1 || {
    err "fetch" "git clone failed; network or ref invalid."
    exit 3
  }
else
  err "fetch" "git is not installed."
  exit 3
fi

# Write a marker file. Tauri `flash_moe_status` uses it to decide whether
# the install is complete.
cat > "${TARGET}/INSTALLED.json" <<JSON
{
  "source": "${REPO_URL}",
  "ref": "${PINNED_REF}",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "target": "${TARGET}"
}
JSON

emit "{\"type\":\"done\",\"target\":\"${TARGET}\"}"
