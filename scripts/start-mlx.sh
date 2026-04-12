#!/usr/bin/env bash
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
HEALTH_TIMEOUT="${OO_MLX_HEALTH_TIMEOUT:-30}"

if [[ ! -f "${CONFIG}" ]]; then
  cat >&2 <<EOF
!! MLX config not found: ${CONFIG}
   Copy the template and edit your model paths / ports:
     cp mlx-models.example.json mlx-models.json
     \$EDITOR mlx-models.json
EOF
  exit 2
fi

if ! command -v mlx_lm.server >/dev/null; then
  cat >&2 <<EOF
!! mlx_lm.server not found on PATH.
   Install: pip install mlx-lm
   Or: pipx install mlx-lm
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

echo "[start-mlx] spawning ${COUNT} mlx_lm.server process(es) on ${HOST}"

wait_healthy() {
  local url="$1" model_id="$2"
  local deadline=$(( $(date +%s) + HEALTH_TIMEOUT ))
  while (( $(date +%s) < deadline )); do
    if curl -sS --max-time 2 "${url}/v1/models" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  echo "!! ${model_id}: no response from ${url}/v1/models within ${HEALTH_TIMEOUT}s" >&2
  return 1
}

fail=0
# shellcheck disable=SC2016
jq -r '.models[] | [.id, .path, .port] | @tsv' "${CONFIG}" | while IFS=$'\t' read -r id path port; do
  pid_file="${MLX_DIR}/${id}.pid"
  log_file="${MLX_DIR}/${id}.log"
  url="http://${HOST}:${port}"

  if [[ -f "${pid_file}" ]] && kill -0 "$(cat "${pid_file}")" 2>/dev/null; then
    echo "  ${id}: already running (pid $(cat "${pid_file}"))"
    continue
  fi

  if [[ ! -d "${path}" ]]; then
    echo "  ${id}: !! path does not exist: ${path}" >&2
    fail=$((fail+1))
    continue
  fi

  echo "  ${id}: starting on ${url} (model: ${path})"
  nohup mlx_lm.server \
    --model "${path}" \
    --host "${HOST}" \
    --port "${port}" \
    >"${log_file}" 2>&1 &
  echo $! > "${pid_file}"

  if wait_healthy "${url}" "${id}"; then
    echo "  ${id}: ok (pid $(cat "${pid_file}"))"
  else
    echo "  ${id}: !! failed health check; see ${log_file}" >&2
    fail=$((fail+1))
  fi
done

if [[ ${fail:-0} -gt 0 ]]; then
  exit 1
fi

echo "[start-mlx] all models healthy. State dir: ${MLX_DIR}"
echo "[start-mlx] to register as OpenCode providers:"
echo "           ./scripts/register-mlx-providers.sh ${CONFIG}"
