#!/usr/bin/env bash
#
# register-mlx-providers.sh — append or update MLX provider entries in the
# user's opencode.json.
#
# Each model in the config file becomes a provider named `mlx-<id>` with
# a single model whose id matches the server's `--model` response. Uses
# the `@ai-sdk/openai-compatible` provider package (same pattern as our
# Ollama entry) and the per-server baseURL http://host:port/v1.
#
# Re-running this is safe: providers are merged by key (overwrite the
# mlx-<id> block, leave other keys alone).
#
# Usage:
#   ./scripts/register-mlx-providers.sh                     # uses ./mlx-models.json
#   ./scripts/register-mlx-providers.sh path/to/config.json
#   OO_USER_DATA_DIR=/path ./scripts/register-mlx-providers.sh

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CONFIG="${1:-${ROOT}/mlx-models.json}"
USER_DATA_DIR="${OO_USER_DATA_DIR:-${HOME}/Library/Application Support/dev.openoptimized.app}"
OPENCODE_JSON="${USER_DATA_DIR}/opencode.json"

if [[ ! -f "${CONFIG}" ]]; then
  echo "!! MLX config not found: ${CONFIG}" >&2
  exit 2
fi

if ! command -v jq >/dev/null; then
  echo "!! jq is required (brew install jq)" >&2
  exit 3
fi

mkdir -p "${USER_DATA_DIR}"

# If opencode.json doesn't exist yet (user hasn't launched the app for the
# first-run bootstrap), create a minimal one so we can merge providers in.
if [[ ! -f "${OPENCODE_JSON}" ]]; then
  echo '{}' > "${OPENCODE_JSON}"
fi

HOST="$(jq -r '.host // "127.0.0.1"' "${CONFIG}")"
TMP="$(mktemp)"

jq --slurpfile cfg "${CONFIG}" --arg host "${HOST}" '
  . as $base
  | ($base.provider // {}) as $providers
  | ($cfg[0].models // []) as $models
  | reduce $models[] as $m ($providers;
      .["mlx-" + $m.id] = {
        npm: "@ai-sdk/openai-compatible",
        name: ($m.label // ("MLX " + $m.id)),
        options: { baseURL: ("http://" + $host + ":" + ($m.port | tostring) + "/v1") },
        models: {
          ($m.id): {
            name: ($m.label // $m.id),
            tools: ($m.tools // true),
            reasoning: ($m.reasoning // false),
            attachment: ($m.attachment // false)
          }
        }
      }
    )
  | . as $new_providers
  | $base + { provider: $new_providers }
' "${OPENCODE_JSON}" > "${TMP}"

mv "${TMP}" "${OPENCODE_JSON}"

# Summarise what landed.
echo "[register-mlx] providers now registered in ${OPENCODE_JSON}:"
jq -r '
  (.provider // {}) | to_entries | .[]
  | select(.key | startswith("mlx-"))
  | "  " + .key + "  ->  " + (.value.options.baseURL // "?")
' "${OPENCODE_JSON}"
