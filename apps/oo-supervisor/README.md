# apps/oo-supervisor

OpenOptimized MCP supervisor sidecar. Spawned by the Tauri shell alongside
the other openwork sidecars. Reads the user's `opencode.json`, spawns
bundled MCP servers, and bridges them to the UI over a stdin/stdout JSON
event protocol.

## Protocol

- **stdout** (events): newline-delimited JSON, one event per line. Each event
  has a `type` field. Examples:
  - `{"type":"ready","registered":["cocoindex","mempalace"]}`
  - `{"type":"mcp.status","id":"cocoindex","status":"up","pid":1234,"restarts":0}`
  - `{"type":"mcp.stderr","id":"cocoindex","chunk":"..."}`
  - `{"type":"config.missing","path":"...","error":"..."}`
  - `{"type":"shutdown"}`
  - `{"type":"fatal","error":"..."}`

- **stdin** (commands): newline-delimited JSON, one command per line:
  - `{"type":"status"}` → emits a `snapshot` event
  - `{"type":"restart","id":"cocoindex"}`
  - `{"type":"stop","id":"cocoindex"}`

## Wiring

The Rust Tauri commands `oo_mcp_status` / `oo_mcp_restart` (in
`apps/desktop/src-tauri/src/commands/oo_mcp.rs`) will forward requests to
this sidecar's stdin and re-emit stdout events as Tauri `mcp.status`
events. Phase 1 has the Rust side reading `opencode.json` directly; Phase 2
replaces that with stdout forwarding from this process.

## Dev

```bash
OO_USER_DATA_DIR=./dev-state pnpm --filter oo-supervisor dev
```
