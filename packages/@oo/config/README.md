# @oo/config

Idempotent first-run bootstrap for OpenOptimized's user data directory.

**Status:** Phase 0/1 skeleton.

## What it does

1. Copies `resources/opencode.defaults.json` → `$APPSUPPORT/OpenOptimized/opencode.json`
   (only if missing).
2. Copies `resources/agents/*.md` → `$APPSUPPORT/OpenOptimized/.opencode/agents/`
   (only missing files).
3. Resolves absolute paths to bundled MCP binaries for use by
   `@oo/mcp-supervisor`.

## What it does NOT do

- Never overwrites user edits to `opencode.json`.
- Does not manage MCP binary downloads — see `scripts/fetch-mcp-bins.ts`.
- Does not pull Ollama models — see `@oo/ollama-client`.
