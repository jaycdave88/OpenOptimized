#!/usr/bin/env bash
#
# launch.sh — starts MicroFish-En's backend in a detached process. The UI
# then opens http://127.0.0.1:5000 (or the emitted URL) in the user's
# default browser. AGPL isolation: MicroFish code never enters
# OpenOptimized's address space.

set -euo pipefail

TARGET="${1:-${HOME}/Library/Application Support/dev.openoptimized.app/microfish}"

if [[ ! -f "${TARGET}/INSTALLED.json" ]]; then
  printf '%s\n' '{"type":"error","stage":"preflight","message":"not installed"}'
  exit 2
fi

# shellcheck disable=SC1091
source "${TARGET}/venv/bin/activate"

# Most MicroFish-En deployments run `python app.py` or `flask run`. We try
# both; upstream-specific entry points can override via MICROFISH_ENTRY.
ENTRY="${MICROFISH_ENTRY:-app.py}"
cd "${TARGET}/repo"

nohup python "${ENTRY}" >"${TARGET}/microfish.log" 2>&1 &
PID=$!

printf '{"type":"started","pid":%d,"url":"http://127.0.0.1:5000","log":"%s/microfish.log"}\n' "${PID}" "${TARGET}"
echo "${PID}" > "${TARGET}/microfish.pid"
