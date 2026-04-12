import { Show, createSignal, onMount } from "solid-js";
import App from "./app";
import Setup from "./components/features/onboarding/Setup";
import { GlobalSDKProvider } from "./context/global-sdk";
import { GlobalSyncProvider } from "./context/global-sync";
import { LocalProvider } from "./context/local";
import { ServerProvider } from "./context/server";
import { isWebDeployment } from "./lib/openwork-deployment";
import { isTauriRuntime } from "./utils";

const FIRST_RUN_KEY = "oo:first-run-complete";

/**
 * OpenOptimized first-run bootstrap.
 *
 * Runs the idempotent Rust-side bootstrap (copy opencode.defaults.json,
 * seed personas) and returns a boolean indicating whether this session
 * should show the Setup onboarding overlay. We gate the overlay on a
 * localStorage key so users who dismiss it don't see it again — the Rust
 * bootstrap itself is always safe to re-run.
 */
async function runOOBootstrap(): Promise<boolean> {
  if (!isTauriRuntime()) return false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("oo_bootstrap");
  } catch (err) {
    console.warn("[openoptimized] bootstrap failed", err);
  }
  try {
    return typeof window !== "undefined" && !window.localStorage.getItem(FIRST_RUN_KEY);
  } catch {
    return false;
  }
}

export default function AppEntry() {
  const [showSetup, setShowSetup] = createSignal(false);

  onMount(async () => {
    const needsSetup = await runOOBootstrap();
    setShowSetup(needsSetup);
  });

  const dismissSetup = () => {
    setShowSetup(false);
    try {
      window.localStorage.setItem(FIRST_RUN_KEY, String(Date.now()));
    } catch {
      // localStorage unavailable; the overlay is one-shot this session only.
    }
  };

  const defaultUrl = (() => {
    // Desktop app connects to the local OpenCode engine.
    if (isTauriRuntime()) return "http://127.0.0.1:4096";

    // When running the web UI against an OpenWork server (e.g. Docker dev stack),
    // use the server's `/opencode` proxy instead of loopback.
    const openworkUrl =
      typeof import.meta.env?.VITE_OPENWORK_URL === "string"
        ? import.meta.env.VITE_OPENWORK_URL.trim()
        : "";
    if (openworkUrl) {
      return `${openworkUrl.replace(/\/+$/, "")}/opencode`;
    }

    // When the hosted web deployment is served by the OpenWork server,
    // OpenCode is proxied at same-origin `/opencode`.
    if (isWebDeployment() && import.meta.env.PROD && typeof window !== "undefined") {
      return `${window.location.origin}/opencode`;
    }

    // Dev fallback (Vite) - allow overriding for remote debugging.
    const envUrl =
      typeof import.meta.env?.VITE_OPENCODE_URL === "string"
        ? import.meta.env.VITE_OPENCODE_URL.trim()
        : "";
    return envUrl || "http://127.0.0.1:4096";
  })();

  return (
    <ServerProvider defaultUrl={defaultUrl}>
      <GlobalSDKProvider>
        <GlobalSyncProvider>
          <LocalProvider>
            <App />
            <Show when={showSetup()}>
              <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
                <div class="w-[520px] max-w-[92vw] rounded-2xl border border-dls-border bg-dls-surface shadow-2xl">
                  <div class="flex items-center justify-between border-b border-dls-border px-4 py-3">
                    <span class="text-sm font-semibold">Welcome to OpenOptimized</span>
                    <button
                      class="text-xs text-dls-secondary hover:text-dls-text"
                      onClick={dismissSetup}
                    >
                      skip
                    </button>
                  </div>
                  <Setup onDone={dismissSetup} />
                </div>
              </div>
            </Show>
          </LocalProvider>
        </GlobalSyncProvider>
      </GlobalSDKProvider>
    </ServerProvider>
  );
}
