# resources/mcp-bin/

Prebuilt MCP server binaries bundled into the `.app`. Per-arch (arm64 /
x86_64) subdirectories are populated by `scripts/fetch-mcp-bins.ts` during
release builds.

## Contents (populated by fetch script, not checked in)

| binary | source | license |
|--------|--------|---------|
| `cocoindex` | jaycdave88/cocoindex-code | Apache 2.0 |
| `mempalace` | jaycdave88/mempalace | MIT |
| `graphify` | jaycdave88/graphify | MIT |
| `context-mode` | jaycdave88/context-mode | ELv2 (desktop-only) |

Each binary is pinned to a specific commit SHA + SHA-256 checksum in
`scripts/fetch-mcp-bins.ts`. The supervisor refuses to launch on mismatch.

Binaries are **not** checked into git. Run `pnpm fetch:mcp` before
`pnpm build:mac`.
