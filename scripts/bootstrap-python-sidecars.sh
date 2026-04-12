#!/usr/bin/env bash
#
# bootstrap-python-sidecars.sh
#
# Create isolated Python venvs for the DeerFlow and autoresearch sidecars.
# Invoked on first use of those modes (not at app install) so we don't pay
# the cost for users who never leave Chat mode.
#
# Arguments:
#   $1  target venv dir (e.g. $APPSUPPORT/OpenOptimized/deerflow/venv)
#   $2  sidecar name   (deerflow | autoresearch)
#   $3  pinned git ref  (commit SHA from scripts/fetch-mcp-bins.ts manifest)
#
# Requires Python 3.12 on PATH. If missing, we emit a JSON error the UI can
# render into a "brew install python@3.12" prompt.

set -euo pipefail

VENV_DIR="${1:?missing venv dir}"
SIDECAR="${2:?missing sidecar name}"
REF="${3:?missing pinned git ref}"

case "${SIDECAR}" in
  deerflow)     REPO_URL="https://github.com/jaycdave88/deer-flow.git" ;;
  autoresearch) REPO_URL="https://github.com/jaycdave88/autoresearch.git" ;;
  *) echo "{\"error\":\"unknown sidecar: ${SIDECAR}\"}" >&2; exit 1 ;;
esac

if ! command -v python3.12 >/dev/null; then
  cat >&2 <<JSON
{"error":"python312_missing","hint":"brew install python@3.12","sidecar":"${SIDECAR}"}
JSON
  exit 2
fi

mkdir -p "$(dirname "${VENV_DIR}")"
if [[ ! -d "${VENV_DIR}" ]]; then
  python3.12 -m venv "${VENV_DIR}"
fi

# shellcheck disable=SC1090
source "${VENV_DIR}/bin/activate"

pip install --quiet --upgrade pip
pip install --quiet "git+${REPO_URL}@${REF}"

echo "{\"ok\":true,\"sidecar\":\"${SIDECAR}\",\"venv\":\"${VENV_DIR}\",\"ref\":\"${REF}\"}"
