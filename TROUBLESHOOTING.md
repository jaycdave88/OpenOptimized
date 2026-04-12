# Troubleshooting

Runtime issues you'll likely hit first, and how to diagnose them.

## Build

### `pnpm install` errors with "lockfile out of sync"

Someone added a workspace dep without regenerating the lockfile. Run
`pnpm install` locally (no `--frozen-lockfile`), commit the updated
`pnpm-lock.yaml`.

### `scripts/build-mac.sh` fails at the `build:sidecars` step

OpenWork's sidecar chain compiles each app's TypeScript entrypoint into a
standalone binary via `bun build --compile`. Requires Bun on `PATH`:

```bash
curl -fsSL https://bun.sh/install | bash
```

### `tauri build` can't find `sidecars/oo-supervisor`

`scripts/build-mac.sh` should have produced it via
`pnpm --filter oo-supervisor run build:bin`. If that step was skipped or
failed, rerun manually:

```bash
pnpm --filter oo-supervisor run build:bin
cp apps/oo-supervisor/dist/bin/oo-supervisor apps/desktop/src-tauri/sidecars/
```

## First launch

### The onboarding overlay doesn't appear

It's gated on `localStorage.getItem("oo:first-run-complete")`. Clear it
from the devtools console (right-click in the window → Inspect):

```js
localStorage.removeItem("oo:first-run-complete");
location.reload();
```

### "System check" says Python 3.12 is missing

```bash
brew install python@3.12
```

Required for the three Python-based MCPs (CocoIndex, MemPalace, Graphify)
and the two Python sidecars (DeerFlow, autoresearch).

### "Ollama isn't running"

```bash
brew install ollama
ollama serve &           # or launch the Ollama.app
ollama pull qwen2.5-coder:14b
ollama pull nomic-embed-text
```

Skip this step if you're okay running only against a cloud provider.

## MCP servers

### A server is stuck in "starting"

The per-user venv is being created on first run. Watch progress:

```bash
tail -f ~/Library/Application\ Support/dev.openoptimized.app/mcp-bin/<name>/venv.log
```

If the log shows `pip install` errors, run `setup.sh` manually:

```bash
bash "$(ls -d /Applications/OpenOptimized.app/Contents/Resources/mcp-bin/<name>)/setup.sh"
```

### "MCP server crashed" in the MCP Health Panel

Click **restart**. If the server crashes immediately on restart, inspect
stderr output in the chat panel's developer console — we forward
`mcp.stderr` events there. Common causes:

- Python dep versions mismatched — rerun `setup.sh` to recreate the venv.
- Missing system libs (sqlite, openssl) — `brew install` them.
- Disk full under `~/Library/Application Support/dev.openoptimized.app/`.

### MCP server can't find its data dir

Data dirs live under `~/Library/Application Support/dev.openoptimized.app/`:

- `cocoindex/` — AST index per project
- `mempalace/` — ChromaDB + SQLite
- `graphify/` — knowledge graph cache
- `context-mode/` — pruning state

Deleting any of them is safe; they rebuild on next use.

## Plugins (awesome-opencode)

### "Plugin installed but not active"

OpenCode reads plugins at startup. Click **Restart OpenCode** in the
yellow banner after install/uninstall. If it still doesn't take effect:

```bash
cat ~/Library/Application\ Support/dev.openoptimized.app/opencode.json | jq .plugin
```

Confirm the plugin appears in the array. If so, restart OpenCode via the
engine-restart command or relaunch the app.

## Extras (Flash-MoE / MicroFish-En)

### Flash-MoE install fails with "git not installed"

```bash
xcode-select --install
```

### Flash-MoE install succeeds but no model loads

The installer clones the repo but the weights are multi-GB and must be
downloaded separately. Follow the README under
`~/Library/Application Support/dev.openoptimized.app/flash-moe/repo/README.md`.

### MicroFish-En launch opens a blank page

It binds to `127.0.0.1:5000` by default. Check the launch log:

```bash
tail -f ~/Library/Application\ Support/dev.openoptimized.app/microfish/microfish.log
```

Port already in use? Set `MICROFISH_PORT=5050` before launching.

## Agent library

### Persona doesn't show up in OpenCode's agent picker

Files must live under `~/Library/Application Support/dev.openoptimized.app/.opencode/agents/<name>.md`.
`agency_agents_install` copies them there; verify with:

```bash
ls ~/Library/Application\ Support/dev.openoptimized.app/.opencode/agents/
```

OpenCode picks up `.md` files on session start; restart OpenCode if a
fresh install doesn't appear.

## Diagnostics

### Supervisor / MCP event stream

Supervisor events are sent to the UI as `mcp.status`, `mcp.stderr`,
`mcp.ready` Tauri events. To tail them from a dev build:

```bash
pnpm dev:ui
# then open devtools and: listen("mcp.status", console.log)
```

### Vendor drift

```bash
./scripts/upstream-diff.sh
```

Shows how many commits behind each `vendor/*` submodule is relative to
its tracking branch.

### Full structural smoke

```bash
./scripts/smoke.sh --offline
```

Validates submodule init, build-mcp-bins / stage-python-sidecars, Tauri
command registrations, Settings tab wiring, and README inventory.
