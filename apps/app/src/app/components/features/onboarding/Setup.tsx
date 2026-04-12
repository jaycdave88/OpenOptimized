/**
 * features/onboarding/Setup.tsx
 *
 * First-launch onboarding. Four steps:
 *   1. System check — Python 3.12, Ollama, Node, Git presence with
 *      install hints. Blocks only on Python + git being absent; the
 *      rest can be fixed later.
 *   2. Ollama — detect; if missing, offer the download link or "continue
 *      with cloud provider".
 *   3. Boot MCP supervisor — spawns apps/oo-supervisor so MCP child
 *      processes start warming their venvs before the user opens the
 *      chat. Listens to mcp.status events and shows a live tally.
 *   4. Done — sets a localStorage flag so the overlay doesn't re-appear.
 */

import { For, Show, createSignal, onCleanup, onMount } from "solid-js";
import {
  CircleAlert,
  CircleCheck,
  Circle,
  Download,
  Loader2,
} from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";

type Step = "system" | "ollama" | "mcp" | "done";

interface ToolCheck {
  id: string;
  name: string;
  present: boolean;
  version: string | null;
  install_hint: string;
}

interface SystemReport {
  tools: ToolCheck[];
  ollama_running: boolean;
}

interface McpStateSnapshot {
  id: string;
  status: "starting" | "up" | "down" | "crashed";
}

export default function Setup(props: { onDone: () => void }) {
  const [step, setStep] = createSignal<Step>("system");
  const [report, setReport] = createSignal<SystemReport | null>(null);
  const [mcpUp, setMcpUp] = createSignal(new Set<string>());
  const [mcpTotal, setMcpTotal] = createSignal(0);

  let unlistenMcp: UnlistenFn | undefined;

  onMount(async () => {
    const r = await invoke<SystemReport>("oo_system_check").catch(() => null);
    setReport(r);
    if (r?.ollama_running) {
      setStep("ollama");
    }
    // Listen for mcp.status events so step 3 can show live progress even
    // if the user arrives at it via the Continue button rather than auto.
    unlistenMcp = await listen<McpStateSnapshot>("mcp.status", (e) => {
      if (e.payload.status === "up") {
        setMcpUp((prev) => {
          const next = new Set(prev);
          next.add(e.payload.id);
          return next;
        });
      }
    });
  });

  onCleanup(() => unlistenMcp?.());

  const proceedOllama = () => {
    if (report()?.ollama_running) setStep("mcp");
    else setStep("ollama");
  };

  const bootMcp = async () => {
    setStep("mcp");
    await invoke("oo_mcp_boot").catch(() => null);
    // Expect four MCPs. We don't know for sure until the supervisor emits
    // its `ready` event with `registered`; treat four as the typical case.
    setMcpTotal(4);
  };

  const finish = () => {
    setStep("done");
    props.onDone();
  };

  return (
    <section class="flex min-h-[460px] flex-col gap-4 p-5">
      <Show when={step() === "system"}>
        <div>
          <h2 class="text-lg font-semibold">System check</h2>
          <p class="mt-1 text-xs text-dls-secondary">
            Verifying prerequisites. Missing tools block only the specific
            feature that needs them; you can install them later.
          </p>
        </div>
        <Show when={report()} fallback={<p class="text-sm">Running checks…</p>}>
          {(r) => (
            <ul class="flex flex-col gap-1.5 rounded-lg border border-dls-border p-2">
              <For each={r().tools}>
                {(tool) => (
                  <li class="flex items-center justify-between gap-3 px-2 py-1">
                    <span class="flex items-center gap-2">
                      <Show
                        when={tool.present}
                        fallback={<CircleAlert size={14} class="text-amber-11" />}
                      >
                        <CircleCheck size={14} class="text-green-11" />
                      </Show>
                      <span class="text-sm">{tool.name}</span>
                      <Show when={tool.version}>
                        <span class="text-[11px] text-dls-secondary">
                          {tool.version}
                        </span>
                      </Show>
                    </span>
                    <Show when={!tool.present}>
                      <code class="text-[11px] text-dls-secondary">
                        {tool.install_hint}
                      </code>
                    </Show>
                  </li>
                )}
              </For>
            </ul>
          )}
        </Show>
        <div class="flex justify-end gap-2">
          <button
            class="rounded-md border border-dls-border px-3 py-2 text-sm"
            onClick={proceedOllama}
          >
            Continue
          </button>
        </div>
      </Show>

      <Show when={step() === "ollama"}>
        <div>
          <h2 class="text-lg font-semibold">Local inference</h2>
          <p class="mt-1 text-xs text-dls-secondary">
            OpenOptimized runs best against a local Ollama install.
          </p>
        </div>
        <div class="rounded-lg border border-dls-border p-3 text-sm">
          <Show
            when={report()?.ollama_running}
            fallback={
              <div class="flex items-center gap-2 text-amber-11">
                <CircleAlert size={14} />
                Ollama isn't running on 127.0.0.1:11434.
              </div>
            }
          >
            <div class="flex items-center gap-2 text-green-11">
              <CircleCheck size={14} />
              Ollama is running.
            </div>
          </Show>
        </div>
        <div class="flex justify-end gap-2">
          <Show when={!report()?.ollama_running}>
            <button
              class="inline-flex items-center gap-1 rounded-md border border-dls-border px-3 py-2 text-sm"
              onClick={() => openUrl("https://ollama.com/download/mac")}
            >
              <Download size={14} /> Install Ollama
            </button>
            <button
              class="rounded-md border border-dls-border px-3 py-2 text-sm"
              onClick={bootMcp}
            >
              Skip (use cloud)
            </button>
          </Show>
          <Show when={report()?.ollama_running}>
            <button
              class="rounded-md bg-dls-accent px-3 py-2 text-sm text-white"
              onClick={bootMcp}
            >
              Continue
            </button>
          </Show>
        </div>
      </Show>

      <Show when={step() === "mcp"}>
        <div>
          <h2 class="text-lg font-semibold">Bringing up MCP servers</h2>
          <p class="mt-1 text-xs text-dls-secondary">
            CocoIndex, MemPalace, Graphify, and context-mode spawn as child
            processes. First launch also creates a local Python venv for
            each — this can take a minute.
          </p>
        </div>
        <ul class="flex flex-col gap-1.5 rounded-lg border border-dls-border p-2">
          <For each={["cocoindex", "mempalace", "graphify", "context-mode"]}>
            {(id) => (
              <li class="flex items-center gap-2 px-2 py-1 text-sm">
                <Show
                  when={mcpUp().has(id)}
                  fallback={<Loader2 size={14} class="animate-spin text-amber-11" />}
                >
                  <CircleCheck size={14} class="text-green-11" />
                </Show>
                <span class="font-mono text-xs">{id}</span>
              </li>
            )}
          </For>
        </ul>
        <p class="text-[11px] text-dls-secondary">
          You can close this dialog at any time; setup continues in the
          background. Progress is also visible under Settings → MCP servers.
        </p>
        <div class="flex justify-end">
          <button
            class="rounded-md bg-dls-accent px-3 py-2 text-sm text-white"
            onClick={finish}
          >
            Done
          </button>
        </div>
      </Show>
    </section>
  );
}
