#!/usr/bin/env bash
#
# stop-mlx.sh — stop every mlx_lm.server process started by start-mlx.sh.
#
# Reads PID files from $APPSUPPORT/dev.openoptimized.app/mlx/<id>.pid,
# sends SIGTERM, waits briefly, SIGKILL if still alive, removes the PID
# file. Safe to run when nothing is running.

set -euo pipefail

USER_DATA_DIR="${OO_USER_DATA_DIR:-${HOME}/Library/Application Support/dev.openoptimized.app}"
MLX_DIR="${USER_DATA_DIR}/mlx"

if [[ ! -d "${MLX_DIR}" ]]; then
  echo "[stop-mlx] nothing to stop (no state dir at ${MLX_DIR})"
  exit 0
fi

found=0
for pid_file in "${MLX_DIR}"/*.pid; do
  [[ -e "${pid_file}" ]] || continue
  found=1
  id="$(basename "${pid_file}" .pid)"
  pid="$(cat "${pid_file}" 2>/dev/null || echo "")"
  if [[ -z "${pid}" ]]; then
    rm -f "${pid_file}"
    continue
  fi
  if ! kill -0 "${pid}" 2>/dev/null; then
    echo "  ${id}: not running (pid ${pid}); removing stale pid file"
    rm -f "${pid_file}"
    continue
  fi
  echo "  ${id}: sending SIGTERM to ${pid}"
  kill -TERM "${pid}" 2>/dev/null || true
  # Give it 3 seconds to exit cleanly.
  for _ in 1 2 3; do
    kill -0 "${pid}" 2>/dev/null || break
    sleep 1
  done
  if kill -0 "${pid}" 2>/dev/null; then
    echo "  ${id}: still running, sending SIGKILL to ${pid}"
    kill -KILL "${pid}" 2>/dev/null || true
  fi
  rm -f "${pid_file}"
done

if [[ ${found} -eq 0 ]]; then
  echo "[stop-mlx] no MLX servers tracked"
else
  echo "[stop-mlx] done"
fi
