/**
 * features/plugins/PluginsBrowser.tsx
 *
 * Curated awesome-opencode plugin shortlist (resources/opencode-plugins.json)
 * plus live install state from the user's opencode.json `plugin` array.
 *
 * Install writes an entry into the user's opencode.json; OpenCode picks
 * up plugin changes on its next start. We show a reminder banner after
 * install/uninstall to that effect.
 */

import {
  For,
  Show,
  createMemo,
  createResource,
  createSignal,
} from "solid-js";
import {
  CircleCheck,
  Download,
  ExternalLink,
  Sparkles,
  Trash2,
  RotateCw,
} from "lucide-solid";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

interface Plugin {
  id: string;
  name: string;
  category: string;
  description: string;
  repo: string;
  install: string;
  recommended?: boolean;
}

interface PluginsManifest {
  source: string;
  revision: string;
  plugins: Plugin[];
}

/**
 * Derive the opencode.json plugin spec from a manifest entry. We write
 * the short "user/repo" form (GitHub convention) into opencode.json —
 * OpenCode accepts that as an install spec.
 */
function specFor(plugin: Plugin): string {
  return plugin.repo;
}

export default function PluginsBrowser() {
  const [manifest] = createResource<PluginsManifest>(() =>
    invoke<PluginsManifest>("oo_plugins_list"),
  );
  const [installedList, { refetch: refreshInstalled }] = createResource<
    string[]
  >(() => invoke<string[]>("oo_plugin_installed_list").catch(() => []));
  const [busy, setBusy] = createSignal<string | null>(null);
  const [notice, setNotice] = createSignal<string | null>(null);

  const installedSet = createMemo(
    () => new Set<string>(installedList() ?? []),
  );

  const install = async (plugin: Plugin) => {
    setBusy(plugin.id);
    try {
      await invoke("oo_plugin_install", { spec: specFor(plugin) });
      await refreshInstalled();
      setNotice(
        `${plugin.name} added to opencode.json. Restart OpenCode to activate.`,
      );
    } catch (err) {
      setNotice(`install failed: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  const uninstall = async (plugin: Plugin) => {
    setBusy(plugin.id);
    try {
      await invoke("oo_plugin_uninstall", { spec: specFor(plugin) });
      await refreshInstalled();
      setNotice(`${plugin.name} removed from opencode.json.`);
    } catch (err) {
      setNotice(`uninstall failed: ${String(err)}`);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section class="flex flex-col gap-4 p-4">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-base font-semibold">Plugins (awesome-opencode)</h2>
          <p class="text-xs text-dls-secondary">
            Curated OpenCode plugins from{" "}
            <button
              class="text-dls-accent hover:underline"
              onClick={() =>
                openUrl("https://github.com/awesome-opencode/awesome-opencode")
              }
            >
              awesome-opencode
            </button>
            . Installing writes an entry into{" "}
            <code>~/Library/Application Support/dev.openoptimized.app/opencode.json</code>
            ; restart OpenCode to activate.
          </p>
        </div>
        <button
          class="inline-flex items-center gap-1 text-xs text-dls-accent"
          onClick={() => refreshInstalled()}
        >
          <RotateCw size={12} /> refresh
        </button>
      </header>

      <Show when={notice()}>
        <div class="flex items-center justify-between gap-2 rounded-md border border-amber-7/30 bg-amber-7/10 p-2 text-xs text-amber-11">
          <span>{notice()}</span>
          <button
            class="rounded-md bg-amber-11 px-2 py-1 text-[11px] font-semibold text-white hover:bg-amber-12"
            onClick={async () => {
              try {
                await invoke("engine_restart");
                setNotice("OpenCode restarted; plugin changes are now active.");
              } catch (err) {
                setNotice(`restart failed: ${String(err)}`);
              }
            }}
          >
            Restart OpenCode
          </button>
        </div>
      </Show>

      <Show when={manifest()} fallback={<p class="text-sm">Loading…</p>}>
        {(m) => (
          <ul class="flex flex-col gap-2">
            <For each={m().plugins}>
              {(plugin) => {
                const installed = () => installedSet().has(specFor(plugin));
                return (
                  <li class="rounded-lg border border-dls-border bg-dls-surface p-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="flex-1">
                        <div class="flex items-center gap-2">
                          <span class="text-sm font-medium">{plugin.name}</span>
                          <span class="rounded bg-gray-4 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-gray-11">
                            {plugin.category}
                          </span>
                          <Show when={plugin.recommended}>
                            <Sparkles size={12} class="text-amber-11" />
                          </Show>
                          <Show when={installed()}>
                            <span class="inline-flex items-center gap-1 text-[11px] text-green-11">
                              <CircleCheck size={11} /> installed
                            </span>
                          </Show>
                        </div>
                        <p class="mt-1 text-xs text-dls-secondary">
                          {plugin.description}
                        </p>
                        <code class="mt-2 inline-block text-[11px] text-dls-secondary">
                          opencode.json plugin: {specFor(plugin)}
                        </code>
                      </div>
                      <div class="flex flex-col items-end gap-2">
                        <button
                          class="inline-flex items-center gap-1 text-xs text-dls-accent"
                          onClick={() =>
                            openUrl(`https://github.com/${plugin.repo}`)
                          }
                        >
                          <ExternalLink size={12} /> repo
                        </button>
                        <Show
                          when={installed()}
                          fallback={
                            <button
                              class="inline-flex items-center gap-1 rounded-md bg-dls-accent px-2 py-1 text-xs text-white disabled:opacity-40"
                              disabled={busy() === plugin.id}
                              onClick={() => install(plugin)}
                            >
                              <Download size={12} /> install
                            </button>
                          }
                        >
                          <button
                            class="inline-flex items-center gap-1 rounded-md border border-red-7/50 px-2 py-1 text-xs text-red-11 disabled:opacity-40"
                            disabled={busy() === plugin.id}
                            onClick={() => uninstall(plugin)}
                          >
                            <Trash2 size={12} /> remove
                          </button>
                        </Show>
                      </div>
                    </div>
                  </li>
                );
              }}
            </For>
          </ul>
        )}
      </Show>
    </section>
  );
}
