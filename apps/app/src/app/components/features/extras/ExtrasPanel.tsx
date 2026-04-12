/**
 * features/extras/ExtrasPanel.tsx
 *
 * Optional, opt-in integrations that are NOT bundled with the base app:
 *   - Flash-MoE         — native Mac MoE inference (big hardware required)
 *   - MicroFish-En      — AGPL-isolated multi-agent doc platform
 *
 * Each row shows install status (via flash_moe_status / microfish_status)
 * and offers an install / launch action backed by the corresponding Tauri
 * command. Event names are `flash-moe.install`, `microfish.install`,
 * `microfish.launch`.
 */

import { For, Show, createSignal, onMount, onCleanup } from "solid-js";
import { CircleCheck, Circle, Download, Play, CircleAlert } from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";

interface ExtraStatus {
  id: string;
  installed: boolean;
  target?: string;
  installed_at?: string;
  license?: string;
}

interface ExtraDef {
  id: "flash-moe" | "microfish";
  name: string;
  description: string;
  license: string;
  hardware?: string;
  installCmd: string;
  launchCmd?: string;
  statusCmd: string;
  installEvent: string;
  launchEvent?: string;
}

const EXTRAS: ExtraDef[] = [
  {
    id: "flash-moe",
    name: "Flash-MoE (397B Qwen MoE)",
    description:
      "Native Obj-C/Metal inference for a 397B-parameter mixture-of-experts. Opt-in second provider alongside Ollama.",
    license: "TBD (user-installed, not redistributed)",
    hardware: "Apple Silicon, 128 GB RAM recommended",
    installCmd: "flash_moe_install",
    statusCmd: "flash_moe_status",
    installEvent: "flash-moe.install",
  },
  {
    id: "microfish",
    name: "MicroFish-En",
    description:
      "Multi-agent document-to-simulation platform. Runs as a detached process and opens its own web UI in your default browser.",
    license: "AGPL-3.0 (user-installed, not redistributed)",
    installCmd: "microfish_install",
    launchCmd: "microfish_launch",
    statusCmd: "microfish_status",
    installEvent: "microfish.install",
    launchEvent: "microfish.launch",
  },
];

export default function ExtrasPanel() {
  const [statuses, setStatuses] = createSignal<Record<string, ExtraStatus>>({});
  const [busy, setBusy] = createSignal<string | null>(null);
  const [lastEvent, setLastEvent] = createSignal<Record<string, string>>({});

  const refresh = async () => {
    const out: Record<string, ExtraStatus> = {};
    for (const extra of EXTRAS) {
      const s = await invoke<ExtraStatus>(extra.statusCmd).catch(() => ({
        id: extra.id,
        installed: false,
      }));
      out[extra.id] = s;
    }
    setStatuses(out);
  };

  onMount(async () => {
    await refresh();
    const unlisteners: UnlistenFn[] = [];
    for (const extra of EXTRAS) {
      unlisteners.push(
        await listen<Record<string, unknown>>(extra.installEvent, (e) => {
          setLastEvent((prev) => ({
            ...prev,
            [extra.id]: JSON.stringify(e.payload),
          }));
          if ((e.payload as { type?: string }).type === "done") {
            void refresh();
            setBusy(null);
          }
        }),
      );
      if (extra.launchEvent) {
        unlisteners.push(
          await listen<Record<string, unknown>>(extra.launchEvent, (e) => {
            setLastEvent((prev) => ({
              ...prev,
              [extra.id]: JSON.stringify(e.payload),
            }));
          }),
        );
      }
    }
    onCleanup(() => {
      for (const u of unlisteners) u();
    });
  });

  const install = async (extra: ExtraDef) => {
    setBusy(extra.id);
    await invoke(extra.installCmd).catch((err) => {
      setLastEvent((prev) => ({
        ...prev,
        [extra.id]: `error: ${String(err)}`,
      }));
      setBusy(null);
    });
  };

  const launch = async (extra: ExtraDef) => {
    if (!extra.launchCmd) return;
    await invoke(extra.launchCmd).catch((err) => {
      setLastEvent((prev) => ({
        ...prev,
        [extra.id]: `error: ${String(err)}`,
      }));
    });
  };

  return (
    <section class="flex flex-col gap-4 p-4">
      <header>
        <h2 class="text-base font-semibold">Optional extras</h2>
        <p class="text-xs text-dls-secondary">
          Opt-in integrations that are not bundled with the base app. Each
          downloads and runs on your own machine; see LICENSES.md for the
          isolation posture.
        </p>
      </header>

      <ul class="flex flex-col gap-3">
        <For each={EXTRAS}>
          {(extra) => {
            const status = () => statuses()[extra.id];
            return (
              <li class="rounded-lg border border-dls-border bg-dls-surface p-3">
                <div class="flex items-start justify-between gap-3">
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <Show
                        when={status()?.installed}
                        fallback={<Circle size={14} class="text-gray-11" />}
                      >
                        <CircleCheck size={14} class="text-green-11" />
                      </Show>
                      <span class="text-sm font-medium">{extra.name}</span>
                    </div>
                    <p class="mt-1 text-xs text-dls-secondary">
                      {extra.description}
                    </p>
                    <p class="mt-2 text-[11px] text-dls-secondary">
                      <span class="font-mono">{extra.license}</span>
                      <Show when={extra.hardware}>
                        {" · "}
                        <span>{extra.hardware}</span>
                      </Show>
                    </p>
                  </div>
                  <div class="flex flex-col items-end gap-2">
                    <button
                      class="inline-flex items-center gap-1 rounded-md border border-dls-border px-2 py-1 text-xs"
                      disabled={busy() === extra.id}
                      onClick={() => install(extra)}
                    >
                      <Download size={12} />
                      {status()?.installed ? "Reinstall" : "Install"}
                    </button>
                    <Show when={extra.launchCmd && status()?.installed}>
                      <button
                        class="inline-flex items-center gap-1 rounded-md bg-dls-accent px-2 py-1 text-xs text-white"
                        onClick={() => launch(extra)}
                      >
                        <Play size={12} /> Launch
                      </button>
                    </Show>
                  </div>
                </div>
                <Show when={lastEvent()[extra.id]}>
                  <pre class="mt-2 overflow-x-auto rounded bg-gray-2 p-2 text-[10px] text-dls-secondary">
                    {lastEvent()[extra.id]}
                  </pre>
                </Show>
              </li>
            );
          }}
        </For>
      </ul>

      <div class="rounded-md border border-amber-7/30 bg-amber-7/10 p-3">
        <div class="flex items-start gap-2">
          <CircleAlert size={14} class="mt-0.5 text-amber-11" />
          <div class="text-xs text-amber-11">
            MicroFish-En is AGPL-3.0. OpenOptimized launches it as a separate
            process accessed over localhost only; AGPL code never enters the
            OpenOptimized address space. See resources/microfish/README.md.
          </div>
        </div>
      </div>
    </section>
  );
}
