/**
 * features/agents/AgentLibrary.tsx
 *
 * Browse and install personas from the vendored agency-agents catalog
 * (`vendor/agency-agents/` submodule, or the staged copy in
 * `resources/agency-agents/` for prod bundles).
 *
 * The three seed personas (repo-navigator, refactor-planner,
 * security-reviewer) are already copied into
 * `$APPSUPPORT/OpenOptimized/.opencode/agents/` by `oo_bootstrap` on
 * first launch — they show up automatically in OpenCode's session agent
 * picker. This panel lets users pull in additional personas from the
 * full 200+ agency-agents catalog.
 */

import { For, Show, createMemo, createResource, createSignal } from "solid-js";
import { CircleCheck, Download, Search } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";

interface AgencyAgent {
  id: string;
  category: string;
  file: string;
}

export default function AgentLibrary() {
  const [agents] = createResource<AgencyAgent[]>(() =>
    invoke<AgencyAgent[]>("agency_agents_list").catch(() => []),
  );
  const [installed, setInstalled] = createSignal<Set<string>>(new Set());
  const [filter, setFilter] = createSignal("");
  const [busy, setBusy] = createSignal<string | null>(null);

  const filtered = createMemo(() => {
    const q = filter().trim().toLowerCase();
    const all = agents() ?? [];
    if (!q) return all;
    return all.filter(
      (a) =>
        a.id.toLowerCase().includes(q) ||
        a.category.toLowerCase().includes(q),
    );
  });

  const categories = createMemo(() => {
    const counts: Record<string, number> = {};
    for (const a of agents() ?? []) {
      counts[a.category] = (counts[a.category] ?? 0) + 1;
    }
    return Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
  });

  const install = async (agent: AgencyAgent) => {
    setBusy(agent.id);
    try {
      await invoke<string>("agency_agents_install", {
        id: agent.id,
        category: agent.category,
      });
      setInstalled((prev) => {
        const next = new Set(prev);
        next.add(agent.id);
        return next;
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="flex flex-col gap-4 p-4">
      <header>
        <h2 class="text-base font-semibold">Agent library</h2>
        <p class="text-xs text-dls-secondary">
          Browse the{" "}
          <code>vendor/agency-agents</code> catalog. Installed personas land
          in <code>.opencode/agents/</code> and become available in
          OpenCode's session agent picker.
        </p>
      </header>

      <div class="flex items-center gap-2 rounded-md border border-dls-border px-3 py-2">
        <Search size={14} class="text-dls-secondary" />
        <input
          type="text"
          class="flex-1 bg-transparent text-sm outline-none"
          placeholder="filter by name or category…"
          value={filter()}
          onInput={(e) => setFilter(e.currentTarget.value)}
        />
      </div>

      <Show when={agents()} fallback={<p class="text-sm">Loading…</p>}>
        <div class="text-xs text-dls-secondary">
          <For each={categories()}>
            {([cat, count]) => (
              <button
                class="mr-2 rounded bg-gray-4 px-1.5 py-0.5 text-[10px] uppercase hover:bg-gray-5"
                onClick={() => setFilter(cat)}
              >
                {cat} ({count})
              </button>
            )}
          </For>
        </div>

        <ul class="flex max-h-[480px] flex-col gap-1 overflow-auto rounded-lg border border-dls-border">
          <For each={filtered()}>
            {(agent) => (
              <li class="flex items-center justify-between gap-3 border-b border-dls-border px-3 py-2 last:border-b-0">
                <span class="flex-1 truncate">
                  <span class="font-mono text-xs">{agent.id}</span>
                  <span class="ml-2 rounded bg-gray-4 px-1.5 py-0.5 text-[10px] uppercase text-gray-11">
                    {agent.category}
                  </span>
                </span>
                <Show
                  when={installed().has(agent.id)}
                  fallback={
                    <button
                      class="inline-flex items-center gap-1 text-xs text-dls-accent disabled:opacity-40"
                      disabled={busy() === agent.id}
                      onClick={() => install(agent)}
                    >
                      <Download size={12} /> install
                    </button>
                  }
                >
                  <span class="inline-flex items-center gap-1 text-xs text-green-11">
                    <CircleCheck size={12} /> installed
                  </span>
                </Show>
              </li>
            )}
          </For>
        </ul>
      </Show>

      <p class="text-[11px] text-dls-secondary">
        Seeded personas (<code>repo-navigator</code>,{" "}
        <code>refactor-planner</code>, <code>security-reviewer</code>) are
        installed automatically at first launch. Additional personas from
        this list write into the same <code>.opencode/agents/</code>{" "}
        directory.
      </p>
    </section>
  );
}
