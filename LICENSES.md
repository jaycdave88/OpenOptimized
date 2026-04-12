# Third-party licenses bundled into OpenOptimized

OpenOptimized's own code is MIT (see `LICENSE`). The `.app` bundle includes
third-party binaries, sources, and agent personas; each retains its original
license.

| Component | Source | License | Scope |
|-----------|--------|---------|-------|
| OpenWork (fork base) | jaycdave88/openwork | MIT | embedded, hard fork |
| OpenCode (agent runtime) | sst/opencode | MIT | bundled binary |
| CocoIndex MCP | jaycdave88/cocoindex-code | Apache 2.0 | bundled binary |
| MemPalace MCP | jaycdave88/mempalace | MIT | bundled binary |
| Graphify MCP | jaycdave88/graphify | MIT | bundled binary |
| **context-mode MCP** | jaycdave88/context-mode | **ELv2** | bundled binary — desktop app only |
| DeerFlow | jaycdave88/deer-flow | MIT | installed on first use of Plan mode |
| autoresearch | jaycdave88/autoresearch | MIT | installed on first use of Research mode |
| Agency Agents | jaycdave88/agency-agents | MIT | persona files copied at first run |

## ELv2 note (context-mode)

The Elastic License 2.0 forbids offering the software as a hosted service to
third parties. Bundling it inside a user-installed desktop app is permitted.
OpenOptimized does **not** offer context-mode as a service; it runs as an
MCP child process on the user's machine only.

## Intentionally excluded

| Component | Reason |
|-----------|--------|
| MicroFish-En (jaycdave88/MicroFish-En) | AGPL-3.0 — incompatible with an MIT desktop distribution. May return as an out-of-process optional plugin in a later phase. |
| Flash-MoE (jaycdave88/flash-moe) | Deferred to v2 (native MoE inference; license TBD). |

## Rebuilding the inventory

`scripts/fetch-mcp-bins.ts` records the pinned commit SHA and SHA-256 checksum
of every bundled binary. The manifest is committed; bumping a pin is a
reviewable change.
