/**
 * features/mcp/McpHealthPanel.tsx
 *
 * Bundled MCP health panel. Always shows all 4 known MCPs with
 * descriptions, toggle switches, status badges, and restart controls.
 *
 * Data source: Tauri event `mcp.status` (emitted by @oo/mcp-supervisor via
 * the Rust bridge) and command `mcp_restart`.
 */

import { For, Show, createMemo, createSignal, onCleanup, onMount } from "solid-js";
import {
  ClipboardCopy,
  RotateCw,
  CircleCheck,
  CircleAlert,
  Circle,
  Loader2,
  ChevronDown,
} from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { copyToClipboard } from "../../../lib/clipboard";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import ConfirmModal from "../../confirm-modal";

const FIRST_RUN_KEY = "oo:onboarding-complete-v2";
const LEGACY_FIRST_RUN_KEYS = ["oo:first-run-complete"];

type McpStatus = "starting" | "up" | "down" | "crashed";

interface McpStateSnapshot {
  id: "cocoindex" | "mempalace" | "graphify" | "context-mode";
  status: McpStatus;
  pid?: number;
  restarts: number;
  lastError?: string;
}

/* ── Static registry of bundled MCPs ─────────────────── */

const KNOWN_MCPS = [
  { id: "cocoindex", name: "CocoIndex", description: "AST-based semantic code search — indexes your codebase for intelligent retrieval", icon: "🔍" },
  { id: "mempalace", name: "MemPalace", description: "Long-term persistent memory — remembers context across sessions", icon: "🧠" },
  { id: "graphify", name: "Graphify", description: "Code & doc knowledge graphs — maps relationships in your codebase", icon: "🕸️" },
  { id: "context-mode", name: "context-mode", description: "Context-window pruning — optimizes what the model sees", icon: "✂️" },
] as const;

/* ── Status helpers ──────────────────────────────────── */

const STATUS_ICON = {
  up: CircleCheck,
  down: Circle,
  crashed: CircleAlert,
  starting: Loader2,
} as const;

const STATUS_BADGE: Record<McpStatus, { label: string; classes: string }> = {
  up: { label: "Connected", classes: "bg-green-3 text-green-11" },
  starting: { label: "Starting", classes: "bg-amber-3 text-amber-11" },
  down: { label: "Down", classes: "bg-gray-3 text-gray-11" },
  crashed: { label: "Crashed", classes: "bg-red-3 text-red-11" },
};

const STATUS_ICON_CLASS: Record<McpStatus, string> = {
  up: "text-green-11",
  down: "text-gray-11",
  crashed: "text-red-11",
  starting: "text-amber-11",
};

interface MergedRow {
  id: string;
  name: string;
  description: string;
  icon: string;
  status: McpStatus;
  pid?: number;
  restarts: number;
  lastError?: string;
}

