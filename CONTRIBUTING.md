# Contributing to OpenOptimized

OpenOptimized is a hard fork of OpenWork that bundles a curated stack of
MCP servers, Python sidecars, and agent personas via git submodules. This
guide describes the clone/build/update workflow.

## First time on a Mac Studio

If you're getting started on a fresh Apple Silicon Mac, the one-shot
installer handles everything — Xcode CLI, Homebrew, Node/pnpm/Bun, Rust,
Python 3.12, Ollama, submodules, `pnpm install`, and the full `.app` build:

```bash
git clone --recursive https://github.com/jaycdave88/OpenOptimized.git
cd OpenOptimized
./setup.sh            # idempotent; --help for flags
```

## Clone with submodules (if you skip setup.sh)

```bash
git clone --recursive https://github.com/jaycdave88/OpenOptimized.git
# or, after a plain clone:
git submodule update --init --depth=1
```

A plain clone without `--recursive` leaves `vendor/*` empty. The build
scripts call `git submodule update --init` automatically, so a missed
recursive flag only costs a few extra seconds the first time you run
`scripts/build-mac.sh` or `scripts/build-mcp-bins.sh`.

## Repository layout

See `README.md` for the full map. The sections relevant to contributors:

- `apps/app/` — Solid.js UI (forked from OpenWork; extended via
  `apps/app/src/app/components/features/*`)
- `apps/desktop/src-tauri/` — Rust Tauri shell; our commands live in
  `src/commands/{ollama,oo_bootstrap,oo_mcp,oo_extras}.rs`
- `apps/orchestrator/` — forked, not modified by OpenOptimized
- `apps/oo-supervisor/` — Node sidecar that will supervise MCPs (Phase 2
  bridge still Rust-side stub)
- `packages/@oo/*` — shared libraries (mcp-supervisor, ollama-client,
  config, ui, research)
- `vendor/*` — seven pinned submodules (4 MCPs + deer-flow + autoresearch
  + agency-agents)
- `resources/` — defaults, personas, and built artifacts

## Run the smoke tests

```bash
./scripts/smoke.sh --offline
```

This is intentionally fast (<10 s) and has no network dependencies. It
verifies the vendor/ pins, the build-mcp-bins / stage-python-sidecars
pipelines, the Tauri command registrations, the Settings tab wiring, and
the integration matrix in the README. A failing smoke test means an
upcoming PR needs attention.

## Add or update an integration

### Bumping a submodule pin

```bash
# 1. Pull the upstream change
git submodule update --remote vendor/<repo>

# 2. Regenerate the staged output
./scripts/build-mcp-bins.sh <name>            # for MCPs
./scripts/stage-python-sidecars.sh <name>     # for sidecars
# (agency-agents is restaged on every build by scripts/build-mac.sh)

# 3. Verify smoke still passes
./scripts/smoke.sh --offline

# 4. Commit both the submodule bump AND the UPSTREAM.md / LICENSES.md
#    edits describing the bump.
git add vendor/<repo> UPSTREAM.md
git commit -m "bump vendor/<repo> to <short-sha> (<one-line why>)"
```

### Auditing upstream drift

```bash
./scripts/upstream-diff.sh              # concise: count commits ahead per repo
./scripts/upstream-diff.sh --full       # include the full oneline log per repo
./scripts/upstream-diff.sh vendor/mempalace   # one submodule only
```

This is the right command before a release. Review the `--full` output
for anything security-sensitive before bumping pins.

### Adding a new MCP server

1. Add the repo as a submodule under `vendor/`.
2. Extend the `REPOS`, `RUNTIMES`, and `ENTRYPOINTS` arrays in
   `scripts/build-mcp-bins.sh`.
3. Add an `mcp` entry in `resources/opencode.defaults.json`.
4. Add the status check to `scripts/smoke.sh`.
5. Update `LICENSES.md` and `UPSTREAM.md`.

### Adding a new settings tab

Follow the pattern landed in `d80a3a1`:

1. Extend the `SettingsTab` union in `apps/app/src/app/types.ts`.
2. Add to `settingsTabs` Set in `apps/app/src/app/app.tsx`.
3. Add to `globalTabs()` (or `workspaceTabs()`), `tabLabel()`,
   `tabDescription()` in `apps/app/src/app/pages/settings.tsx`.
4. Add a `<Match when={activeTab() === "..."}>` block in the Switch at
   the bottom of `pages/settings.tsx`.
5. Land the panel under
   `apps/app/src/app/components/features/<name>/<Panel>.tsx`.

### Adding a new Tauri command

1. Implement in `apps/desktop/src-tauri/src/commands/<group>.rs`
   (create a new module if the concern is new).
2. `pub mod <group>;` in `apps/desktop/src-tauri/src/commands/mod.rs`.
3. `use commands::<group>::{...};` in `apps/desktop/src-tauri/src/lib.rs`.
4. Add the command ident to the `tauri::generate_handler!` list (also in
   `lib.rs`).
5. Add the command name to the `invoke_handler` check in
   `scripts/smoke.sh`.

## License-sensitive integrations

Vendoring source has license consequences:

- **Fine to vendor**: MIT, Apache 2.0, BSD, ISC. No impact on our MIT
  distribution.
- **Vendor with care**: ELv2 (no hosted-service distribution), MPL
  (per-file copyleft). Desktop bundle is OK; read the specific terms.
- **Do not vendor**: AGPL (combined work becomes AGPL), GPL. Use the
  user-install pattern (see `resources/microfish/install.sh`) so our
  bundle never contains their source bytes.
- **Do not vendor**: unspecified / TBD licenses (see `resources/flash-moe/`
  for the same user-install pattern).

When in doubt, ask in a PR rather than committing the submodule.

## Local dev loops

- `pnpm install` — install JS/TS deps (one time)
- `pnpm dev:ui` — hot-reload the UI against a running OpenCode
- `pnpm tauri dev` — full Tauri dev build on macOS
- `pnpm build:mac` — unsigned universal `.app`
- `./scripts/smoke.sh --offline` — fast pre-push check
- `./scripts/upstream-diff.sh` — submodule drift audit
