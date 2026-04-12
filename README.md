# OpenOptimized

**Standalone Mac coding client. Local-first. Private. One `.app`.**

OpenOptimized is a hard fork of [OpenWork](https://github.com/jaycdave88/openwork)
that ships as a single macOS `.app`, pre-wires [OpenCode](https://opencode.ai)
against local Ollama models, and bundles a curated stack of MCP servers, Python
sidecars, and agent personas for memory, code indexing, context pruning,
orchestration, and research — all configured out of the box.

## Quick start (Mac Studio / Apple Silicon)

Clone the repo, then run the one-shot installer from the repo root:

```bash
git clone --recursive https://github.com/jaycdave88/OpenOptimized.git
cd OpenOptimized
./setup.sh
```

`setup.sh` is idempotent. It installs everything needed on a clean Mac Studio
(Xcode CLI tools, Homebrew, Node 22, pnpm 10, Bun, Rust with Apple targets,
Python 3.12, Ollama with default models), initialises the seven `vendor/`
submodules, runs `pnpm install`, builds the universal unsigned `.app`, and
opens it. See `setup.sh --help` for flags (`--skip-ollama`, `--skip-models`,
`--skip-build`, `--yes`).

First launch triggers an onboarding overlay that verifies prerequisites and
brings up the MCP servers. Gatekeeper will warn once because the build is
unsigned — right-click the `.app`, choose Open, confirm. Subsequent launches
open normally.

## Status

Shipped through **Wave 8 — pre-test readiness**. Every item of bundled
functionality described below is wired end-to-end. Remaining open items are
tracked in `CHANGELOG.md` (wave history) and `QA-CHECKLIST.md` (manual
verification against a clean Mac).

- 7 git submodules under `vendor/` carry the source of every bundled repo
- 19 Tauri commands wire the Solid.js UI to Ollama, MCPs, plugins, agency-agents, Flash-MoE, MicroFish-En, and a system readiness check
- 5 OpenOptimized-specific settings tabs (Models, MCP servers, Agent library, Plugins, Extras) are mounted and reachable
- `apps/oo-supervisor` compiles to a Tauri sidecar; Rust spawns it and forwards `mcp.status` / `mcp.stderr` / `mcp.ready` events to the UI
- Onboarding overlay runs a three-step flow (system check → Ollama → MCP boot) on first launch, gated on a localStorage flag
- CI runs `./scripts/smoke.sh --offline` on every push/PR

## Integration matrix (all ten repos)

| Repo | Role | Delivery |
|------|------|----------|
| [cocoindex-code](https://github.com/jaycdave88/cocoindex-code) | AST-aware semantic code search | **Bundled MCP** (`vendor/cocoindex-code` submodule, Python venv created on first launch) |
| [mempalace](https://github.com/jaycdave88/mempalace) | Long-term persistent memory | **Bundled MCP** (`vendor/mempalace` submodule, 19 tools, local-first) |
| [graphify](https://github.com/jaycdave88/graphify) | Code/doc knowledge graph | **Bundled MCP** (`vendor/graphify` submodule) |
| [context-mode](https://github.com/jaycdave88/context-mode) | Context window pruning | **Bundled MCP** (`vendor/context-mode` submodule, Node runtime, ELv2 desktop-only) |
| [agency-agents](https://github.com/jaycdave88/agency-agents) | Pre-built agent personas | **Vendored source** (`vendor/agency-agents`); 187 personas browsable in Settings → Agent library; three-persona seeded subset auto-installed |
| [deer-flow](https://github.com/jaycdave88/deer-flow) | Multi-agent orchestration | **Vendored source** (`vendor/deer-flow`); first-launch venv from staged `resources/sidecar/deerflow/`; exposed via `Plan` mode |
| [autoresearch](https://github.com/jaycdave88/autoresearch) | Autonomous research loop | **Vendored source** (`vendor/autoresearch`); first-launch venv from staged `resources/sidecar/autoresearch/`; wrapped by `@oo/research`; exposed via `Research` mode |
| [flash-moe](https://github.com/jaycdave88/flash-moe) | 397B MoE native Mac inference | **Optional extra** (Settings → Extras → Install); registered as a second provider in `opencode.defaults.json` (disabled until installed). Not vendored — upstream license is TBD |
| [MicroFish-En](https://github.com/jaycdave88/MicroFish-En) | Doc → multi-agent sim (AGPL) | **Optional extra, license-isolated** — user-installed via Settings → Extras, runs as a detached process, opened in the default browser. Never vendored (would force the MIT bundle to AGPL) |
| [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) | Curated ecosystem directory | **Plugin registry** — shortlist in `resources/opencode-plugins.json`, browsable via Settings → Plugins. Install writes to `opencode.json`'s `plugin` array; UI offers a Restart OpenCode button to activate |

## Layout

```
/openOptimized
  setup.sh                          one-shot Mac Studio bring-up (this is the main entrypoint)
  vendor/                           git submodules — every repo we bundle
    cocoindex-code/                 MCP (Python)          Wave 4
    mempalace/                      MCP (Python)          Wave 4
    graphify/                       MCP (Python)          Wave 4
    context-mode/                   MCP (Node)            Wave 4
    deer-flow/                      sidecar               Wave 5
    autoresearch/                   sidecar               Wave 5
    agency-agents/                  187 personas          Wave 5
  apps/
    app/                            Solid.js UI (forked from OpenWork, extended)
    desktop/                        Tauri 2 shell (produces the .app)
    orchestrator/                   OpenWork host orchestrator (forked, unmodified)
    server/                         OpenWork API (forked, unmodified)
    opencode-router/                OpenWork Slack/Telegram bridge (forked, unmodified)
    oo-supervisor/                  our MCP supervisor sidecar (new)
  packages/
    @openwork/*                     kept from upstream
    @oo/mcp-supervisor              spawn / health / restart class API
    @oo/ollama-client               Ollama REST client
    @oo/config                      idempotent first-run bootstrap
    @oo/ui                          OpenOptimized-specific UI primitives
    @oo/research                    autoresearch sidecar wrapper
  resources/
    opencode.defaults.json          provider + MCP config template
    opencode-plugins.json           awesome-opencode curated shortlist
    agents/                         3 seeded persona files (repo-navigator, refactor-planner, security-reviewer)
    agency-agents/                  staged 187-persona catalog (built; gitignored)
    mcp-bin/<name>/                 staged MCP launchers + venv hooks (built; gitignored)
    sidecar/<name>/                 staged Python sidecar launchers (built; gitignored)
    flash-moe/                      user-install scripts for Flash-MoE
    microfish/                      user-install + launch scripts for MicroFish-En (AGPL-isolated)
  scripts/
    build-mac.sh                    universal unsigned .app builder (called by setup.sh)
    build-mcp-bins.sh               stages MCP source + launchers from vendor/
    stage-python-sidecars.sh        stages deer-flow + autoresearch from vendor/
    start-mlx.sh                    spawn mlx_lm.server per model in mlx-models.json
    stop-mlx.sh                     stop MLX servers by PID file
    register-mlx-providers.sh       merge MLX entries into user's opencode.json
    upstream-diff.sh                reports commits-ahead per vendored repo
    smoke.sh                        offline-safe structural check (runs in CI)
    fetch-mcp-bins.ts               deprecated shim → build-mcp-bins.sh
    bootstrap-python-sidecars.sh    deprecated shim → stage-python-sidecars.sh
  mlx-models.example.json           template for local MLX model config (copy to mlx-models.json)
  .github/workflows/oo-smoke.yml    CI: smoke test + drift report on every push/PR
  README.md  CONTRIBUTING.md  CHANGELOG.md  LICENSES.md
  UPSTREAM.md  TROUBLESHOOTING.md  QA-CHECKLIST.md
```

## Manual build (alternative to `setup.sh`)

If `setup.sh` isn't what you want, the manual path is:

```bash
pnpm install                        # regenerates lockfile if drifted
pnpm build:mac                      # runs scripts/build-mac.sh end-to-end
# or, step by step:
./scripts/build-mcp-bins.sh         # stage MCP sources from vendor/
./scripts/stage-python-sidecars.sh  # stage DeerFlow + autoresearch from vendor/
pnpm build:ui                       # compile the Solid.js UI
pnpm tauri build --target universal-apple-darwin
```

The resulting `.app` lands at
`apps/desktop/src-tauri/target/universal-apple-darwin/release/bundle/macos/OpenOptimized.app`.

## Local MLX models (optional)

If you already run models via [`mlx_lm.server`](https://github.com/ml-explore/mlx-examples/tree/main/llms/mlx_lm), OpenOptimized can drive them directly as OpenAI-compatible providers alongside Ollama.

1. Copy the template and edit paths + ports to match your machine:

   ```bash
   cp mlx-models.example.json mlx-models.json
   $EDITOR mlx-models.json
   ```

   Example (the template ships this exact setup):

   ```json
   {
     "host": "127.0.0.1",
     "models": [
       { "id": "r1-uncensored", "path": "/Users/momo/models/r1-uncensored", "port": 8083, "label": "R1 Uncensored (MLX)", "tools": true, "reasoning": true },
       { "id": "qwen-coder-uncensored", "path": "/Users/momo/models/qwen-coder-uncensored", "port": 8082, "label": "Qwen Coder Uncensored (MLX)", "tools": true }
     ]
   }
   ```

2. Start the servers and register them as providers:

   ```bash
   ./scripts/start-mlx.sh                      # spawns mlx_lm.server per model
   ./scripts/register-mlx-providers.sh         # merges mlx-<id> entries into opencode.json
   ```

   Or let `setup.sh` handle both during the initial run — it detects
   `./mlx-models.json` automatically, or you can pass `--mlx-config` / `--with-mlx`.

3. Stop them later:

   ```bash
   ./scripts/stop-mlx.sh
   ```

PID files and per-model logs live under `~/Library/Application Support/dev.openoptimized.app/mlx/`. The merge into `opencode.json` is idempotent — re-running `register-mlx-providers.sh` overwrites the `mlx-<id>` block and leaves every other key alone. Each model becomes its own provider (one per port) so the ModelManager picker shows them separately from Ollama.

## Running

1. Launch `OpenOptimized.app`. First run pops the onboarding overlay.
2. Onboarding runs `oo_system_check` (Python 3.12, Ollama, Node, Git), pre-boots the MCP supervisor, and waits for each of the four bundled MCPs to turn green.
3. User data lives at `~/Library/Application Support/dev.openoptimized.app/`:
   - `opencode.json` — user's config (seeded from `resources/opencode.defaults.json`, never overwritten on subsequent launches)
   - `.opencode/agents/` — seeded personas + any you install from Settings → Agent library
   - `mcp-bin/<name>/venv/` — per-MCP Python venv, created on first use
   - `sidecar/<name>/venv/` — per-sidecar Python venv, created on first `Plan` or `Research` mode
4. Chat immediately against `qwen2.5-coder:14b`. CocoIndex (semantic search) and MemPalace (memory) activate as MCP tool calls.
5. Switch to `Plan (DeerFlow)` or `Research` via the composer's ModeSwitcher. First switch to a mode triggers its Python venv bootstrap.
6. Install awesome-opencode plugins via Settings → Plugins; click **Restart OpenCode** in the banner to activate.

Full end-to-end manual test plan lives in `QA-CHECKLIST.md`.

## Docs

- `CONTRIBUTING.md` — clone, build, bump submodule pins, add MCP / settings tab / Tauri command
- `CHANGELOG.md` — wave-by-wave history (Waves 0 through 8)
- `UPSTREAM.md` — OpenWork fork point + pinned vendor/ submodules
- `LICENSES.md` — every bundled component with its license; MIT / Apache / ELv2 boundaries called out
- `TROUBLESHOOTING.md` — common runtime failures with copy-pasteable fixes
- `QA-CHECKLIST.md` — manual QA for a clean-Mac pre-release run

## License

MIT (see `LICENSE`). Third-party components retain their original licenses;
see `LICENSES.md`. Upstream fork details in `UPSTREAM.md`.
