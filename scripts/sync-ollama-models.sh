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

# Pick a sensible default model: first installed coding-oriented one,
# falling back to the first entry. Prevents opencode.json's top-level
# `.model` from pointing at a non-existent model like qwen2.5-coder:14b
# (the factory default) when the user doesn't have that one.
default_model="${model_names[0]}"
for name in "${model_names[@]}"; do
  case "$name" in
    *coder*|*coding*|*code*|*qwen*|*deepseek*)
      default_model="$name"
      break
      ;;
  esac
done
installed_keys_s=" $(printf '%s ' "${model_names[@]}")"

# Merge into opencode.json. We write the full models map (replacing
# whatever was there), keep the rest of the ollama provider block
# untouched, and fix up `.model` / `.small_model` if they point at an
# absent model.
tmp="$(mktemp)"
jq --argjson models "${models_json}" \
   --arg default_model "ollama/${default_model}" \
   --arg installed_keys "${installed_keys_s}" '
  # 1) Set or create the ollama provider with the canonical model map.
  (if (.provider // {}) | has("ollama") then
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
   end)
  # 2) Fix stale .model / .small_model. Save each stripped name to a
  #    binding first so inner pipelines do not rebind `.` to a string
  #    (which was what broke the previous version).
  | (.model // "")      as $cur_model
  | (.small_model // "") as $cur_small
  | (if ($cur_model | startswith("ollama/")) and
        (($installed_keys | contains(" " + ($cur_model | sub("^ollama/"; "")) + " ")) | not)
     then .model = $default_model
     else . end)
  | (if ($cur_small | startswith("ollama/")) and
        (($installed_keys | contains(" " + ($cur_small | sub("^ollama/"; "")) + " ")) | not)
     then .small_model = $default_model
     else . end)
' "${OPENCODE_JSON}" > "${tmp}"

mv "${tmp}" "${OPENCODE_JSON}"

echo "[sync-ollama] wrote ${#model_names[@]} model(s) to ollama provider in ${OPENCODE_JSON}:"
printf '  %s\n' "${model_names[@]}"

# If OpenOptimized is running, it cached the previous model list on its
# last read of opencode.json. Offer a relaunch so the new list shows up
# immediately. Skip if we're being called from another script (e.g.
# restore-opencode-defaults.sh) or under --no-relaunch.
if [[ "${OO_SYNC_NO_RELAUNCH:-0}" == "1" ]]; then
  exit 0
fi

running_pid="$( ( pgrep -f 'OpenWork-Dev' 2>/dev/null || true ) | head -1 || true )"
if [[ -z "${running_pid}" ]]; then
  exit 0
fi

read -r -p "[sync-ollama] OpenOptimized is running. Relaunch it to pick up the new model list? [y/N] " reply
if [[ "${reply}" =~ ^[Yy]$ ]]; then
  osascript -e 'tell application "OpenOptimized" to quit' 2>/dev/null || \
    kill -TERM "${running_pid}" 2>/dev/null || true
  for _ in 1 2 3 4 5; do
    kill -0 "${running_pid}" 2>/dev/null || break
    sleep 1
  done
  app_candidate="$(cd "$(dirname "$0")/.." && pwd)/apps/desktop/src-tauri/target/release/bundle/macos/OpenOptimized.app"
  if [[ -d "${app_candidate}" ]]; then
    open "${app_candidate}"
  fi
fi
