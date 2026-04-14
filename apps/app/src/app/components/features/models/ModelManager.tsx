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

import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
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

function formatSize(bytes: number): string {
  if (bytes >= 1e9) return (bytes / 1e9).toFixed(1) + " GB";
  if (bytes >= 1e6) return (bytes / 1e6).toFixed(0) + " MB";
  return (bytes / 1e3).toFixed(0) + " KB";
}

interface ModelEntry {
  name: string;
  installed: boolean;
  suggested: boolean;
  size?: number;
}

export default function ModelManager() {
  const [status, setStatus] = createSignal<OllamaStatus | null>(null);
  const [models, setModels] = createSignal<OllamaModel[]>([]);
  const [pulling, setPulling] = createSignal<string | null>(null);
  const [progress, setProgress] = createSignal<OllamaPullProgress | null>(null);
  const [customModel, setCustomModel] = createSignal("");

  const allModels = createMemo<ModelEntry[]>(() => {
    const installed = models();
    const installedNames = new Set(installed.map((m) => m.name));
    const entries: ModelEntry[] = installed.map((m) => ({
      name: m.name,
      installed: true,
      suggested: DEFAULT_MODELS.includes(m.name),
      size: m.size,
    }));
    for (const name of DEFAULT_MODELS) {
      if (!installedNames.has(name)) {
        entries.push({ name, installed: false, suggested: true });
      }
    }
    return entries;
  });
  const [endpoint, setEndpoint] = createSignal("");
  const [endpointStatus, setEndpointStatus] = createSignal<"ok" | "error" | "checking" | null>(null);

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

  const saveEndpoint = async () => {
    const url = endpoint().trim();
    setEndpointStatus("checking");
    try {
      await invoke("ollama_set_endpoint", { url });
      await refresh();
      setEndpointStatus(status()?.running ? "ok" : "error");
    } catch {
      setEndpointStatus("error");
    }
  };

  onMount(async () => {
    const ep = await invoke<string>("ollama_get_endpoint").catch(() => "");
    setEndpoint(ep);
    await refresh();
    let unlisten: UnlistenFn | undefined;
    unlisten = await listen<OllamaPullProgress>("ollama:pull:progress", (e) => {
      setProgress(e.payload);
    });
    onCleanup(() => unlisten?.());
  });

  const pull = async (name: string) => {
    setPulling(name);
    try {
      await invoke("ollama_pull_model", { name });
      await refresh();
      setCustomModel("");
    } finally {
      setPulling(null);
    }
  };

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

      {/* Ollama endpoint config */}
      <div class="flex items-center gap-2">
        <label class="text-sm text-dls-secondary whitespace-nowrap">Endpoint</label>
        <input
          type="text"
          class="flex-1 rounded-md border border-dls-border bg-dls-surface px-2 py-1.5 text-sm font-mono placeholder:text-dls-secondary/50 focus:outline-none focus:ring-1 focus:ring-dls-accent"
          placeholder="http://127.0.0.1:11434"
          value={endpoint()}
          onInput={(e) => setEndpoint(e.currentTarget.value)}
          onBlur={() => saveEndpoint()}
        />
        <Show when={endpointStatus() === "ok"}>
          <CircleCheck size={16} class="text-green-11 shrink-0" />
        </Show>
        <Show when={endpointStatus() === "error"}>
          <CircleAlert size={16} class="text-red-11 shrink-0" />
        </Show>
        <Show when={endpointStatus() === "checking"}>
          <Loader2 size={16} class="animate-spin text-dls-secondary shrink-0" />
        </Show>
      </div>

      <ul class="divide-y divide-dls-border rounded-lg border border-dls-border">
        <For each={allModels()}>
          {(entry) => (
            <li class="flex items-center justify-between gap-3 px-3 py-2">
              <div class="flex items-center gap-2">
                <span class="font-mono text-sm">{entry.name}</span>
                <Show when={!entry.installed && entry.suggested}>
                  <span class="rounded bg-dls-surface px-1.5 py-0.5 text-[10px] font-medium text-dls-secondary">
                    Suggested
                  </span>
                </Show>
                <Show when={entry.installed && entry.size}>
                  <span class="text-xs text-dls-secondary">
                    {formatSize(entry.size!)}
                  </span>
                </Show>
              </div>
              <Show
                when={entry.installed}
                fallback={
                  <button
                    class="inline-flex items-center gap-1 text-sm text-dls-accent"
                    disabled={pulling() !== null}
                    onClick={() => pull(entry.name)}
                  >
                    <Show when={pulling() === entry.name} fallback={<Download size={14} />}>
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

      <div class="flex gap-2">
        <input
          type="text"
          class="flex-1 rounded-md border border-dls-border bg-dls-surface px-2 py-1.5 text-sm font-mono placeholder:text-dls-secondary/50 focus:outline-none focus:ring-1 focus:ring-dls-accent"
          placeholder="model-name:tag (e.g. mistral:7b)"
          value={customModel()}
          onInput={(e) => setCustomModel(e.currentTarget.value)}
          onKeyDown={(e) => e.key === "Enter" && customModel() && pull(customModel())}
        />
        <button
          class="rounded-md bg-dls-accent px-3 py-1.5 text-sm text-white disabled:opacity-50"
          disabled={!customModel() || pulling() !== null}
          onClick={() => pull(customModel())}
        >
          Pull
        </button>
      </div>

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
