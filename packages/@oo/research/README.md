# @oo/research

Wraps the `autoresearch` Python CLI as a supervised sidecar. Exposed to the
UI as a `Research` mode.

**Status:** Phase 3 skeleton.

## Flow

1. UI posts a research prompt via `ModeSwitcher` set to `Research`.
2. `apps/orchestrator` calls `startResearchRun({ prompt, python, entrypoint, runsDir })`.
3. The run dir at `$APPSUPPORT/OpenOptimized/autoresearch/runs/<uuid>/` collects
   artifacts; stdout lines stream to the UI via Tauri `emit`.
4. `ResearchRunLog` panel shows the tail and a Cancel button (calls `handle.cancel()`).

## Prerequisites

- Python 3.12 detected on `PATH`.
- venv bootstrapped by `scripts/bootstrap-python-sidecars.sh` which installs
  `autoresearch` from a pinned SHA (see `scripts/fetch-mcp-bins.ts` manifest).
