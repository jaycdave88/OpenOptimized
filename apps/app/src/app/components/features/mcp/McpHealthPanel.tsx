/**
 * features/mcp/McpHealthPanel.tsx
 *
 * MCP health panel showing connected OpenCode MCPs.
 * Connected MCPs come from the connections store.
 */

import { For, Show, createMemo, createSignal, onCleanup } from "solid-js";
import {
  ClipboardCopy,
  Loader2,
  ChevronDown,
  Plug2,
  MonitorSmartphone,
  Globe,
  Zap,
  BookOpen,
  RefreshCw,
} from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { copyToClipboard } from "../../../lib/clipboard";
import ConfirmModal from "../../confirm-modal";
import { useConnections } from "../../../connections/provider";
import { useGlobalSDK } from "../../../context/global-sdk";
import { isTauriRuntime } from "../../../utils";
import type { McpServerEntry } from "../../../types";

const FIRST_RUN_KEY = "oo:onboarding-complete-v2";
const LEGACY_FIRST_RUN_KEYS = ["oo:first-run-complete"];

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
  const globalSDK = useGlobalSDK();
  const [onboardingConfirmOpen, setOnboardingConfirmOpen] = createSignal(false);

  /* ── Expandable tool sub-list state ─────────────────── */
  const [expandedMcp, setExpandedMcp] = createSignal<string | null>(null);
  const [mcpTools, setMcpTools] = createSignal<Record<string, string[]>>({});
  const [toolsLoading, setToolsLoading] = createSignal<string | null>(null);

  const fetchToolsForMcp = async (mcpName: string) => {
    if (mcpTools()[mcpName]) return;
    setToolsLoading(mcpName);
    try {
      const client = globalSDK.client();
      const result = await client.tool.ids();
      const allToolIds: string[] = (result as { data?: string[] }).data ?? (Array.isArray(result) ? result : []);
      const prefixes = [
        `${mcpName}_`,           // OpenCode format (primary)
        `mcp__${mcpName}__`,     // legacy
        `mcp:${mcpName}:`,       // legacy
      ];
      const matchedTools = new Set<string>();
      for (const prefix of prefixes) {
        for (const id of allToolIds) {
          if (id.startsWith(prefix)) {
            matchedTools.add(id.slice(prefix.length));
          }
        }
      }
      const tools = Array.from(matchedTools);
      setMcpTools((prev) => ({ ...prev, [mcpName]: tools }));
    } catch {
      setMcpTools((prev) => ({ ...prev, [mcpName]: [] }));
    } finally {
      setToolsLoading(null);
    }
  };

  const toggleMcpExpand = (mcpName: string) => {
    if (expandedMcp() === mcpName) {
      setExpandedMcp(null);
    } else {
      setExpandedMcp(mcpName);
      void fetchToolsForMcp(mcpName);
    }
  };

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

  /* ── Refresh MCP servers ───────────────────────────── */
  const [refreshBusy, setRefreshBusy] = createSignal(false);

  const handleRefresh = async () => {
    setRefreshBusy(true);
    try {
      await connections.refreshMcpServers();
    } finally {
      setRefreshBusy(false);
    }
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
    lines.push(`OpenCode SDK connected: ${globalSDK.client() ? "yes" : "no"}`);
    const lastUpdated = connections.mcpLastUpdatedAt();
    lines.push(`MCP last refreshed: ${lastUpdated ? new Date(lastUpdated).toISOString() : "never"}`);
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
        const statusLine = `  ${name}: ${info?.status ?? "unknown"}`;
        lines.push(statusLine);
        // Include any error or message details from the status object
        const details = info as Record<string, unknown> | undefined;
        if (details?.error) lines.push(`    error: ${String(details.error)}`);
        if (details?.message) lines.push(`    message: ${String(details.message)}`);
      }
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
            onClick={handleRefresh}
            disabled={refreshBusy()}
            title="Refresh MCP server statuses"
          >
            <RefreshCw size={12} class={refreshBusy() ? "animate-spin" : ""} />
            Refresh
          </button>
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

      {/* ── Status message banner ────────────────────── */}
      <Show when={connections.mcpStatus()}>
        <div class="rounded-lg border border-amber-6 bg-amber-3 px-3 py-2 text-[12px] text-amber-11">
          {connections.mcpStatus()}
        </div>
      </Show>

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

              const isExpanded = () => expandedMcp() === entry.name;
              const tools = () => mcpTools()[entry.name];
              const isLoadingTools = () => toolsLoading() === entry.name;

              return (
                <div class="rounded-xl border border-dls-border bg-dls-surface transition-colors">
                  <div
                    class="flex items-center gap-3 px-4 py-3.5 cursor-pointer select-none"
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest("button")) return;
                      toggleMcpExpand(entry.name);
                    }}
                  >
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

                    {/* Expand chevron */}
                    <ChevronDown
                      size={14}
                      class={`shrink-0 text-dls-secondary transition-transform duration-200 ${isExpanded() ? "rotate-180" : ""}`}
                    />

                    {/* Toggle pill */}
                    {(() => {
                      const isToggling = () => connections.mcpTogglingName() === entry.name;
                      return (
                        <button
                          class={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                            isToggling() ? "bg-gray-6 cursor-wait" : isConnected() ? "bg-green-9" : "bg-gray-7"
                          }`}
                          onClick={() => {
                            if (!isToggling()) {
                              connections.toggleMcpConnection(entry.name, isConnected());
                            }
                          }}
                          disabled={isToggling()}
                          title={isToggling() ? "Updating…" : isConnected() ? "Connected" : "Disconnected"}
                        >
                          <Show when={isToggling()} fallback={
                            <span
                              class={`inline-block h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${
                                isConnected() ? "translate-x-[18px]" : "translate-x-[3px]"
                              }`}
                            />
                          }>
                            <Loader2 size={12} class="animate-spin text-white mx-auto" />
                          </Show>
                        </button>
                      );
                    })()}
                  </div>

                  {/* ── Expandable tool list ──────────────── */}
                  <Show when={isExpanded()}>
                    <div class="border-t border-dls-border px-4 py-2.5">
                      <Show when={isLoadingTools()}>
                        <div class="flex items-center gap-2 py-1">
                          <Loader2 size={12} class="animate-spin text-dls-secondary" />
                          <span class="text-[11px] text-dls-secondary">Loading tools…</span>
                        </div>
                      </Show>
                      <Show when={!isLoadingTools() && tools()}>
                        <Show when={tools()!.length > 0} fallback={
                          <span class="text-[11px] text-dls-secondary py-1">No tools available</span>
                        }>
                          <div class="flex flex-wrap gap-1.5">
                            <For each={tools()}>
                              {(tool) => (
                                <span class="inline-flex items-center rounded-md bg-dls-hover px-2 py-1 text-[11px] font-mono text-dls-text">
                                  {tool}
                                </span>
                              )}
                            </For>
                          </div>
                        </Show>
                      </Show>
                      <Show when={!isLoadingTools() && !tools()}>
                        <span class="text-[11px] text-dls-secondary py-1">Tools unavailable</span>
                      </Show>
                    </div>
                  </Show>
                </div>
              );
            }}
          </For>
        </div>
      </Show>

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
