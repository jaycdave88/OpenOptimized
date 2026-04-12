# OpenOptimized

**Standalone Mac coding client. Local-first. Private. One `.app`.**

OpenOptimized is a hard fork of [OpenWork](https://github.com/jaycdave88/openwork)
that ships as a single macOS `.app`, pre-wires [OpenCode](https://opencode.ai)
against local Ollama models, and bundles a curated stack of MCP servers and
agent sidecars for memory, code indexing, context pruning, orchestration, and
research — all configured out of the box.

## Status

**Phase 0 complete** — repo is scaffolded: OpenWork source forked in, `@oo/*`
packages stubbed with real public APIs, `resources/` seeded with a default
OpenCode config (Ollama provider + four MCP servers registered), three agent
personas, and build/bootstrap scripts.

**Next: Phase 1** — land the Ollama wiring in the UI (`ModelManager`), boot
the MCP supervisor from `apps/orchestrator`, and ship CocoIndex as the first
bundled MCP.

Track the staged plan in `/root/.claude/plans/synthetic-napping-lampson.md`
(local) or inline in this repo's commit history.

## What's in the box

| Layer | Component |
|-------|-----------|
| GUI shell | Tauri 2 + React 19 + Solid.js (forked from OpenWork) |
| Agent runtime | [OpenCode](https://opencode.ai) client/server |
| Default inference | Local [Ollama](https://ollama.com) — `qwen2.5-coder:14b`, `nomic-embed-text`, `llama3.1:8b`, `deepseek-coder-v2:16b` |
| Memory | [MemPalace](https://github.com/jaycdave88/mempalace) MCP |
| Code indexing | [CocoIndex](https://github.com/jaycdave88/cocoindex-code) (semantic) + [Graphify](https://github.com/jaycdave88/graphify) (structural) MCPs |
| Context pruning | [context-mode](https://github.com/jaycdave88/context-mode) MCP (ELv2, desktop-only) |
| Orchestration | [DeerFlow](https://github.com/jaycdave88/deer-flow) sidecar (Plan mode) |
| Personas | Curated from [agency-agents](https://github.com/jaycdave88/agency-agents) |
| Research | [autoresearch](https://github.com/jaycdave88/autoresearch) sidecar (Research mode) |

## Layout

```
/openOptimized
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
    agents/                         seeded persona files
    deerflow/                       Python sidecar bootstrap target
    autoresearch/                   Python sidecar bootstrap target
    opencode.defaults.json          provider + MCP config template
  scripts/
    build-mac.sh                    universal unsigned .app builder
    fetch-mcp-bins.ts               pin/checksum/download MCP binaries
    bootstrap-python-sidecars.sh    create isolated Python venvs on demand
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
