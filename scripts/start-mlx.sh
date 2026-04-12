#!/usr/bin/env bash
# shellcheck shell=bash
# Needs bash 4+ for `mapfile`. macOS ships bash 3.2.
if [[ "${BASH_VERSINFO:-0}" -lt 4 ]]; then
  for candidate in /opt/homebrew/bin/bash /usr/local/bin/bash; do
    if [[ -x "$candidate" ]]; then
      exec "$candidate" "$0" "$@"
    fi
  done
  echo "error: this script needs bash 4+. Install via: brew install bash" >&2
  echo "       currently running: ${BASH_VERSION:-unknown}" >&2
  exit 1
fi
#
# start-mlx.sh — spawn one `mlx_lm.server` per model listed in the config.
#
# Config file is ./mlx-models.json by default (gitignored; copy
# mlx-models.example.json to start). Each model becomes an OpenAI-compatible
# HTTP server on its own port; after launch, register-mlx-providers.sh
# can be run to add them to the user's opencode.json.
#
# Usage:
#   ./scripts/start-mlx.sh                          # uses ./mlx-models.json
#   ./scripts/start-mlx.sh path/to/config.json      # explicit config
#   OO_USER_DATA_DIR=/path ./scripts/start-mlx.sh   # override state dir
#
# State:
#   $APPSUPPORT/dev.openoptimized.app/mlx/<id>.pid   — PID of each server
#   $APPSUPPORT/dev.openoptimized.app/mlx/<id>.log   — stdout + stderr
#
# Exits 0 if every model is healthy within the per-model timeout; non-zero
# and surfaces which failed otherwise.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
CONFIG="${1:-${ROOT}/mlx-models.json}"
USER_DATA_DIR="${OO_USER_DATA_DIR:-${HOME}/Library/Application Support/dev.openoptimized.app}"
MLX_DIR="${USER_DATA_DIR}/mlx"
# Default 120s; large MLX models (R1-class) can easily take > 30s to bind
# on a cold launch. Override per-invocation with OO_MLX_HEALTH_TIMEOUT=<seconds>
# or per-model by setting `timeout_s` in mlx-models.json.
HEALTH_TIMEOUT_DEFAULT="${OO_MLX_HEALTH_TIMEOUT:-120}"

if [[ ! -f "${CONFIG}" ]]; then
  cat >&2 <<EOF
!! MLX config not found: ${CONFIG}
   Copy the template and edit your model paths / ports:
     cp mlx-models.example.json mlx-models.json
     \$EDITOR mlx-models.json
EOF
  exit 2
fi

# Pick the best Python: require Python 3.12 if available, since
# mlx-lm + transformers expect 3.10+ and silently fail under macOS's
# system Python 3.9 (TokenizersBackend errors, etc.).
MLX_PYTHON=""
if command -v python3.12 >/dev/null && python3.12 -c "import mlx_lm" >/dev/null 2>&1; then
  MLX_PYTHON="python3.12"
elif command -v python3 >/dev/null && python3 -c "import sys,mlx_lm; sys.exit(0 if sys.version_info >= (3,10) else 1)" >/dev/null 2>&1; then
  MLX_PYTHON="python3"
fi

if [[ -z "${MLX_PYTHON}" ]]; then
  cat >&2 <<EOF
!! mlx-lm not installed in Python 3.10+.
   macOS ships Python 3.9, which mlx-lm does not support reliably.
   Install into Python 3.12 (from Homebrew):
     python3.12 -m pip install --user mlx-lm
   Then re-run this script.
EOF
  exit 3
fi

if ! command -v jq >/dev/null; then
  echo "!! jq is required (brew install jq)" >&2
  exit 4
fi

mkdir -p "${MLX_DIR}"
HOST="$(jq -r '.host // "127.0.0.1"' "${CONFIG}")"
COUNT="$(jq '.models | length' "${CONFIG}")"

if [[ "${COUNT}" -eq 0 ]]; then
  echo "[start-mlx] no models listed in ${CONFIG}; nothing to do."
  exit 0
fi

echo "[start-mlx] spawning ${COUNT} mlx_lm.server process(es) on ${HOST} (via ${MLX_PYTHON})"

wait_healthy() {
  local url="$1" model_id="$2" timeout="$3"
  local deadline=$(( $(date +%s) + timeout ))
  while (( $(date +%s) < deadline )); do
    if curl -sS --max-time 2 "${url}/v1/models" >/dev/null 2>&1; then
      return 0
    fi
    # Fail fast if the server process exited already (saves waiting out
    # the full timeout when the model path is wrong / mlx crashed).
    if [[ -f "${MLX_DIR}/${model_id}.pid" ]]; then
      local spid
      spid="$(cat "${MLX_DIR}/${model_id}.pid" 2>/dev/null || true)"
      if [[ -n "${spid}" ]] && ! kill -0 "${spid}" 2>/dev/null; then
        echo "!! ${model_id}: mlx_lm.server exited before binding; see ${MLX_DIR}/${model_id}.log" >&2
        return 1
      fi
    fi
    sleep 1
  done
  echo "!! ${model_id}: no response from ${url}/v1/models within ${timeout}s (last 10 log lines below)" >&2
  tail -n 10 "${MLX_DIR}/${model_id}.log" 2>/dev/null | sed 's/^/    /' >&2 || true
  return 1
}

# NOTE: read the jq output into an array first so the while-loop runs in
# the parent shell (a `jq | while` pipeline runs the while in a subshell,
# which silently discards any variable writes — including our fail counter).
mapfile -t _rows < <(jq -r '.models[] | [.id, .path, .port, (.timeout_s // "")] | @tsv' "${CONFIG}")

fail=0
for row in "${_rows[@]}"; do
  IFS=$'\t' read -r id path port row_timeout <<< "$row"
  pid_file="${MLX_DIR}/${id}.pid"
  log_file="${MLX_DIR}/${id}.log"
  url="http://${HOST}:${port}"
  timeout="${row_timeout:-${HEALTH_TIMEOUT_DEFAULT}}"

  if [[ -f "${pid_file}" ]] && kill -0 "$(cat "${pid_file}")" 2>/dev/null; then
    echo "  ${id}: already running (pid $(cat "${pid_file}"))"
    continue
  fi

  if [[ ! -d "${path}" ]]; then
    echo "  ${id}: !! path does not exist: ${path}" >&2
    fail=$((fail+1))
    continue
  fi

  echo "  ${id}: starting on ${url} (model: ${path}; health timeout ${timeout}s)"
  nohup "${MLX_PYTHON}" -m mlx_lm.server \
    --model "${path}" \
    --host "${HOST}" \
    --port "${port}" \
    >"${log_file}" 2>&1 &
  echo $! > "${pid_file}"

  if wait_healthy "${url}" "${id}" "${timeout}"; then
    echo "  ${id}: ok (pid $(cat "${pid_file}"))"
  else
    echo "  ${id}: !! failed health check; see ${log_file}" >&2
    fail=$((fail+1))
  fi
done

if (( fail > 0 )); then
  echo "[start-mlx] ${fail} model(s) failed to come up — see logs under ${MLX_DIR}/" >&2
  exit 1
fi

echo "[start-mlx] all models healthy. State dir: ${MLX_DIR}"
echo "[start-mlx] to register as OpenCode providers:"
echo "           ./scripts/register-mlx-providers.sh ${CONFIG}"
