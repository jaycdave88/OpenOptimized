#!/usr/bin/env bash
#
# restore-opencode-defaults.sh — merge resources/opencode.defaults.json
# into the user's opencode.json without overwriting existing user state.
#
# Solves: oo_bootstrap inside the app sometimes can't locate the bundled
# opencode.defaults.json at runtime (path layout inside the .app bundle),
# leaving the user's opencode.json missing the `mcp` block and other
# defaults. This script does the same smart-merge from the shell, using
# the repo's resources/opencode.defaults.json as the source of truth.
#
# Semantics: `jq -s '.[0] * .[1]'` does a DEEP merge where the
# right-hand side wins on conflicts. We put defaults first, user's
# existing JSON second — so every key the user already has is preserved,
# and keys only present in defaults (mcp, model, small_model, flash-moe
# provider, etc.) are added.
#
# Usage:
#   ./scripts/restore-opencode-defaults.sh
#   OO_USER_DATA_DIR=/path ./scripts/restore-opencode-defaults.sh
#
# After running, restart OpenOptimized so OpenCode picks up the new mcp
# block.

set -euo pipefail

ASSUME_YES=0
NO_RELAUNCH=0
for arg in "$@"; do
  case "$arg" in
    --yes|-y)       ASSUME_YES=1 ;;
    --no-relaunch)  NO_RELAUNCH=1 ;;
    -h|--help)
      sed -n '1,25p' "$0"
      exit 0
      ;;
    *) echo "unknown flag: $arg" >&2; exit 2 ;;
  esac
done

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
USER_DATA_DIR="${OO_USER_DATA_DIR:-${HOME}/Library/Application Support/dev.openoptimized.app}"
OPENCODE_JSON="${USER_DATA_DIR}/opencode.json"
DEFAULTS="${ROOT}/resources/opencode.defaults.json"

# Helper: confirm unless --yes was passed.
confirm() {
  local prompt="$1"
  if [[ "${ASSUME_YES}" == "1" ]]; then return 0; fi
  read -r -p "${prompt} [Y/n] " reply
  [[ -z "${reply}" || "${reply}" =~ ^[Yy]$ ]]
}

# Helper: detect a running OpenOptimized.app. Tauri bundles it as
# OpenWork-Dev (see apps/desktop/src-tauri/Cargo.toml default-run), so
# we match on the binary name. `|| true` keeps this safe under
# set -euo pipefail when nothing matches (pgrep exits 1).
detect_running_app() {
  ( pgrep -f "OpenWork-Dev" 2>/dev/null || true ) | head -1
}

# Helper: find the built .app bundle on disk.
find_app_bundle() {
  local candidate="${ROOT}/apps/desktop/src-tauri/target/release/bundle/macos/OpenOptimized.app"
  if [[ -d "${candidate}" ]]; then
    printf '%s' "${candidate}"
    return 0
  fi
  return 1
}

if [[ ! -f "${DEFAULTS}" ]]; then
  echo "!! ${DEFAULTS} not found; run from the repo root" >&2
  exit 2
fi

if ! command -v jq >/dev/null; then
  echo "!! jq required (brew install jq)" >&2
  exit 3
fi

mkdir -p "${USER_DATA_DIR}"

# The MCP run.sh launchers live under resources/mcp-bin/<name>/. Their
# absolute paths on this machine are ${ROOT}/resources/mcp-bin/<name>/run.sh.
# Substitute that into the __RESOURCE__ placeholder so opencode.json's
# mcp entries point at real scripts.
RESOURCES_DIR="${ROOT}/resources"
DEFAULTS_RESOLVED="$(mktemp)"
sed "s|__RESOURCE__|${RESOURCES_DIR}|g" "${DEFAULTS}" > "${DEFAULTS_RESOLVED}"

# Strip non-standard $schema / $comment fields so the resulting
# opencode.json stays valid for OpenCode's schema checker.
jq 'del(.["$schema"], .["$comment"])' "${DEFAULTS_RESOLVED}" > "${DEFAULTS_RESOLVED}.clean"
mv "${DEFAULTS_RESOLVED}.clean" "${DEFAULTS_RESOLVED}"

