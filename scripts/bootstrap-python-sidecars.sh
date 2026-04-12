#!/usr/bin/env bash
#
# bootstrap-python-sidecars.sh
#
# DEPRECATED. Kept as a thin shim for backwards compatibility.
#
# The old Level-A flow cloned deer-flow / autoresearch from GitHub into
# the user's venv on first-use. Level C replaces that: both are git
# submodules under `vendor/`, staged by
# `scripts/stage-python-sidecars.sh` into
# `resources/sidecar/<name>/source/`, and installed on first use by the
# auto-generated `resources/sidecar/<name>/run.sh` -> `setup.sh` chain.
#
# This shim delegates so existing `pnpm bootstrap:python` commands keep
# working.

set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
echo "[bootstrap-python-sidecars] deprecated — see scripts/stage-python-sidecars.sh"
bash "${ROOT}/scripts/stage-python-sidecars.sh"
