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

emit "{\"type\":\"status\",\"stage\":\"fetch\",\"ref\":\"${PINNED_REF}\"}"
if ! command -v git >/dev/null; then
  err "fetch" "git is not installed. Run: xcode-select --install"
  exit 3
fi
rm -rf "${TARGET}/repo"
if ! git clone --depth=1 --branch "${PINNED_REF}" "${REPO_URL}" "${TARGET}/repo" >/dev/null 2>&1; then
  err "fetch" "git clone failed; check network or ref."
  exit 3
fi

# Attempt to build the native binary if the repo has a Makefile or an
# Xcode project. Flash-MoE typically ships an Objective-C/Metal build
# that produces a `flash-moe` binary under repo/build/.
cd "${TARGET}/repo"
BUILD_OK=0
if [[ -f "Makefile" ]]; then
  emit "{\"type\":\"status\",\"stage\":\"make\"}"
  if make >"${TARGET}/build.log" 2>&1; then
    BUILD_OK=1
  else
    emit "{\"type\":\"warn\",\"stage\":\"make\",\"message\":\"make failed; see ${TARGET}/build.log\"}"
  fi
elif [[ -f "build.sh" ]]; then
  emit "{\"type\":\"status\",\"stage\":\"build.sh\"}"
  if bash build.sh >"${TARGET}/build.log" 2>&1; then
    BUILD_OK=1
  else
    emit "{\"type\":\"warn\",\"stage\":\"build.sh\",\"message\":\"build.sh failed; see ${TARGET}/build.log\"}"
  fi
else
  emit "{\"type\":\"info\",\"stage\":\"build\",\"message\":\"no Makefile or build.sh — review repo README for manual build steps\"}"
fi

# Weights are large and out-of-scope for this installer. If the repo has
# a `scripts/download-weights.sh`, surface it as a follow-up the user
# must run explicitly (don't auto-download multi-GB files).
if [[ -f "scripts/download-weights.sh" ]]; then
  emit "{\"type\":\"info\",\"stage\":\"weights\",\"message\":\"run scripts/download-weights.sh from ${TARGET}/repo when ready to fetch model weights\"}"
fi

cat > "${TARGET}/INSTALLED.json" <<JSON
{
  "source": "${REPO_URL}",
  "ref": "${PINNED_REF}",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "target": "${TARGET}",
  "build_succeeded": ${BUILD_OK}
}
JSON

emit "{\"type\":\"done\",\"target\":\"${TARGET}\",\"build_succeeded\":${BUILD_OK}}"
