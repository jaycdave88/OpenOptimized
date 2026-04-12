# Upstream: OpenWork

OpenOptimized is a **hard fork** of [jaycdave88/openwork](https://github.com/jaycdave88/openwork).

## Pinned fork point

- Upstream SHA: `57463040a33d96c874b97067f912d17d6b0fdec4`
- Upstream branch at fork time: `dev`
- Fork date: 2026-04

## What we kept

- Everything under `apps/`, `packages/`, `scripts/`, `patches/`, `packaging/`
  at the pinned SHA.
- The MIT-licensed core. We did not bring `ee/` (Fair Source License) into
  this fork.

## What we removed

- `ee/` directory (enterprise, Fair Source).
- `.infisical.json`, `.vercelignore`, `app-demo.gif` — not useful for a
  standalone Mac client.
- `dev:web`, `dev:web-local`, `dev:den-local`, `dev:headless-web` scripts
  from the root `package.json` — OpenOptimized is desktop-only.

## What we added (Phase 0)

- `packages/@oo/mcp-supervisor` — spawn/health/restart for bundled MCP servers.
- `packages/@oo/ollama-client` — Ollama detection + model management.
- `packages/@oo/config` — first-run bootstrap of `opencode.json` and agents.
- `packages/@oo/ui` — OpenOptimized-specific UI primitives (thin layer over `@openwork/ui`).
- `packages/@oo/research` — autoresearch sidecar wrapper.
- `resources/opencode.defaults.json` — Ollama provider + bundled MCP config.
- `resources/agents/*.md` — seeded personas (repo-navigator, refactor-planner, security-reviewer).
- `scripts/build-mac.sh`, `scripts/fetch-mcp-bins.ts`, `scripts/bootstrap-python-sidecars.sh`.

## Rebranding scope

- `productName` and `identifier` in `apps/desktop/src-tauri/tauri.conf.json`
  and `tauri.dev.conf.json` changed to `OpenOptimized` / `dev.openoptimized.app`.
- Root `package.json` name changed to `@openoptimized/workspace`.
- Deep-link schemes keep both `openoptimized` and `openwork` for backwards
  compatibility with any existing shortcuts.

**Intentionally not rebranded** (internal; touches too many files for v1):
- Cargo crate name (`openwork`) and binary (`OpenWork-Dev`) in
  `apps/desktop/src-tauri/Cargo.toml`.
- `@openwork/app`, `@openwork/desktop`, `@openwork/ui` package names.
- Environment variable `OPENWORK_DEV_MODE`.

These get renamed in a later phase once the fork is stable.

## Tracking upstream

We do not auto-merge upstream, but we do want visibility. A `scripts/upstream-diff.sh`
(TODO) will print commits on `jaycdave88/openwork:dev` since the pinned SHA,
so we can cherry-pick deliberately.
