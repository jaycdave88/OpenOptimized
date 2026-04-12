#!/usr/bin/env bash
#
# install-mcp-venvs.sh — pre-install every bundled MCP server's Python
# venv (or verify Node for context-mode) before the app runs `run.sh` for
# the first time. Lets users avoid the multi-minute "spinning" MCP step
# inside the onboarding overlay.
#
# Each MCP's setup.sh is idempotent — already-installed venvs are
# skipped. Running this twice is a no-op.
#
# Usage:
#   ./scripts/install-mcp-venvs.sh
#   OO_USER_DATA_DIR=/path ./scripts/install-mcp-venvs.sh
#
# Requires: python3.12 on PATH for the three Python MCPs, node on PATH
# for context-mode. Both are installed by ./setup.sh.

set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
USER_DATA_DIR="${OO_USER_DATA_DIR:-${HOME}/Library/Application Support/dev.openoptimized.app}"
export OO_USER_DATA_DIR="${USER_DATA_DIR}"

MCP_NAMES=(cocoindex mempalace graphify context-mode)
failed=()

for name in "${MCP_NAMES[@]}"; do
  setup="${ROOT}/resources/mcp-bin/${name}/setup.sh"
  if [[ ! -x "${setup}" ]]; then
    echo "!! ${setup} missing; run ./scripts/build-mcp-bins.sh first" >&2
    failed+=("${name}")
    continue
  fi
  echo ""
  echo "==> ${name}"
  if "${setup}"; then
    echo "    ok"
  else
    echo "    !! ${name} setup failed"
    failed+=("${name}")
  fi
done

echo ""
if [[ ${#failed[@]} -gt 0 ]]; then
  echo "Some MCPs failed to install: ${failed[*]}"
  echo "See $USER_DATA_DIR/mcp-bin/<name>/ for per-MCP state."
  exit 1
fi

echo "All MCP venvs ready under ${USER_DATA_DIR}/mcp-bin/"
echo ""
echo "Verify:"
for name in "${MCP_NAMES[@]}"; do
  venv_py="${USER_DATA_DIR}/mcp-bin/${name}/venv/bin/python"
  node_marker="${USER_DATA_DIR}/mcp-bin/${name}/SETUP.json"
  if [[ -x "${venv_py}" ]]; then
    echo "  ${name}: venv installed"
  elif [[ -f "${node_marker}" ]]; then
    echo "  ${name}: node runtime ok"
  else
    # context-mode doesn't always write a marker; check differently
    echo "  ${name}: (check ${USER_DATA_DIR}/mcp-bin/${name}/)"
  fi
done

echo ""
echo "Next: relaunch OpenOptimized.app and click Continue past the Ollama"
echo "step. The MCP servers should come up green quickly now that venvs exist."
