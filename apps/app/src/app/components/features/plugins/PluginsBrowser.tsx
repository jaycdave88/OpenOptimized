/**
 * features/plugins/PluginsBrowser.tsx
 *
 * Reads the curated plugin shortlist from resources/opencode-plugins.json
 * (via the `oo_plugins_list` Tauri command) and renders it as a browsable
 * list. Source: https://github.com/awesome-opencode/awesome-opencode.
 *
 * Install actions run the plugin's upstream install command via OpenCode's
 * own plugin/skill system; OpenOptimized just surfaces the list.
 */

import { For, Show, createResource } from "solid-js";
import { ExternalLink, Sparkles } from "lucide-solid";
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

export default function PluginsBrowser() {
  const [manifest] = createResource<PluginsManifest>(() =>
    invoke<PluginsManifest>("oo_plugins_list"),
  );

  return (
    <section class="flex flex-col gap-4 p-4">
      <header class="flex items-start justify-between gap-4">
        <div>
          <h2 class="text-base font-semibold">Plugins (awesome-opencode)</h2>
          <p class="text-xs text-dls-secondary">
            Curated OpenCode plugins that work well alongside OpenOptimized's
            bundled MCPs. Source:{" "}
            <button
              class="text-dls-accent hover:underline"
              onClick={() =>
                openUrl("https://github.com/awesome-opencode/awesome-opencode")
              }
            >
              awesome-opencode
            </button>
            .
          </p>
        </div>
      </header>

      <Show when={manifest()} fallback={<p class="text-sm">Loading…</p>}>
        {(m) => (
          <ul class="flex flex-col gap-2">
            <For each={m().plugins}>
              {(plugin) => (
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
                      </div>
                      <p class="mt-1 text-xs text-dls-secondary">
                        {plugin.description}
                      </p>
                      <code class="mt-2 inline-block text-[11px] text-dls-secondary">
                        {plugin.install}
                      </code>
                    </div>
                    <button
                      class="inline-flex items-center gap-1 text-xs text-dls-accent"
                      onClick={() => openUrl(`https://github.com/${plugin.repo}`)}
                    >
                      <ExternalLink size={12} /> repo
                    </button>
                  </div>
                </li>
              )}
            </For>
          </ul>
        )}
      </Show>
    </section>
  );
}
