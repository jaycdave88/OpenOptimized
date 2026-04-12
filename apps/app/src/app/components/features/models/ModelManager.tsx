/**
 * features/models/ModelManager.tsx
 *
 * Phase 1 skeleton. Wires the Ollama model picker and pull progress UI.
 *
 * Data source: invoked Tauri commands (to be added in Phase 1):
 *   - ollama_status        -> { running, version }
 *   - ollama_list_models   -> OllamaModel[]
 *   - ollama_pull_model    -> SSE-like stream of progress chunks
 *
 * Implementation lives in `@oo/ollama-client` (Node/Rust side) and is called
 * from `src-tauri/src/commands/ollama.rs` (to be written).
 */

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import { Download, CircleCheck, CircleAlert, Loader2 } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
}

interface OllamaStatus {
  running: boolean;
  version?: string;
  error?: string;
}

const DEFAULT_MODELS = [
  "qwen2.5-coder:14b",
  "qwen2.5-coder:7b",
  "nomic-embed-text",
  "llama3.1:8b",
  "deepseek-coder-v2:16b",
];

interface OllamaPullProgress {
  name: string;
  status: string;
  total?: number;
  completed?: number;
}

export default function ModelManager() {
  const [status, setStatus] = createSignal<OllamaStatus | null>(null);
  const [models, setModels] = createSignal<OllamaModel[]>([]);
  const [pulling, setPulling] = createSignal<string | null>(null);
  const [progress, setProgress] = createSignal<OllamaPullProgress | null>(null);

  const refresh = async () => {
    const s = await invoke<OllamaStatus>("ollama_status").catch(
      (e) => ({ running: false, error: String(e) }) satisfies OllamaStatus,
    );
    setStatus(s);
    if (s.running) {
      const list = await invoke<OllamaModel[]>("ollama_list_models").catch(() => []);
      setModels(list);
    }
  };

  onMount(async () => {
    await refresh();
    let unlisten: UnlistenFn | undefined;
    unlisten = await listen<OllamaPullProgress>("ollama.pull.progress", (e) => {
      setProgress(e.payload);
    });
    onCleanup(() => unlisten?.());
  });

  const pull = async (name: string) => {
    setPulling(name);
    try {
      await invoke("ollama_pull_model", { name });
      await refresh();
    } finally {
      setPulling(null);
    }
  };

  const has = (name: string) => models().some((m) => m.name === name);

  return (
    <section class="flex flex-col gap-4 p-4">
      <header class="flex items-center gap-2">
        <h2 class="text-base font-semibold">Local models (Ollama)</h2>
        <Show
          when={status()?.running}
          fallback={
            <span class="inline-flex items-center gap-1 text-red-11">
              <CircleAlert size={14} /> not running
            </span>
          }
        >
          <span class="inline-flex items-center gap-1 text-green-11">
            <CircleCheck size={14} /> v{status()?.version}
          </span>
        </Show>
      </header>

      <ul class="divide-y divide-dls-border rounded-lg border border-dls-border">
        <For each={DEFAULT_MODELS}>
          {(name) => (
            <li class="flex items-center justify-between gap-3 px-3 py-2">
              <span class="font-mono text-sm">{name}</span>
              <Show
                when={has(name)}
                fallback={
                  <button
                    class="inline-flex items-center gap-1 text-sm text-dls-accent"
                    disabled={pulling() !== null}
                    onClick={() => pull(name)}
                  >
                    <Show when={pulling() === name} fallback={<Download size={14} />}>
                      <Loader2 size={14} class="animate-spin" />
                    </Show>
                    pull
                  </button>
                }
              >
                <span class="inline-flex items-center gap-1 text-sm text-green-11">
                  <CircleCheck size={14} /> installed
                </span>
              </Show>
            </li>
          )}
        </For>
      </ul>

      <Show when={pulling() && progress()}>
        {(_p) => {
          const p = progress()!;
          const pct = () =>
            p.total && p.completed
              ? Math.round((p.completed / p.total) * 100)
              : null;
          return (
            <div class="flex flex-col gap-1 rounded-md border border-dls-border bg-dls-surface p-2">
              <span class="text-xs">
                {p.name}: <span class="font-mono">{p.status}</span>
                <Show when={pct() !== null}> — {pct()}%</Show>
              </span>
              <Show when={pct() !== null}>
                <div class="h-1 w-full overflow-hidden rounded-full bg-gray-6">
                  <div
                    class="h-full bg-dls-accent transition-all"
                    style={{ width: `${pct()}%` }}
                  />
                </div>
              </Show>
            </div>
          );
        }}
      </Show>

      <p class="text-xs text-dls-secondary">
        Models live under <code>~/.ollama/models</code>. First pull of{" "}
        <code>qwen2.5-coder:14b</code> is multi-GB and runs in the background.
      </p>
    </section>
  );
}
