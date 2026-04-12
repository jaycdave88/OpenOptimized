/**
 * features/mcp/McpHealthPanel.tsx
 *
 * Phase 1 skeleton. Traffic-light status per bundled MCP server, with
 * restart and log-tail.
 *
 * Data source: Tauri event `mcp.status` (emitted by @oo/mcp-supervisor via
 * the Rust bridge) and command `mcp_restart`.
 */

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { RotateCw, CircleCheck, CircleAlert, Circle, Loader2 } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

type McpStatus = "starting" | "up" | "down" | "crashed";

interface McpStateSnapshot {
  id: "cocoindex" | "mempalace" | "graphify" | "context-mode";
  status: McpStatus;
  pid?: number;
  restarts: number;
  lastError?: string;
}

const STATUS_ICON = {
  up: CircleCheck,
  down: Circle,
  crashed: CircleAlert,
  starting: Loader2,
} as const;

const STATUS_CLASS: Record<McpStatus, string> = {
  up: "text-green-11",
  down: "text-gray-11",
  crashed: "text-red-11",
  starting: "text-amber-11",
};

export default function McpHealthPanel() {
  const [rows, setRows] = createSignal<McpStateSnapshot[]>([]);

  onMount(async () => {
    const initial = await invoke<McpStateSnapshot[]>("mcp_status").catch(() => []);
    setRows(initial);
    let unlisten: UnlistenFn | undefined;
    unlisten = await listen<McpStateSnapshot>("mcp.status", (e) => {
      setRows((prev) => {
        const i = prev.findIndex((r) => r.id === e.payload.id);
        if (i === -1) return [...prev, e.payload];
        const copy = prev.slice();
        copy[i] = e.payload;
        return copy;
      });
    });
    onCleanup(() => unlisten?.());
  });

  const restart = (id: McpStateSnapshot["id"]) =>
    invoke("mcp_restart", { id }).catch(() => {});

  return (
    <section class="flex flex-col gap-3 p-4">
      <h2 class="text-base font-semibold">MCP servers</h2>
      <ul class="divide-y divide-dls-border rounded-lg border border-dls-border">
        <For each={rows()}>
          {(r) => {
            const Icon = STATUS_ICON[r.status];
            return (
              <li class="flex items-center justify-between gap-3 px-3 py-2">
                <span class="inline-flex items-center gap-2 font-mono text-sm">
                  <Icon
                    size={14}
                    class={`${STATUS_CLASS[r.status]} ${
                      r.status === "starting" ? "animate-spin" : ""
                    }`}
                  />
                  {r.id}
                  <Show when={r.pid !== undefined}>
                    <span class="text-xs text-dls-secondary">pid {r.pid}</span>
                  </Show>
                </span>
                <span class="flex items-center gap-3">
                  <Show when={r.restarts > 0}>
                    <span class="text-xs text-amber-11">{r.restarts} restart(s)</span>
                  </Show>
                  <button
                    class="inline-flex items-center gap-1 text-sm text-dls-accent"
                    onClick={() => restart(r.id)}
                    title={r.lastError ?? "restart"}
                  >
                    <RotateCw size={14} /> restart
                  </button>
                </span>
              </li>
            );
          }}
        </For>
      </ul>
    </section>
  );
}
