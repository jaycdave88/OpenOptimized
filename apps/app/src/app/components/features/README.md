# apps/app/src/app/components/features/

OpenOptimized-specific feature panels layered on top of the forked OpenWork UI.

| Panel | Phase | Data source |
|-------|-------|-------------|
| `models/ModelManager.tsx` | 1 | Tauri cmd `ollama_*` → `@oo/ollama-client` |
| `mcp/McpHealthPanel.tsx` | 1 | Tauri event `mcp.status` → `@oo/mcp-supervisor` |
| `onboarding/Setup.tsx` | 1 | Tauri cmds `ollama_status`, `ollama_pull_model` |
| `mode/ModeSwitcher.tsx` | 3 | session metadata (`mode` field on apps/server) |
| `memory/MemoryBrowser.tsx` | 2 | OpenCode MCP tool calls (MemPalace) |
| `codeindex/IndexStatus.tsx` | 1/2 | OpenCode MCP tool calls (CocoIndex + Graphify) |
| `agents/AgentLibrary.tsx` | 3 | `.opencode/agents/*.md` on disk |
| `research/ResearchRunLog.tsx` | 3 | Tauri event stream from `@oo/research` |

## Conventions

- Solid.js (not React — OpenWork's app UI is Solid).
- Import Tauri bindings from `@tauri-apps/api/core` and `@tauri-apps/api/event`.
- Reuse `@openwork/ui` primitives and the existing `./components/button.tsx`
  etc. Do not rebuild primitives; add new ones to `packages/@oo/ui`.
