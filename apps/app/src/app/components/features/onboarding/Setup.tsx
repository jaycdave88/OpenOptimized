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
  CircleX,
  ClipboardCopy,
  Download,
  FolderPlus,
  Loader2,
  Sparkles,
} from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { copyToClipboard } from "../../../lib/clipboard";

type Step = "system" | "ollama" | "mcp" | "ready";

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
  const [mcpError, setMcpError] = createSignal<string | null>(null);
  const [supervisorBin, setSupervisorBin] = createSignal<string | null>(null);
  const [timedOut, setTimedOut] = createSignal(false);
  const [mcpFailed, setMcpFailed] = createSignal(new Set<string>());

  const unlisteners: UnlistenFn[] = [];

  onMount(async () => {
    const r = await invoke<SystemReport>("oo_system_check").catch(() => null);
    setReport(r);
    if (r?.ollama_running) {
      setStep("ollama");
    }
    // Listen for mcp.status events so step 3 can show live progress
    // and mark crashed/down MCPs as failed immediately.
    unlisteners.push(
      await listen<McpStateSnapshot>("mcp.status", (e) => {
        if (e.payload.status === "up") {
          setMcpUp((prev) => {
            const next = new Set(prev);
            next.add(e.payload.id);
            return next;
          });
        } else if (e.payload.status === "crashed" || e.payload.status === "down") {
          setMcpFailed((prev) => {
            const next = new Set(prev);
            next.add(e.payload.id);
            return next;
          });
        }
      }),
    );
    // Supervisor diagnostics so spin-forever is visible as a real error.
    unlisteners.push(
      await listen<{ bin: string }>("mcp.supervisor.spawning", (e) => {
        setSupervisorBin(e.payload.bin);
      }),
    );
    unlisteners.push(
      await listen<{ stage: string; error: string; id?: string }>("mcp.supervisor.error", (e) => {
        setMcpError(`${e.payload.stage}: ${e.payload.error}`);
        // Mark the specific MCP as failed if an id is provided.
        if (e.payload.id) {
          setMcpFailed((prev) => {
            const next = new Set(prev);
            next.add(e.payload.id!);
            return next;
          });
        }
      }),
    );
    unlisteners.push(
      await listen<{ line: string }>("mcp.supervisor.stderr", (e) => {
        // Tack on up to a few lines so the user sees supervisor startup failures.
        setMcpError((prev) =>
          (prev ? prev + "\n" : "supervisor stderr: ") + e.payload.line,
        );
      }),
    );

    // 30-second timeout: if any MCPs are still spinning, mark them as failed
    // and auto-enable the Next button so users are never stuck.
    const timeoutId = setTimeout(() => {
      setTimedOut(true);
      const allMcps = ["cocoindex", "mempalace", "graphify", "context-mode"];
      const up = mcpUp();
      const failed = mcpFailed();
      const stillPending = allMcps.filter((id) => !up.has(id) && !failed.has(id));
      if (stillPending.length > 0) {
        setMcpFailed((prev) => {
          const next = new Set(prev);
          for (const id of stillPending) next.add(id);
          return next;
        });
      }
    }, 30_000);
    unlisteners.push(() => clearTimeout(timeoutId));
  });

  onCleanup(() => {
    for (const u of unlisteners) u();
  });

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

  const advanceToReady = () => setStep("ready");

  const finish = () => props.onDone();

  const [copyBusy, setCopyBusy] = createSignal(false);
  const [copyNotice, setCopyNotice] = createSignal<string | null>(null);
  const copyDiagnostics = async () => {
    setCopyBusy(true);
    setCopyNotice(null);
    try {
      const report = await invoke<string>("oo_collect_diagnostics");
      const ok = await copyToClipboard(report);
      if (ok) {
        setCopyNotice(`copied ${Math.round(report.length / 1024)} KB to clipboard`);
      } else {
        // Fallback: stash it on window so devtools can grab it.
        (window as unknown as { __ooDiagnostics?: string }).__ooDiagnostics = report;
        setCopyNotice("clipboard unavailable; grep devtools: window.__ooDiagnostics");
      }
    } catch (err) {
      setCopyNotice(`failed: ${String(err)}`);
    } finally {
      setCopyBusy(false);
    }
  };

  return (
    <section class="flex min-h-[460px] flex-col gap-4 p-5">
      <div class="flex items-center justify-between border-b border-dls-border pb-2 text-xs text-dls-secondary">
        <span>
          Step: <span class="font-mono text-dls-text">{step()}</span>
        </span>
        <div class="flex items-center gap-2">
          <Show when={copyNotice()}>
            <span class="text-[11px] text-dls-secondary">{copyNotice()}</span>
          </Show>
          <button
            class="inline-flex items-center gap-1 rounded-md border border-dls-border px-2 py-1 text-[11px] hover:bg-dls-hover"
            onClick={copyDiagnostics}
            disabled={copyBusy()}
            title="Copy OS + Ollama + MLX + MCP + opencode.json + setup.log tail to clipboard for sharing"
          >
            <ClipboardCopy size={12} /> Copy diagnostics
          </button>
        </div>
      </div>

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
                  fallback={
                    <Show
                      when={mcpFailed().has(id)}
                      fallback={<Loader2 size={14} class="animate-spin text-amber-11" />}
                    >
                      <CircleX size={14} class="text-red-11" />
                    </Show>
                  }
                >
                  <CircleCheck size={14} class="text-green-11" />
                </Show>
                <span class="font-mono text-xs">{id}</span>
                <Show when={mcpFailed().has(id) && !mcpUp().has(id)}>
                  <span class="text-[11px] text-red-11">failed to start</span>
                </Show>
              </li>
            )}
          </For>
        </ul>
        <Show when={supervisorBin()}>
          <p class="text-[11px] text-dls-secondary">
            supervisor: <code>{supervisorBin()}</code>
          </p>
        </Show>
        <Show when={mcpError()}>
          <div class="rounded-md border border-red-7/30 bg-red-7/10 p-2">
            <p class="text-xs font-semibold text-red-11">MCP supervisor error</p>
            <pre class="mt-1 whitespace-pre-wrap text-[11px] text-red-11">
              {mcpError()}
            </pre>
          </div>
        </Show>
        <p class="text-[11px] text-dls-secondary">
          You can close this dialog at any time; setup continues in the
          background. Progress is also visible under Settings → MCP servers.
        </p>
        <div class="flex justify-end gap-2">
          <button
            class={`rounded-md px-3 py-2 text-sm ${
              timedOut() || mcpFailed().size > 0
                ? "bg-dls-accent text-white"
                : "border border-dls-border"
            }`}
            onClick={advanceToReady}
          >
            Continue anyway
          </button>
          <button
            class={`rounded-md px-3 py-2 text-sm ${
              timedOut() || mcpFailed().size > 0
                ? "border border-dls-border"
                : "bg-dls-accent text-white"
            }`}
            onClick={advanceToReady}
            disabled={mcpUp().size < 4 && !timedOut() && mcpFailed().size === 0}
          >
            Next
          </button>
        </div>
      </Show>

      <Show when={step() === "ready"}>
        <div>
          <div class="flex items-center gap-2">
            <Sparkles size={16} class="text-amber-11" />
            <h2 class="text-lg font-semibold">You're ready</h2>
          </div>
          <p class="mt-2 text-xs text-dls-secondary">
            OpenOptimized runs sessions per-workspace. To start chatting, add
            a workspace and point it at a local code directory. OpenCode, the
            MCPs, and your configured models all wire up once a workspace is
            selected.
          </p>
        </div>

        <div class="flex flex-col gap-2 rounded-lg border border-dls-border bg-dls-surface p-3 text-xs">
          <span class="font-semibold">What's configured</span>
          <ul class="flex flex-col gap-1 text-dls-secondary">
            <li>
              <Show when={report()?.ollama_running} fallback="Ollama: not running (cloud-only mode)">
                Ollama: running; models land in the picker once a workspace exists
              </Show>
            </li>
            <li>MLX models: started by setup.sh and registered in opencode.json</li>
            <li>MCP servers: configured in opencode.json (4 of them)</li>
            <li>
              <Show when={mcpUp().size >= 4} fallback={`MCP servers: ${mcpUp().size}/4 reporting ready`}>
                MCP servers: all 4 reporting ready
              </Show>
            </li>
          </ul>
        </div>

        <div class="flex flex-col gap-2 rounded-lg border border-amber-7/30 bg-amber-7/10 p-3 text-xs text-amber-11">
          <div class="flex items-center gap-1 font-semibold">
            <FolderPlus size={14} /> Next: add a workspace
          </div>
          <p>
            After you close this dialog, click <span class="font-mono">+ Add workspace</span>
            {" "}in the sidebar (bottom-left) and point it at a local project
            directory. Your model picker will populate once the session starts.
          </p>
        </div>

        <div class="mt-auto flex items-center justify-between">
          <button
            class="inline-flex items-center gap-1 text-xs text-dls-accent hover:underline"
            onClick={copyDiagnostics}
            disabled={copyBusy()}
          >
            <ClipboardCopy size={12} /> Copy startup logs + diagnostics
          </button>
          <button
            class="rounded-md bg-dls-accent px-3 py-2 text-sm text-white"
            onClick={finish}
          >
            Let's go
          </button>
        </div>
      </Show>
    </section>
  );
}
