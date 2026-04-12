/**
 * features/agents/AgentLibrary.tsx
 *
 * Phase 3 placeholder. Lists the personas under
 * $APPSUPPORT/OpenOptimized/.opencode/agents/ (seeded from resources/agents/
 * on first run; additional personas from jaycdave88/agency-agents can be
 * installed into the same directory).
 *
 * Per-session toggles write the selected personaId into session metadata
 * (additive field on apps/server's session service).
 */

export default function AgentLibrary() {
  return (
    <section class="flex flex-col gap-3 p-4">
      <h2 class="text-base font-semibold">Agent library</h2>
      <p class="text-sm text-dls-secondary">
        Phase 3. Will list installed personas (seeded: repo-navigator,
        refactor-planner, security-reviewer) and allow per-session toggling.
      </p>
    </section>
  );
}
