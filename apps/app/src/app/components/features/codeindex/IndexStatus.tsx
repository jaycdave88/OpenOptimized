/**
 * features/codeindex/IndexStatus.tsx
 *
 * Phase 1/2. Status for CocoIndex (semantic, Phase 1) and Graphify
 * (structural, Phase 2). Surfaces:
 *   - per-project coverage
 *   - disk usage under $APPSUPPORT/OpenOptimized/{cocoindex,graphify}
 *   - reindex button
 */

export default function IndexStatus() {
  return (
    <section class="flex flex-col gap-3 p-4">
      <h2 class="text-base font-semibold">Code index</h2>
      <p class="text-sm text-dls-secondary">
        Phase 1 wires CocoIndex (AST-aware semantic search). Phase 2 adds
        Graphify (structural knowledge graph). This panel will show per-project
        coverage, disk usage, and a reindex button.
      </p>
    </section>
  );
}
