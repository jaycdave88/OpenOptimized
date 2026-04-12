# Third-party inventory bundled or referenced by OpenOptimized

OpenOptimized's own code is MIT (see `LICENSE`). The `.app` bundle **and the
user-installed extras** invoked through it bring in additional components,
each of which retains its original license. Nothing below is relicensed by
OpenOptimized.

## In the `.app` bundle (shipped with the binary)

| Component | Source | License | Scope |
|-----------|--------|---------|-------|
| OpenWork (fork base) | jaycdave88/openwork | MIT | embedded, hard fork |
| OpenCode (agent runtime) | sst/opencode | MIT | bundled sidecar |
| CocoIndex MCP | jaycdave88/cocoindex-code | Apache 2.0 | bundled binary, runs per-session |
| MemPalace MCP | jaycdave88/mempalace | MIT | bundled binary, persistent memory |
| Graphify MCP | jaycdave88/graphify | MIT | bundled binary, code knowledge graph |
| **context-mode MCP** | jaycdave88/context-mode | **ELv2** | bundled binary, desktop-only use |
| Agency Agents | jaycdave88/agency-agents | MIT | persona `.md` files copied at first run |

## Installed on first use (not bundled, license-respectful)

| Component | Source | License | How delivered |
|-----------|--------|---------|---------------|
| DeerFlow | jaycdave88/deer-flow | MIT | cloned into `$APPSUPPORT/OpenOptimized/deerflow/` on first `Plan` mode use |
| autoresearch | jaycdave88/autoresearch | MIT | cloned into `$APPSUPPORT/OpenOptimized/autoresearch/` on first `Research` mode use |
| Flash-MoE | jaycdave88/flash-moe | TBD upstream | cloned into `$APPSUPPORT/OpenOptimized/flash-moe/` via user action in Settings → Extras |

## Installed on first use with strict license isolation

| Component | License | Isolation posture |
|-----------|---------|-------------------|
| **MicroFish-En** (jaycdave88/MicroFish-En) | **AGPL-3.0** | Never bundled. User-installed into `$APPSUPPORT/OpenOptimized/microfish/` via Settings → Extras. Launched as a detached process with its own venv; accessed over localhost HTTP only, opened in the user's default browser. No MicroFish Python code is loaded into OpenOptimized's Rust/Node processes. Attribution mandatory; redistribution of the bundled `.app` is **not** covered by AGPL because AGPL code is not included. |

## Ecosystem reference

- **awesome-opencode** (github.com/awesome-opencode/awesome-opencode) —
  curated community list. OpenOptimized ships `resources/opencode-plugins.json`
  with a shortlist of entries surfaced in Settings → Plugins. The individual
  plugins (`opencode-mem`, `agent-memory`, `oh-my-opencode`,
  `dynamic-context-pruning`, `morph-fast-apply`, `model-announcer`,
  `opencode-quota`, `opencode-canvas`, `opencode-workspace`,
  `opencode-sessions`) install **via OpenCode's own plugin system** when
  the user chooses to. Each retains its upstream license; OpenOptimized
  does not redistribute them.

## ELv2 note (context-mode)

The Elastic License 2.0 forbids offering the software as a hosted service to
third parties. Bundling it inside a user-installed desktop app is permitted.
OpenOptimized does **not** offer context-mode as a service — it runs as an
MCP child process on the user's machine only.

## AGPL note (MicroFish-En)

Because OpenOptimized does not include AGPL-licensed source or binaries in
its distribution — the `.app` contains only a launcher script that fetches
MicroFish-En into the user's own environment on explicit request — the
overall MIT distribution status is unaffected. Users who install
MicroFish-En accept AGPL-3.0 for that installation independently.

## Reproducibility

The four bundled MCPs are **git submodules** under `vendor/`. Every
release of OpenOptimized pins them at specific commit SHAs (see
`UPSTREAM.md`). Submodule updates are reviewable commits; the source staged
into `resources/mcp-bin/<name>/source/` is regenerated from those pins by
`scripts/build-mcp-bins.sh` on every build.

Install scripts for Flash-MoE and MicroFish-En respect pinned refs via the
`FLASH_MOE_REF` and `MICROFISH_REF` environment variables. The legacy
`scripts/fetch-mcp-bins.ts` is a deprecated shim that now delegates to
`scripts/build-mcp-bins.sh`.
