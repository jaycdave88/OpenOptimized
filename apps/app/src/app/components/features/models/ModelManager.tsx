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

import { For, Show, createSignal, onMount } from "solid-js";
import { Download, CircleCheck, CircleAlert, Loader2 } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";

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

export default function ModelManager() {
  const [status, setStatus] = createSignal<OllamaStatus | null>(null);
  const [models, setModels] = createSignal<OllamaModel[]>([]);
  const [pulling, setPulling] = createSignal<string | null>(null);

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

  onMount(refresh);

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

      <p class="text-xs text-dls-secondary">
        Models live under <code>~/.ollama/models</code>. First pull of{" "}
        <code>qwen2.5-coder:14b</code> is multi-GB and runs in the background.
      </p>
    </section>
  );
}
