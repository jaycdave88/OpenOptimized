/**
 * features/onboarding/Setup.tsx
 *
 * Phase 1 skeleton. First-launch flow. Three steps:
 *   1. Detect Ollama; offer `brew install ollama` if missing, or "continue
 *      with cloud provider" as an escape hatch.
 *   2. Pull the default coding model (qwen2.5-coder:14b) and embedding model
 *      (nomic-embed-text). Shows progress; can be backgrounded.
 *   3. Bootstrap user data dir (handled by @oo/config on app start — this
 *      step just confirms MCP servers spawned green.
 *
 * Minimal skeleton: the real flow hooks into `@oo/ollama-client`, the
 * `mcp.status` event, and the router.
 */

import { Show, createSignal, onMount } from "solid-js";
import { Download, CircleCheck, CircleAlert } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

type Step = "ollama" | "models" | "mcp" | "done";

export default function Setup(props: { onDone: () => void }) {
  const [step, setStep] = createSignal<Step>("ollama");
  const [ollamaRunning, setOllamaRunning] = createSignal<boolean | null>(null);

  onMount(async () => {
    const s = await invoke<{ running: boolean }>("ollama_status").catch(() => ({
      running: false,
    }));
    setOllamaRunning(s.running);
    if (s.running) setStep("models");
  });

  const skip = () => {
    setStep("done");
    props.onDone();
  };

  return (
    <section class="flex min-h-[420px] flex-col items-center justify-center gap-6 p-6">
      <h1 class="text-xl font-semibold">Welcome to OpenOptimized</h1>

      <Show when={step() === "ollama"}>
        <div class="flex flex-col items-center gap-3 text-center">
          <Show
            when={ollamaRunning() === true}
            fallback={
              <>
                <CircleAlert class="text-amber-11" />
                <p>Ollama isn't running. OpenOptimized runs best against local models.</p>
                <div class="flex gap-2">
                  <button
                    class="rounded-md bg-dls-accent px-3 py-2 text-sm text-white"
                    onClick={() => openUrl("https://ollama.com/download/mac")}
                  >
                    Install Ollama
                  </button>
                  <button class="rounded-md border px-3 py-2 text-sm" onClick={skip}>
                    Skip (use cloud)
                  </button>
                </div>
              </>
            }
          >
            <CircleCheck class="text-green-11" />
            <p>Ollama is running.</p>
          </Show>
        </div>
      </Show>

      <Show when={step() === "models"}>
        <div class="flex flex-col items-center gap-3 text-center">
          <Download />
          <p>Pulling the default coding model. This is a few GB on first run.</p>
          <p class="text-xs text-dls-secondary">
            You can close this dialog — pulls continue in the background.
          </p>
          <button
            class="rounded-md border px-3 py-2 text-sm"
            onClick={() => {
              setStep("mcp");
              props.onDone();
            }}
          >
            Continue
          </button>
        </div>
      </Show>
    </section>
  );
}
