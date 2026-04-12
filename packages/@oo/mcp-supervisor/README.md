# @oo/mcp-supervisor

Spawn/health/restart layer for OpenOptimized's bundled MCP servers.

**Status:** Phase 1 skeleton. The public API (`McpSupervisor`) is stable and
unit-testable; wire-up into `apps/orchestrator` and the Tauri event bridge
happens in Phase 1.

## Supervised servers

| id | source | purpose |
|----|--------|---------|
| `cocoindex` | jaycdave88/cocoindex-code | AST-based semantic code search |
| `mempalace` | jaycdave88/mempalace | long-term persistent memory |
| `graphify` | jaycdave88/graphify | code/doc knowledge graphs |
| `context-mode` | jaycdave88/context-mode | context-window pruning (ELv2 — desktop-only) |

## Isolation model

One MCP child process per server. A crash emits `mcp.down` + `mcp.stderr`
events; the UI reflects it; other MCPs and the OpenCode session keep running.

## Restart policy

Exponential backoff capped at `MAX_RESTARTS` (default 8). `stop(id)` marks the
server as user-stopped and suppresses auto-restart.
