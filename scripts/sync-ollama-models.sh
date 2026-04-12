#!/usr/bin/env bash
# shellcheck shell=bash
# Needs bash 4+ for mapfile.
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
# sync-ollama-models.sh — populate the `ollama` provider's `models` map
# in the user's opencode.json with every model currently installed in
# Ollama. Idempotent: re-running overwrites the ollama provider's models
# map to exactly what Ollama reports; doesn't touch other providers or
# other top-level keys.
#
# Usage:
#   ./scripts/sync-ollama-models.sh
#   OO_USER_DATA_DIR=/path ./scripts/sync-ollama-models.sh

set -euo pipefail

USER_DATA_DIR="${OO_USER_DATA_DIR:-${HOME}/Library/Application Support/dev.openoptimized.app}"
OPENCODE_JSON="${USER_DATA_DIR}/opencode.json"

if ! command -v ollama >/dev/null; then
  echo "[sync-ollama] ollama CLI not found; skipping"
  exit 0
fi

if ! curl -s --max-time 1 http://127.0.0.1:11434/api/version >/dev/null 2>&1; then
  echo "[sync-ollama] ollama not running (skip: won't write models list)"
  exit 0
fi

if ! command -v jq >/dev/null; then
  echo "!! jq required (brew install jq)" >&2
  exit 2
fi

if [[ ! -f "${OPENCODE_JSON}" ]]; then
  echo "[sync-ollama] ${OPENCODE_JSON} missing — launch OpenOptimized first so oo_bootstrap can create it"
  exit 0
fi

# Pull the list of installed Ollama model names via HTTP (cleaner than
# parsing `ollama list`'s column output).
mapfile -t model_names < <(
  curl -s http://127.0.0.1:11434/api/tags |
    jq -r '.models[]?.name // empty' |
    sort -u
)

if [[ ${#model_names[@]} -eq 0 ]]; then
  echo "[sync-ollama] no models installed"
  exit 0
fi

# Build the models JSON object. Each entry is a minimal capability record;
# OpenCode only needs the key to present it as a selectable model.
models_json=$(printf '%s\n' "${model_names[@]}" | jq -R . | jq -s '
  [ .[] | {
      key: .,
      value: {
        name: .,
        tools: true,
        reasoning: false,
        attachment: false
      }
    }
  ] | from_entries
')

# Merge into opencode.json. We write the full models map (replacing whatever
# was there) but keep the rest of the ollama provider block untouched.
tmp="$(mktemp)"
jq --argjson models "${models_json}" '
  if (.provider // {}) | has("ollama") then
    .provider.ollama.models = $models
  else
    .provider = ((.provider // {}) + {
      ollama: {
        npm: "@ai-sdk/openai-compatible",
        name: "Ollama (local)",
        options: { baseURL: "http://127.0.0.1:11434/v1" },
        models: $models
      }
    })
  end
' "${OPENCODE_JSON}" > "${tmp}"

mv "${tmp}" "${OPENCODE_JSON}"

echo "[sync-ollama] wrote ${#model_names[@]} model(s) to ollama provider in ${OPENCODE_JSON}:"
printf '  %s\n' "${model_names[@]}"
