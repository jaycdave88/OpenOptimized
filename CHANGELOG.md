# OpenOptimized changelog

Each entry corresponds to one wave shipped on `claude/review-projects-Yh6gW`.

## Wave 7 — Contributor tooling (d80a3a1..HEAD)

- `scripts/upstream-diff.sh` — reports commits-ahead per `vendor/*`
  submodule plus the OpenWork fork-point compare URL. Run before a
  release to decide which pins to bump.
- `CONTRIBUTING.md` — clone/build/update workflow, including
  step-by-step instructions for bumping submodule pins, adding new MCPs,
  settings tabs, and Tauri commands. Includes the license-sensitivity
  matrix for vendoring.
- `.github/workflows/oo-smoke.yml` — CI workflow that runs
  `scripts/smoke.sh --offline` on every push and PR. Does not build the
  `.app` (that needs macOS and Rust toolchain); covers everything else.

## Wave 6 — Plugin installs land in opencode.json (59f835a..d80a3a1)

- New Tauri commands `oo_plugin_installed_list`, `oo_plugin_install`,
  `oo_plugin_uninstall` mutate the user's `opencode.json` `plugin` array.
- `PluginsBrowser` rewritten from read-only catalog into a full
  install/remove browser with a restart-reminder banner.

## Wave 5 — Level C: vendor sidecars + agency-agents (ed5c66b..59f835a)

- Three new submodules: `vendor/deer-flow`, `vendor/autoresearch`,
  `vendor/agency-agents`.
- `scripts/stage-python-sidecars.sh` mirrors the Level-B MCP pipeline
  for the Python sidecars (staged source + per-user venv on first run).
- `scripts/bootstrap-python-sidecars.sh` reduced to a deprecation shim.
- `agency_agents_list` / `agency_agents_install` Tauri commands; full
  browse/search/install UI in `AgentLibrary` against the 187-persona
  catalog.
- `scripts/build-mac.sh` stages `resources/agency-agents/` from
  `vendor/agency-agents/` at build time.

## Wave 4 — Level B: vendor MCP sources (df9b43c..ed5c66b)

- Four new submodules: `vendor/cocoindex-code`, `vendor/mempalace`,
  `vendor/graphify`, `vendor/context-mode`.
- `scripts/build-mcp-bins.sh` stages source, writes per-MCP MANIFEST.json
  with pinned SHA and entrypoint, emits `setup.sh` + `run.sh` launchers
  (Python venv on first launch; Node runtime for context-mode).
- `resources/opencode.defaults.json` MCP commands switched to invoke the
  generated `run.sh` scripts.
- `scripts/fetch-mcp-bins.ts` reduced to a deprecation shim.
- `scripts/build-mac.sh` runs `git submodule update --init` before the
  Tauri bundle step.

## Wave 3 — Flash-MoE, MicroFish-En, awesome-opencode (4a668f4..df9b43c)

- `resources/flash-moe/install.sh` + `resources/microfish/{install,launch}.sh`.
- New `oo_extras.rs` with `flash_moe_*`, `microfish_*`, and
  `oo_plugins_list` Tauri commands; shared `stream_shell_json` helper.
- `resources/opencode-plugins.json` — curated awesome-opencode shortlist.
- Two new Settings tabs: `Plugins`, `Extras`.
- `PluginsBrowser` and `ExtrasPanel` feature components (Solid).

## Wave 1/2 — Tauri commands + settings mounts (a8efaf2..4a668f4)

- `commands/ollama.rs` (status/list/pull with streamed progress),
  `commands/oo_mcp.rs`, `commands/oo_bootstrap.rs`.
- `apps/oo-supervisor` sidecar wrapping `@oo/mcp-supervisor` with a
  stdin/stdout JSON protocol.
- Five OpenOptimized settings tabs mounted: Models, MCP servers,
  Agent library, Plugins, Extras.
- Entry bootstrap: `entry.tsx` calls `oo_bootstrap` on mount.

## Wave 0 — Fork and scaffold (initial commit ..880e993)

- Hard fork of `jaycdave88/openwork@57463040`, `/ee` stripped.
- Rebranded Tauri bundle to `OpenOptimized` / `dev.openoptimized.app`.
- Added `packages/@oo/*` workspace packages.
- Seeded `resources/opencode.defaults.json`, three agent personas,
  build/bootstrap scripts.
