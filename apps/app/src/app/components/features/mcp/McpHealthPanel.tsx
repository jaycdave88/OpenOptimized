/**
 * features/mcp/McpHealthPanel.tsx
 *
 * MCP health panel showing both connected OpenCode MCPs and bundled
 * supervisor MCPs. Connected MCPs come from the connections store;
 * bundled MCPs come from the Tauri `mcp.status` event bridge.
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
  Plug2,
  MonitorSmartphone,
  Globe,
  Zap,
  BookOpen,
  Play,
  Download,
} from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { copyToClipboard } from "../../../lib/clipboard";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import ConfirmModal from "../../confirm-modal";
import { useConnections } from "../../../connections/provider";
import { isTauriRuntime } from "../../../utils";
import type { McpServerEntry, McpStatusMap } from "../../../types";

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
  down: { label: "Not Installed", classes: "bg-purple-3 text-purple-11" },
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

/* ── Connected MCP helpers ────────────────────────────── */

type ConnectedMcpStatus = "connected" | "needs_auth" | "needs_client_registration" | "failed" | "disabled" | "disconnected";

const CONNECTED_BADGE: Record<ConnectedMcpStatus, { label: string; classes: string }> = {
  connected: { label: "Connected", classes: "bg-green-3 text-green-11" },
  needs_auth: { label: "Needs Auth", classes: "bg-amber-3 text-amber-11" },
  needs_client_registration: { label: "Needs Auth", classes: "bg-amber-3 text-amber-11" },
  failed: { label: "Failed", classes: "bg-red-3 text-red-11" },
  disabled: { label: "Disabled", classes: "bg-gray-3 text-gray-11" },
  disconnected: { label: "Disconnected", classes: "bg-gray-3 text-gray-11" },
};

const connectedServiceIcon = (name: string) => {
  const lower = name.toLowerCase();
  if (lower.includes("context")) return Globe;
  if (lower.includes("chrome") || lower.includes("devtools")) return MonitorSmartphone;
  if (lower.includes("linear")) return Zap;
  if (lower.includes("notion")) return BookOpen;
  return Plug2;
};

