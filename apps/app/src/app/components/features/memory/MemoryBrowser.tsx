/**
 * features/memory/MemoryBrowser.tsx
 *
 * Phase 2 placeholder. Drives MemPalace's MCP tools (19 of them) for:
 *   - search  (semantic over past exchanges)
 *   - pin     (promote to persistent recall)
 *   - forget  (delete by id)
 *   - recall  (inject into current session context on demand)
 *
 * Data source: MCP tool calls through OpenCode's session API.
 */

export default function MemoryBrowser() {
  return (
    <section class="flex flex-col gap-3 p-4">
      <h2 class="text-base font-semibold">Memory (MemPalace)</h2>
      <p class="text-sm text-dls-secondary">
        Phase 2. Will expose search, pin, forget, and on-demand recall of
        MemPalace-backed memory. The MCP is already registered in
        <code> opencode.json</code>; the panel wires tool calls into a
        browsable UI.
      </p>
    </section>
  );
}