if [[ ! -f "${OPENCODE_JSON}" ]]; then
  cp "${DEFAULTS_RESOLVED}" "${OPENCODE_JSON}"
  echo "[restore] created fresh opencode.json from defaults"
  rm -f "${DEFAULTS_RESOLVED}"
  exit 0
fi

# Back up before touching.
BACKUP="${OPENCODE_JSON}.bak.$(date +%s)"
cp "${OPENCODE_JSON}" "${BACKUP}"

# Strip $schema/$comment from user's too, in case they leaked in from a
# previous run.
jq 'del(.["$schema"], .["$comment"])' "${OPENCODE_JSON}" > "${OPENCODE_JSON}.clean"
mv "${OPENCODE_JSON}.clean" "${OPENCODE_JSON}"

# Deep-merge. Right side wins -> user values preserved.
MERGED="$(mktemp)"
jq -s '.[0] * .[1]' "${DEFAULTS_RESOLVED}" "${OPENCODE_JSON}" > "${MERGED}"
mv "${MERGED}" "${OPENCODE_JSON}"
rm -f "${DEFAULTS_RESOLVED}"

# Re-sync the Ollama models list so `provider.ollama.models` matches the
# user's actual install (the merge would otherwise include the default
# demo model list). Safe no-op if Ollama isn't running.
if [[ -x "${ROOT}/scripts/sync-ollama-models.sh" ]]; then
  OO_USER_DATA_DIR="${USER_DATA_DIR}" OO_SYNC_NO_RELAUNCH=1 \
    "${ROOT}/scripts/sync-ollama-models.sh" 2>&1 | sed 's/^/  /' || true
fi

# Report what changed.
echo "[restore] merged defaults into ${OPENCODE_JSON}"
echo "[restore] backup: ${BACKUP}"
echo ""
echo "keys in merged opencode.json:"
jq -r 'paths | select(length <= 2) | map(tostring) | join(".")' "${OPENCODE_JSON}" | sort -u | head -40
echo ""
echo "Providers now configured:"
jq -r '.provider | keys[]' "${OPENCODE_JSON}" | sed 's/^/  - /'
echo ""
echo "MCP servers now configured:"
jq -r '.mcp // {} | keys[]' "${OPENCODE_JSON}" | sed 's/^/  - /'
echo ""

# -----------------------------------------------------------------------
# Offer to relaunch OpenOptimized.app so OpenCode picks up the new file.
# -----------------------------------------------------------------------

if [[ "${NO_RELAUNCH}" == "1" ]]; then
  echo "[restore] --no-relaunch set; restart OpenOptimized manually to activate."
  exit 0
fi

running_pid="$(detect_running_app || true)"
app_bundle="$(find_app_bundle || true)"

echo "[restore] running pid: ${running_pid:-<none>}"
echo "[restore] app bundle:  ${app_bundle:-<not found>}"

if [[ -n "${running_pid}" ]]; then
  if confirm "OpenOptimized is running (pid ${running_pid}). Relaunch it now to pick up the new opencode.json?"; then
    # Graceful quit first (via AppleScript), SIGKILL as a fallback after
    # a couple of seconds if it's still alive.
    osascript -e 'tell application "OpenOptimized" to quit' 2>/dev/null || \
      kill -TERM "${running_pid}" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      if ! kill -0 "${running_pid}" 2>/dev/null; then break; fi
      sleep 1
    done
    if kill -0 "${running_pid}" 2>/dev/null; then
      echo "[restore] app didn't exit cleanly; sending SIGKILL"
      kill -KILL "${running_pid}" 2>/dev/null || true
      sleep 1
    fi
    if [[ -n "${app_bundle}" ]]; then
      echo "[restore] launching ${app_bundle}"
      open "${app_bundle}"
    else
      echo "[restore] could not locate OpenOptimized.app; build with ./setup.sh or launch manually"
    fi
  else
    echo "[restore] left the running app alone; restart it manually to activate."
  fi
elif [[ -n "${app_bundle}" ]]; then
  if confirm "OpenOptimized.app is built but not running. Launch it now?"; then
    open "${app_bundle}"
  fi
else
  echo "[restore] no running app and no .app bundle found; run ./setup.sh to build first."
fi