export default function McpHealthPanel() {
  const connections = useConnections();
  const [rows, setRows] = createSignal<McpStateSnapshot[]>([]);
  const [expandedError, setExpandedError] = createSignal<string | null>(null);
  const [onboardingConfirmOpen, setOnboardingConfirmOpen] = createSignal(false);

  /* ── Connected OpenCode MCPs ──────────────────────── */
  const opencodeMcps = () => connections.mcpServers();
  const opencodeStatuses = () => connections.mcpStatuses();

  const resolveConnectedStatus = (entry: McpServerEntry): ConnectedMcpStatus => {
    if (entry.config.enabled === false) return "disabled";
    const resolved = (opencodeStatuses() ?? {})[entry.name];
    return resolved?.status ?? "disconnected";
  };

  const connectedCount = createMemo(
    () => Object.values(connections.mcpStatuses() ?? {}).filter((status) => status?.status === "connected").length,
  );

  onMount(async () => {
    if (!isTauriRuntime()) return;
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

  const restart = (id: string) => {
    if (!isTauriRuntime()) {
      setBundledNotice("Bundled MCP servers require the OpenWork desktop app to manage.");
      clearTimeout(bundledTimer);
      bundledTimer = setTimeout(() => setBundledNotice(null), 5000);
      return;
    }
    invoke("oo_mcp_restart", { id }).catch(() => {});
  };

  /* ── Copy diagnostics with timed feedback ─────────── */
  const [copyBusy, setCopyBusy] = createSignal(false);
  const [copyNotice, setCopyNotice] = createSignal<string | null>(null);
  let copyTimer: ReturnType<typeof setTimeout> | undefined;

  const buildBrowserDiagnostics = (): string => {
    const lines: string[] = [];
    lines.push("=== OpenWork Diagnostics (Browser Mode) ===");
    lines.push(`Timestamp: ${new Date().toISOString()}`);
    lines.push(`User-Agent: ${navigator.userAgent}`);
    lines.push(`URL: ${window.location.href}`);
    lines.push("");

    lines.push("--- Configured MCP Servers ---");
    const servers = connections.mcpServers();
    if (servers.length === 0) {
      lines.push("(none)");
    } else {
      for (const srv of servers) {
        const enabled = srv.config.enabled !== false ? "enabled" : "disabled";
        lines.push(`  ${srv.name} [${enabled}]`);
      }
    }
    lines.push("");

    lines.push("--- MCP Statuses ---");
    const statuses = connections.mcpStatuses() ?? {};
    const statusEntries = Object.entries(statuses);
    if (statusEntries.length === 0) {
      lines.push("(none)");
    } else {
      for (const [name, info] of statusEntries) {
        lines.push(`  ${name}: ${info?.status ?? "unknown"}`);
      }
    }
    lines.push("");

    lines.push("--- Bundled MCP Status ---");
    for (const row of mergedRows()) {
      lines.push(`  ${row.label} (${row.id}): ${row.status}${row.pid ? ` pid=${row.pid}` : ""}${row.restarts ? ` restarts=${row.restarts}` : ""}`);
      if (row.lastError) lines.push(`    lastError: ${row.lastError}`);
    }
    lines.push("");

    return lines.join("\n");
  };

  const copyDiagnostics = async () => {
    setCopyBusy(true);
    setCopyNotice(null);
    try {
      let report: string;
      if (isTauriRuntime()) {
        report = await invoke<string>("oo_collect_diagnostics");
      } else {
        report = buildBrowserDiagnostics();
      }
      const ok = await copyToClipboard(report);
      if (ok) {
        setCopyNotice(`Copied ${Math.round(report.length / 1024)} KB to clipboard`);
      } else {
        (window as unknown as { __ooDiagnostics?: string }).__ooDiagnostics = report;
        setCopyNotice("Clipboard unavailable; use devtools: window.__ooDiagnostics");
      }
    } catch (err) {
      setCopyNotice(`Failed: ${String(err)}`);
    } finally {
      setCopyBusy(false);
    }
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => setCopyNotice(null), 5000);
  };

  onCleanup(() => clearTimeout(copyTimer));

  /* ── Bundled MCP notice for non-Tauri mode ────────── */
  const [bundledNotice, setBundledNotice] = createSignal<string | null>(null);
  let bundledTimer: ReturnType<typeof setTimeout> | undefined;
  onCleanup(() => clearTimeout(bundledTimer));

  /* ── Boot all bundled MCPs ───────────────────────── */
  const [bootBusy, setBootBusy] = createSignal(false);

  const bootAllMcps = async () => {
    if (!isTauriRuntime()) {
      setBundledNotice("Bundled MCP servers require the OpenWork desktop app to install. Please use the desktop app to manage bundled servers.");
      clearTimeout(bundledTimer);
      bundledTimer = setTimeout(() => setBundledNotice(null), 8000);
      return;
    }
    setBootBusy(true);
    try {
      await invoke("oo_mcp_boot");
    } catch {
      // ignore — individual status events will reflect failures
    } finally {
      setBootBusy(false);
    }
  };

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
            class="inline-flex items-center gap-1.5 rounded-lg border border-dls-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-dls-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={copyDiagnostics}
            disabled={copyBusy()}
            title="Copy OS + Ollama + MLX + MCP + opencode.json + setup.log tail to clipboard"
          >
            <Show when={copyBusy()} fallback={<ClipboardCopy size={12} />}>
              <Loader2 size={12} class="animate-spin" />
            </Show>
            Copy diagnostics
          </button>
        </div>
      </div>

      {/* ── Connected Apps (OpenCode MCPs) ─────────── */}
      <Show when={opencodeMcps().length > 0}>
        <div class="flex flex-col gap-2.5">
          <div class="flex items-center gap-2">
            <h3 class="text-[11px] font-bold text-dls-secondary uppercase tracking-widest">Connected Apps</h3>
            <Show when={connectedCount() > 0}>
              <span class="inline-flex items-center gap-1 rounded-full bg-green-3 px-2 py-0.5 text-[10px] font-medium text-green-11">
                {connectedCount()} active
              </span>
            </Show>
          </div>
          <For each={opencodeMcps()}>
            {(entry) => {
              const status = () => resolveConnectedStatus(entry);
              const badge = () => CONNECTED_BADGE[status()];
              const Icon = connectedServiceIcon(entry.name);
              const isConnected = () => status() === "connected";
              const typeLabel = () => entry.config.type === "remote" ? "Remote" : "Local";

              return (
                <div class="rounded-xl border border-dls-border bg-dls-surface transition-colors">
                  <div class="flex items-center gap-3 px-4 py-3.5">
                    {/* Icon tile */}
                    <div class={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border ${
                      isConnected() ? "bg-green-3 border-green-6" : "bg-dls-hover border-dls-border"
                    }`}>
                      <Icon size={16} class={isConnected() ? "text-green-11" : "text-dls-secondary"} />
                    </div>

                    {/* Name + description */}
                    <div class="min-w-0 flex-1">
                      <div class="flex items-center gap-2">
                        <span class="text-sm font-semibold text-dls-text">{entry.name}</span>
                        <span class={`inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium ${badge().classes}`}>
                          {badge().label}
                        </span>
                        <span class="text-[10px] text-dls-secondary bg-dls-hover px-1.5 py-0.5 rounded-md">
                          {typeLabel()}
                        </span>
                      </div>
                      <p class="mt-0.5 text-xs text-dls-secondary leading-relaxed">
                        {entry.config.type === "remote" ? entry.config.url : entry.config.command?.join(" ")}
                      </p>
                    </div>

                    {/* Toggle pill */}
                    <button
                      class={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                        isConnected() ? "bg-green-9" : "bg-gray-7"
                      }`}
                      onClick={() => {
                        connections.toggleMcpConnection(entry.name, isConnected());
                      }}
                      title={isConnected() ? "Connected" : "Disconnected"}
                    >
                      <span
                        class={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                          isConnected() ? "translate-x-[18px]" : "translate-x-[3px]"
                        }`}
                      />
                    </button>
                  </div>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

      {/* ── Bundled Servers (supervisor MCPs) ─────────── */}
      <div class="flex flex-col gap-2.5">
        <div class="flex items-center justify-between">
          <h3 class="text-[11px] font-bold text-dls-secondary uppercase tracking-widest">Bundled Servers</h3>
          <button
            class="inline-flex items-center gap-1.5 rounded-lg border border-dls-border px-2.5 py-1.5 text-[11px] font-medium hover:bg-dls-hover transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={bootAllMcps}
            disabled={bootBusy()}
            title="Install and start all bundled MCP servers"
          >
            <Show when={bootBusy()} fallback={<Download size={12} />}>
              <Loader2 size={12} class="animate-spin" />
            </Show>
            {mergedRows().some((r) => r.status === "up") ? "Reinstall All" : "Install & Start All"}
          </button>
        </div>
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

                  {/* Action button — context-dependent */}
                  <Show when={r.status === "up"}>
                    <span class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-green-3 px-2 py-1 text-[11px] font-medium text-green-11">
                      <CircleCheck size={12} /> Running
                    </span>
                  </Show>
                  <Show when={r.status === "down"}>
                    <button
                      class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dls-border px-2 py-1 text-[11px] font-medium text-dls-secondary hover:bg-dls-hover hover:text-dls-text transition-colors"
                      onClick={bootAllMcps}
                      disabled={bootBusy()}
                      title="Install and start MCP servers"
                    >
                      <Show when={bootBusy()} fallback={<Play size={12} />}>
                        <Loader2 size={12} class="animate-spin" />
                      </Show>
                      Install
                    </button>
                  </Show>
                  <Show when={r.status === "crashed"}>
                    <button
                      class="inline-flex shrink-0 items-center gap-1 rounded-lg border border-dls-border px-2 py-1 text-[11px] font-medium text-red-11 hover:bg-red-2 transition-colors"
                      onClick={() => restart(r.id)}
                      title="Restart this crashed MCP server"
                    >
                      <RotateCw size={12} /> Restart
                    </button>
                  </Show>
                  <Show when={r.status === "starting"}>
                    <span class="inline-flex shrink-0 items-center gap-1 rounded-lg bg-amber-3 px-2 py-1 text-[11px] font-medium text-amber-11">
                      <Loader2 size={12} class="animate-spin" /> Starting
                    </span>
                  </Show>

                  {/* Toggle pill */}
                  <button
                    class={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                      isOn(r.status) ? "bg-green-9" : "bg-gray-7"
                    }`}
                    onClick={() => {
                      if (isOn(r.status)) {
                        restart(r.id);
                      } else {
                        bootAllMcps();
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
