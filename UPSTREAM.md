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

## Tracking upstream OpenWork

We do not auto-merge upstream, but we do want visibility. A `scripts/upstream-diff.sh`
(TODO) will print commits on `jaycdave88/openwork:dev` since the pinned SHA,
so we can cherry-pick deliberately.

## Vendored submodules (Levels B + C)

Seven git submodules under `vendor/` carry every piece of source code we
bundle. Level B covers the four bundled MCP servers; Level C extends the
same approach to the two Python sidecars and the agency-agents persona
catalog.

| Submodule | Repo | Branch | Pinned SHA | Wave |
|-----------|------|--------|------------|------|
| `vendor/cocoindex-code` | jaycdave88/cocoindex-code | main | `49374cf4b52165c762d7d91958bdf06129ab8444` | B |
| `vendor/mempalace` | jaycdave88/mempalace | main | `b370e86f9693337571f04567d813f4bc3e734a47` | B |
| `vendor/graphify` | jaycdave88/graphify | v3 | `92b70ce5f4f208bb7ea4d4e796f70e52e40418eb` | B |
| `vendor/context-mode` | jaycdave88/context-mode | main | `19519a59297d30720c6e047ee5845230a5696e43` | B |
| `vendor/deer-flow` | jaycdave88/deer-flow | main | `2efa84af02ba2d3ed90109146674509ef8b547e3` | C |
| `vendor/autoresearch` | jaycdave88/autoresearch | master | `e6d79c123441a53d91bb8df7adf4db45cf120bf1` | C |
| `vendor/agency-agents` | jaycdave88/agency-agents | main | `4feb0cd736dd0e2e9830cd54dfc99770621bed90` | C |

### Not vendored (deliberate)

- **jaycdave88/MicroFish-En** — AGPL-3.0. Vendoring the source would
  force the combined OpenOptimized distribution into AGPL. Stays as a
  user-initiated install via `resources/microfish/install.sh`.
- **jaycdave88/flash-moe** — upstream license TBD. Vendoring source with
  an unspecified license is a legal risk. Stays as a user-initiated
  install via `resources/flash-moe/install.sh`.

Both are still fully reachable from the UI (Settings → Extras); the
install step clones upstream into the user's own machine, not our bundle.

Each is cloned on `git submodule update --init`; `scripts/build-mac.sh`
calls this automatically. Bumping a pin:

```bash
git submodule update --remote vendor/<repo>
git add vendor/<repo>

# Regenerate the matching staging dir:
./scripts/build-mcp-bins.sh <name>           # for cocoindex/mempalace/graphify/context-mode
./scripts/stage-python-sidecars.sh <name>    # for deerflow/autoresearch
# agency-agents is restaged by build-mac.sh on every build; no separate script.

git commit -m "bump <repo> to <new-sha>"
```

## What vendor/ submodules enable

- **Hermetic builds.** A fresh clone with `git submodule update --init`
  has every byte needed to build the full MCP stack. No dependence on an
  upstream release that hasn't been cut yet.
- **Reproducible pins.** Every release of OpenOptimized pins the exact
  commit of every bundled MCP.
- **Upstream-trackable.** `git log` inside any `vendor/*/` shows diff
  against the pinned SHA, and `git submodule status` flags drift.

## What vendor/ submodules DON'T change

- **MCP transport.** Servers still talk MCP (JSON-RPC over stdio) to
  OpenCode — that's how OpenCode's tool protocol works, independent of
  where the source lives.
- **License.** Each submodule retains its upstream license (see
  `LICENSES.md`). Vendoring source does not relicense it.
- **Process boundary.** Each MCP still runs as its own child process;
  `@oo/mcp-supervisor` and `apps/oo-supervisor` supervise them.