export default function McpHealthPanel() {
  const [rows, setRows] = createSignal<McpStateSnapshot[]>([]);
  const [expandedError, setExpandedError] = createSignal<string | null>(null);
  const [onboardingConfirmOpen, setOnboardingConfirmOpen] = createSignal(false);

  onMount(async () => {
    const initial = await invoke<McpStateSnapshot[]>("oo_mcp_status").catch(() => []);
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

  /* Always show all 4 MCPs, overlaying live status */
  const mergedRows = createMemo<MergedRow[]>(() => {
    const live = rows();
    return KNOWN_MCPS.map((known) => {
      const liveRow = live.find((r) => r.id === known.id);
      return {
        ...known,
        status: liveRow?.status ?? "down",
        pid: liveRow?.pid,
        restarts: liveRow?.restarts ?? 0,
        lastError: liveRow?.lastError,
      };
    });
  });

  const restart = (id: string) =>
    invoke("oo_mcp_restart", { id }).catch(() => {});

  /* ── Copy diagnostics with timed feedback ─────────── */
  const [copyNotice, setCopyNotice] = createSignal<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  const copyDiagnostics = async () => {
    try {
      const report = await invoke<string>("oo_collect_diagnostics");
      await copyToClipboard(report);
      const kb = Math.round(report.length / 1024);
      setCopyNotice(`Copied ${kb} KB`);
    } catch (err) {
      setCopyNotice(`Failed: ${String(err)}`);
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => setCopyNotice(null), 3000);
  };

  onCleanup(() => clearTimeout(copyTimer));

  /* ── Re-run onboarding ────────────────────────────── */
  const reshowOnboarding = () => {
    try {
      window.localStorage.removeItem(FIRST_RUN_KEY);
      for (const legacy of LEGACY_FIRST_RUN_KEYS) {
        window.localStorage.removeItem(legacy);
      }
    } catch {
      // ignore
    }
    window.location.reload();
  };

  const isOn = (status: McpStatus) => status === "up" || status === "starting";

  return (
    <section class="flex flex-col gap-4 p-4">
      {/* ── Header ───────────────────────────────────── */}
      <div class="flex items-center justify-between">
        <h2 class="text-base font-semibold text-dls-text">MCP servers</h2>
        <div class="flex items-center gap-2">
          <Show when={copyNotice()}>
            <span class="text-[11px] font-medium text-green-11">{copyNotice()}</span>
          </Show>
          <button
            class="inline-flex items-center gap-1.5 rounded-lg border border-dls-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-dls-hover transition-colors"
            onClick={copyDiagnostics}
            title="Copy OS + Ollama + MLX + MCP + opencode.json + setup.log tail to clipboard"
          >
            <ClipboardCopy size={12} /> Copy diagnostics
          </button>
        </div>
      </div>

      {/* ── MCP cards ────────────────────────────────── */}
      <div class="flex flex-col gap-2.5">
        <For each={mergedRows()}>
          {(r) => {
            const Icon = () => STATUS_ICON[r.status];
            const badge = () => STATUS_BADGE[r.status];
            const errorExpanded = () => expandedError() === r.id;

            return (
              <div class="rounded-xl border border-dls-border bg-dls-surface transition-colors">
                <div class="flex items-center gap-3 px-4 py-3.5">
                  {/* Icon tile */}
                  <div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-dls-border bg-dls-hover text-base">
                    {r.icon}
                  </div>

                  {/* Name + description */}
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2">
                      <span class="text-sm font-semibold text-dls-text">{r.name}</span>
                      <span class={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${badge().classes}`}>
                        <Icon size={10} class={`${STATUS_ICON_CLASS[r.status]} ${r.status === "starting" ? "animate-spin" : ""}`} />
                        {badge().label}
                      </span>
                      <Show when={r.restarts > 0}>
                        <span class="text-[10px] text-amber-11">{r.restarts} restart{r.restarts > 1 ? "s" : ""}</span>
                      </Show>
                    </div>
                    <p class="mt-0.5 text-xs text-dls-secondary leading-relaxed">{r.description}</p>
                  </div>

                  {/* Restart button */}
                  <button
                    class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dls-border px-2 py-1 text-[11px] font-medium text-dls-secondary hover:bg-dls-hover hover:text-dls-text transition-colors"
                    onClick={() => restart(r.id)}
                    title="Restart this MCP server"
                  >
                    <RotateCw size={12} /> Restart
                  </button>

                  {/* Toggle pill */}
                  <button
                    class={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      isOn(r.status) ? "bg-green-9" : "bg-gray-7"
                    }`}
                    onClick={() => {
                      if (isOn(r.status)) {
                        // No stop command exists — restart as fallback
                        restart(r.id);
                      } else {
                        restart(r.id);
                      }
                    }}
                    title={isOn(r.status) ? "Running" : "Start"}
                  >
                    <span
                      class={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                        isOn(r.status) ? "translate-x-[18px]" : "translate-x-[3px]"
                      }`}
                    />
                  </button>
                </div>

                {/* Error details (expandable) */}
                <Show when={r.lastError}>
                  <div class="border-t border-dls-border">
                    <button
                      class="flex w-full items-center gap-1.5 px-4 py-2 text-left text-[11px] text-red-11 hover:bg-red-2 transition-colors"
                      onClick={() => setExpandedError(errorExpanded() ? null : r.id)}
                    >
                      <ChevronDown
                        size={12}
                        class={`transition-transform ${errorExpanded() ? "rotate-180" : ""}`}
                      />
                      {errorExpanded() ? "Hide error" : "Show error details"}
                    </button>
                    <Show when={errorExpanded()}>
                      <pre class="max-h-32 overflow-auto whitespace-pre-wrap px-4 pb-3 text-[11px] text-red-11/80 font-mono">
                        {r.lastError}
                      </pre>
                    </Show>
                  </div>
                </Show>
              </div>
            );
          }}
        </For>
      </div>

      {/* ── Re-run onboarding (bottom, smaller) ──────── */}
      <div class="mt-2 flex justify-start">
        <button
          class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11px] text-dls-secondary hover:text-dls-text hover:bg-dls-hover transition-colors"
          onClick={() => setOnboardingConfirmOpen(true)}
          title="Clear the first-run flag and re-open the onboarding overlay"
        >
          Re-run onboarding
        </button>
      </div>

      <ConfirmModal
        open={onboardingConfirmOpen()}
        title="Re-run onboarding?"
        message="This will reload the page and show the onboarding setup again. Any unsaved work may be lost."
        confirmLabel="Re-run"
        cancelLabel="Cancel"
        variant="warning"
        onConfirm={reshowOnboarding}
        onCancel={() => setOnboardingConfirmOpen(false)}
      />
    </section>
  );
}
