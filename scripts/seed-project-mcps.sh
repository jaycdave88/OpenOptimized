#!/usr/bin/env bash
# shellcheck shell=bash
# Needs bash 4+ (for associative arrays in some edge cases; stays safe
# via auto-reexec into Homebrew bash).
if [[ "${BASH_VERSINFO:-0}" -lt 4 ]]; then
  for candidate in /opt/homebrew/bin/bash /usr/local/bin/bash; do
    if [[ -x "$candidate" ]]; then
      exec "$candidate" "$0" "$@"
    fi
  done
  echo "error: this script needs bash 4+. Install via: brew install bash" >&2
  exit 1
fi
#
# seed-project-mcps.sh — merge OpenOptimized's bundled MCP + provider
# defaults into a PROJECT's opencode.json.
#
# Why this exists: OpenCode / OpenWork's MCP panel reads opencode.json
# from the project directory (or $HOME/.config/opencode/opencode.json),
# NOT from $APPSUPPORT/dev.openoptimized.app/. Our oo_bootstrap has been
# writing to $APPSUPPORT — which means neither OpenCode nor the OpenWork
# UI ever sees our 4 bundled MCPs. This script writes them where they'll
# actually be picked up.
#
# Usage:
#   ./scripts/seed-project-mcps.sh                       # current dir
#   ./scripts/seed-project-mcps.sh /path/to/project      # explicit
#
# Semantics:
#   - Reads resources/opencode.defaults.json and substitutes __RESOURCE__
#     with the repo's absolute resources path.
#   - Strips $schema/$comment at any nesting.
#   - Deep-merges into <project>/opencode.json (right side — existing user
#     values — wins on conflict). Re-running never overwrites user edits.
#   - Creates the project opencode.json if missing.
#   - Backs up the existing file before touching it.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
PROJECT_DIR="${1:-$(pwd)}"
PROJECT_DIR="$(cd "${PROJECT_DIR}" && pwd)"   # absolute-ize
TARGET="${PROJECT_DIR}/opencode.json"
DEFAULTS="${ROOT}/resources/opencode.defaults.json"
RESOURCES_DIR="${ROOT}/resources"

if [[ ! -f "${DEFAULTS}" ]]; then
  echo "!! ${DEFAULTS} not found; run from the repo root" >&2
  exit 2
fi
if ! command -v jq >/dev/null; then
  echo "!! jq required (brew install jq)" >&2
  exit 3
fi

echo "[seed-project-mcps] project: ${PROJECT_DIR}"
echo "[seed-project-mcps] target:  ${TARGET}"

# Resolve __RESOURCE__ placeholders and strip non-standard fields.
resolved="$(mktemp)"
sed "s|__RESOURCE__|${RESOURCES_DIR}|g" "${DEFAULTS}" |
  jq 'walk(if type == "object" then with_entries(select(.key != "$schema" and .key != "$comment")) else . end)' \
  > "${resolved}"

if [[ ! -f "${TARGET}" ]]; then
  cp "${resolved}" "${TARGET}"
  echo "[seed-project-mcps] created fresh opencode.json"
else
  backup="${TARGET}.bak.$(date +%s)"
  cp "${TARGET}" "${backup}"
  # Also strip any stray $schema/$comment that may have leaked in before.
  cleaned_existing="$(mktemp)"
  jq 'walk(if type == "object" then with_entries(select(.key != "$schema" and .key != "$comment")) else . end)' \
    "${TARGET}" > "${cleaned_existing}"
  merged="$(mktemp)"
  # jq `*` = deep-merge, right side wins → user values preserved, our
  # defaults fill in any keys they didn't set.
  jq -s '.[0] * .[1]' "${resolved}" "${cleaned_existing}" > "${merged}"
  mv "${merged}" "${TARGET}"
  rm -f "${cleaned_existing}"
  echo "[seed-project-mcps] merged defaults into ${TARGET}"
  echo "[seed-project-mcps] backup: ${backup}"
fi
rm -f "${resolved}"

echo ""
echo "Providers now in project opencode.json:"
jq -r '.provider | keys[] | "  - \(.)"' "${TARGET}"
echo ""
echo "MCP servers now in project opencode.json:"
jq -r '.mcp | keys[] | "  - \(.)"' "${TARGET}"

# Offer to reconnect the OpenOptimized app so the Connected Apps list
# picks up the new block. Setting MCP config is picked up by a "Refresh"
# in the MCP panel too, which is less disruptive than a full restart.
echo ""
echo "Next: in OpenOptimized, open Settings → MCP servers → Refresh."
echo "      (or relaunch the app if the MCPs still don't appear)."
