/**
 * features/research/ResearchRunLog.tsx
 *
 * Phase 3 placeholder. Renders the stdout/stderr tail of an in-progress
 * autoresearch run. Driven by events from @oo/research via the Tauri bridge.
 */

export default function ResearchRunLog() {
  return (
    <section class="flex flex-col gap-3 p-4">
      <h2 class="text-base font-semibold">Research run log</h2>
      <p class="text-sm text-dls-secondary">
        Phase 3. Tails stdout/stderr from the autoresearch sidecar. Each run
        lives under <code>~/Library/Application Support/OpenOptimized/autoresearch/runs/&lt;id&gt;/</code>.
      </p>
    </section>
  );
}
