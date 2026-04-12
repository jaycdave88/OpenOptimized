#!/usr/bin/env bash
#
# install.sh — user-initiated MicroFish-En installer.
#
# Clones jaycdave88/MicroFish-En into $APPSUPPORT/OpenOptimized/microfish/
# and bootstraps an isolated Python venv. AGPL-3.0 upstream; see
# resources/microfish/README.md for the license-isolation posture.
#
# Emits newline-delimited JSON on stdout.

set -euo pipefail

TARGET="${1:-${HOME}/Library/Application Support/dev.openoptimized.app/microfish}"
REPO_URL="https://github.com/jaycdave88/MicroFish-En"
PINNED_REF="${MICROFISH_REF:-main}"

emit() { printf '%s\n' "$1"; }

if ! command -v python3 >/dev/null; then
  emit '{"type":"error","stage":"preflight","message":"python3 not found"}'
  exit 2
fi
if ! command -v git >/dev/null; then
  emit '{"type":"error","stage":"preflight","message":"git not found"}'
  exit 2
fi

mkdir -p "${TARGET}"

emit "{\"type\":\"status\",\"stage\":\"clone\",\"ref\":\"${PINNED_REF}\"}"
rm -rf "${TARGET}/repo"
git clone --depth=1 --branch "${PINNED_REF}" "${REPO_URL}" "${TARGET}/repo" >/dev/null 2>&1 || {
  emit '{"type":"error","stage":"clone","message":"git clone failed"}'
  exit 3
}

emit '{"type":"status","stage":"venv"}'
python3 -m venv "${TARGET}/venv"
# shellcheck disable=SC1091
source "${TARGET}/venv/bin/activate"
pip install --quiet --upgrade pip

if [[ -f "${TARGET}/repo/requirements.txt" ]]; then
  emit '{"type":"status","stage":"pip-install"}'
  pip install --quiet -r "${TARGET}/repo/requirements.txt" || {
    emit '{"type":"error","stage":"pip-install","message":"pip install failed"}'
    exit 4
  }
fi

cat > "${TARGET}/INSTALLED.json" <<JSON
{
  "source": "${REPO_URL}",
  "ref": "${PINNED_REF}",
  "installed_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
  "target": "${TARGET}",
  "license": "AGPL-3.0"
}
JSON

emit "{\"type\":\"done\",\"target\":\"${TARGET}\"}"
