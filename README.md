# OpenOptimized

**Standalone Mac coding client. Local-first. Private. One `.app`.**

OpenOptimized is a hard fork of [OpenWork](https://github.com/jaycdave88/openwork)
that ships as a single macOS `.app`, pre-wires [OpenCode](https://opencode.ai)
against local Ollama models, and bundles a curated stack of MCP servers and
agent sidecars for memory, code indexing, context pruning, orchestration, and
research — all configured out of the box.

## Status

**Phases 0–2 complete; final integration wave landed.** OpenWork is forked in,
rebranded, and stripped of `/ee`. Five `@oo/*` packages ship with real
public APIs. Six Tauri commands wire the UI to Ollama, bundled MCPs, the
first-run bootstrap, Flash-MoE, MicroFish-En, and the awesome-opencode
plugin registry. Five OpenOptimized-specific settings tabs (`Models`,
`MCP servers`, `Agent library`, `Plugins`, `Extras`) are mounted and
reachable. An isolated sidecar (`apps/oo-supervisor`) stands ready to take
over MCP supervision from the Rust stub.

Track the staged plan in `/root/.claude/plans/synthetic-napping-lampson.md`
(local) or inline in this repo's commit history.

## Integration matrix (all ten repos)

| Repo | Role | Delivery |
|------|------|----------|
| [cocoindex-code](https://github.com/jaycdave88/cocoindex-code) | AST-aware semantic code search | **Bundled MCP** (`vendor/cocoindex-code` submodule, built from source) |
| [mempalace](https://github.com/jaycdave88/mempalace) | Long-term persistent memory | **Bundled MCP** (`vendor/mempalace` submodule, 19 tools, local-first) |
| [graphify](https://github.com/jaycdave88/graphify) | Code/doc knowledge graph | **Bundled MCP** (`vendor/graphify` submodule) |
| [context-mode](https://github.com/jaycdave88/context-mode) | Context window pruning | **Bundled MCP** (`vendor/context-mode` submodule, ELv2, desktop-only) |
| [agency-agents](https://github.com/jaycdave88/agency-agents) | Pre-built agent personas | **Seed personas** — curated subset copied into `.opencode/agents/` on first run; `AgentLibrary` tab manages them |
| [deer-flow](https://github.com/jaycdave88/deer-flow) | Multi-agent orchestration | **Python sidecar** — installed into a venv on first `Plan` mode use via `scripts/bootstrap-python-sidecars.sh` |
| [autoresearch](https://github.com/jaycdave88/autoresearch) | Autonomous research loop | **Python sidecar** — installed into a venv on first `Research` mode use; wrapped by `@oo/research` |
| [flash-moe](https://github.com/jaycdave88/flash-moe) | 397B MoE native Mac inference | **Optional extra** — installed via Settings → Extras; registered as a second provider in `opencode.defaults.json` (disabled until installed) |
| [MicroFish-En](https://github.com/jaycdave88/MicroFish-En) | Doc → multi-agent sim (AGPL) | **Optional extra, license-isolated** — user-installed, runs as a detached process, opened in the default browser; see `LICENSES.md` |
| [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) | Curated ecosystem directory | **Plugin registry** — shortlist in `resources/opencode-plugins.json`, browsable via Settings → Plugins, installs via OpenCode's plugin system |

## What's in the box

| Layer | Component |
|-------|-----------|
| GUI shell | Tauri 2 + React 19 + Solid.js (forked from OpenWork) |
| Agent runtime | [OpenCode](https://opencode.ai) client/server |
| Default inference | Local [Ollama](https://ollama.com) — `qwen2.5-coder:14b`, `nomic-embed-text`, `llama3.1:8b`, `deepseek-coder-v2:16b` |
| Advanced inference | [Flash-MoE](https://github.com/jaycdave88/flash-moe) 397B Qwen MoE (opt-in via Settings → Extras) |
| Memory | [MemPalace](https://github.com/jaycdave88/mempalace) MCP + optional [awesome-opencode](https://github.com/awesome-opencode/awesome-opencode) plugins (Opencode Mem, Agent Memory) |
| Code indexing | [CocoIndex](https://github.com/jaycdave88/cocoindex-code) (semantic) + [Graphify](https://github.com/jaycdave88/graphify) (structural) MCPs |
| Context pruning | [context-mode](https://github.com/jaycdave88/context-mode) MCP (ELv2, desktop-only) + Dynamic Context Pruning plugin |
| Orchestration | [DeerFlow](https://github.com/jaycdave88/deer-flow) sidecar (Plan mode) + optional Oh My Opencode plugin |
| Personas | Curated from [agency-agents](https://github.com/jaycdave88/agency-agents) |
| Research | [autoresearch](https://github.com/jaycdave88/autoresearch) sidecar (Research mode) |
| Doc simulation (optional) | [MicroFish-En](https://github.com/jaycdave88/MicroFish-En) (AGPL, detached, localhost-only) |

## Layout

```
/openOptimized
  vendor/                           git submodules — MCP sources built from
    cocoindex-code/                 source by scripts/build-mcp-bins.sh
    mempalace/
    graphify/
    context-mode/
  apps/                             forked from openwork (desktop, app, orchestrator, server, ...)
  packages/
    @openwork/*                     kept from upstream
    @oo/mcp-supervisor              spawn / health / restart for bundled MCP servers
    @oo/ollama-client               Ollama REST client
    @oo/config                      first-run bootstrap
    @oo/ui                          OpenOptimized-specific UI primitives
    @oo/research                    autoresearch sidecar wrapper
  resources/
    mcp-bin/                        prebuilt MCP binaries (fetched, not committed)
    agents/                         seeded persona files (from agency-agents)
    deerflow/                       Python sidecar bootstrap target
    autoresearch/                   Python sidecar bootstrap target
    flash-moe/                      user-installed MoE inference (opt-in)
    microfish/                      user-installed AGPL doc-sim (opt-in, isolated)
    opencode.defaults.json          provider + MCP config template
    opencode-plugins.json           awesome-opencode curated shortlist
  scripts/
    build-mac.sh                    universal unsigned .app builder
    fetch-mcp-bins.ts               pin/checksum/download MCP binaries
    bootstrap-python-sidecars.sh    create isolated Python venvs on demand
    smoke.sh                        offline-safe integration inventory check
  UPSTREAM.md                       fork pin + divergence notes
  LICENSES.md                       third-party inventory
```

## Build (developer)

```bash
pnpm install
pnpm fetch:mcp                      # fills resources/mcp-bin (no-op until manifest populated)
pnpm build:ui
pnpm build:mac                      # produces OpenOptimized.app (unsigned)
```

First launch: right-click the `.app` → Open. Gatekeeper will warn because the
build is unsigned; this is expected for v1.

## Running

1. Install [Ollama](https://ollama.com) (or let the onboarding flow offer
   `brew install ollama`).
2. Launch `OpenOptimized.app`. On first run it copies
   `resources/opencode.defaults.json` into
   `~/Library/Application Support/OpenOptimized/opencode.json` and seeds
   persona files into `.opencode/agents/`.
3. The `ModelManager` panel pulls `qwen2.5-coder:14b` and `nomic-embed-text`
   on first run (a few GB; backgrounded).
4. Chat immediately; code search (CocoIndex) and memory (MemPalace) activate
   as MCP tool calls.
5. Switch to `Plan (DeerFlow)` or `Research (autoresearch)` via the
   `ModeSwitcher` when you need heavier workflows; the first switch triggers
   the Python venv bootstrap.

## License

MIT (see `LICENSE`). Third-party components retain their original licenses;
see `LICENSES.md`. Upstream fork details in `UPSTREAM.md`.
