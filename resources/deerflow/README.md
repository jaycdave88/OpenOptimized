# resources/deerflow/

DeerFlow (jaycdave88/deer-flow) sidecar. Populated by
`scripts/bootstrap-python-sidecars.sh` into a venv at
`$APPSUPPORT/OpenOptimized/deerflow/venv/`.

DeerFlow is exposed to the UI as a **mode** (`Plan (DeerFlow)`) via the
`ModeSwitcher` component — not as a tool. The orchestrator posts a task,
DeerFlow decomposes it, and each subtask becomes an OpenCode sub-session.

## Prerequisites

- Python 3.12 on `PATH` (prompt `brew install python@3.12` if absent).
- Network access for the first-run pip install (pinned to a commit SHA in
  `scripts/fetch-mcp-bins.ts`).
