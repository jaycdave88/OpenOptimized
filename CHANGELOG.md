# OpenOptimized changelog

Each entry corresponds to one wave of work. All waves 0 through 8 are
shipped on `main`; `claude/review-projects-Yh6gW` was the feature branch
during development and was merged into `main` as the new default branch
after Wave 8.

## Wave 9 — Main branch + Mac Studio installer

- `claude/review-projects-Yh6gW` merged into `main`; `main` set as the
  default GitHub branch.
- `.github/workflows/oo-smoke.yml` trigger branches reduced to `main`
  (dropped the now-irrelevant `claude/**` glob).
- `setup.sh` added at the repo root: one-shot Mac Studio bring-up from a
  clean machine. Idempotent. Installs Xcode CLI tools, Homebrew, Node 22,
  pnpm 10, Bun, Rust with Apple targets, Python 3.12, Ollama with default
  models (`qwen2.5-coder:14b`, `nomic-embed-text`), initialises the seven
  `vendor/` submodules, runs `pnpm install`, builds the universal `.app`,
  and opens it. Flags: `--skip-ollama`, `--skip-models`, `--skip-build`,
  `--skip-launch`, `--with-python`, `--yes`.
- README rewritten for 100% accuracy against the post-Wave-8 reality:
  integration matrix confirmed, layout reflects actual `vendor/`,
  `apps/oo-supervisor/`, `resources/sidecar/`, and the new `setup.sh`
  entrypoint promoted above the manual build instructions.
- CONTRIBUTING gains a "First time on a Mac Studio" section pointing at
  `setup.sh`.

## Wave 8 — Pre-test readiness (fd5c0f7..67d96cf)

Fixed the 12 items surfaced in the pre-test audit so a Mac Studio can
actually run `setup.sh` → `.app` end-to-end.

- **Build unblockers**: regenerated `pnpm-lock.yaml`; added
  `apps/oo-supervisor/script/build.ts` + `build:bin` scripts (bun
  compile pattern); dropped stale `resources/deerflow/` and
  `resources/autoresearch/` glob entries from `tauri.conf.json`;
  `scripts/build-mac.sh` now compiles `oo-supervisor`, runs OpenWork's
  `build:sidecars` chain, invokes `prepare-sidecar.mjs`, and copies
  `oo-supervisor` into `apps/desktop/src-tauri/sidecars/` so every
  `externalBin` has a real file.
- **First-launch flow**: `Setup.tsx` mounted as a first-run modal overlay
  in `entry.tsx`, gated on a localStorage flag. Three-step flow (system
  check → Ollama → MCP boot) reads real Tauri commands. New
  `commands/oo_system.rs` / `oo_system_check` probes Python 3.12,
  Node, Ollama, git with install hints.
- **MCP supervisor bridge**: `commands/oo_mcp.rs` rewritten to spawn
  `apps/oo-supervisor` on demand (`OnceLock<Mutex<…>>`), read its stdout,
  forward `mcp.status` / `mcp.stderr` / `mcp.ready` events to the UI;
  `oo_mcp_restart` writes `{"type":"restart","id":…}` to the supervisor's
  stdin. New `oo_mcp_boot` command for explicit spawn from onboarding.
- **ModeSwitcher in composer**: `ComposerProps` gains optional `mode` +
  `onModeChange`; `OOModeSwitcher` renders above the composer card as a
  Solid sibling of the React island. Unchanged when props omitted.
- **Plugin restart loop closed**: PluginsBrowser yellow banner now has a
  Restart OpenCode button wired to `engine_restart`.
- **Flash-MoE installer**: attempts Makefile/build.sh with captured log,
  surfaces upstream `download-weights.sh` rather than auto-fetching
  multi-GB weights, records `build_succeeded` in INSTALLED.json.
- **Docs**: `TROUBLESHOOTING.md` (common failure modes with fixes) +
  `QA-CHECKLIST.md` (7-section manual test plan).
- **Smoke**: 19 Tauri commands registered, all green in `--offline`.

## Wave 7 — Contributor tooling (d80a3a1..fd5c0f7)

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
