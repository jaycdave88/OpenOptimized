/**
 * features/mode/ModeSwitcher.tsx
 *
 * Phase 3 skeleton. Switches the chat composer between execution modes:
 *   - chat      — normal OpenCode session (default)
 *   - plan      — route the task through DeerFlow for decomposition
 *   - review    — read-only review agent (persona-switched)
 *   - research  — route into the autoresearch sidecar
 *
 * Persisted on the session (additive `mode` field in apps/server).
 */

import { For } from "solid-js";
import { MessageSquare, ListTree, Eye, FlaskConical } from "lucide-solid";

export type ChatMode = "chat" | "plan" | "review" | "research";

const MODES: Array<{ id: ChatMode; label: string; icon: typeof MessageSquare }> = [
  { id: "chat", label: "Chat", icon: MessageSquare },
  { id: "plan", label: "Plan (DeerFlow)", icon: ListTree },
  { id: "review", label: "Review", icon: Eye },
  { id: "research", label: "Research", icon: FlaskConical },
];

export default function ModeSwitcher(props: {
  mode: ChatMode;
  onChange: (next: ChatMode) => void;
}) {
  return (
    <div class="flex items-center gap-1 rounded-md border border-dls-border bg-dls-surface p-1">
      <For each={MODES}>
        {(m) => {
          const Icon = m.icon;
          const active = () => props.mode === m.id;
          return (
            <button
              class={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${
                active() ? "bg-dls-accent text-white" : "text-dls-secondary hover:bg-dls-hover"
              }`}
              onClick={() => props.onChange(m.id)}
              title={m.label}
            >
              <Icon size={12} />
              {m.label}
            </button>
          );
        }}
      </For>
    </div>
  );
}
