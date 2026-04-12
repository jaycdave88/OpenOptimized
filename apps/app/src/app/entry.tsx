import { onMount } from "solid-js";
import App from "./app";
import { GlobalSDKProvider } from "./context/global-sdk";
import { GlobalSyncProvider } from "./context/global-sync";
import { LocalProvider } from "./context/local";
import { ServerProvider } from "./context/server";
import { isWebDeployment } from "./lib/openwork-deployment";
import { isTauriRuntime } from "./utils";

/**
 * OpenOptimized first-run bootstrap.
 *
 * Idempotent: the Rust side skips existing files. Runs once per session on
 * Tauri only — the web deployment has no app-support dir to seed.
 */
async function runOOBootstrap(): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    await invoke("oo_bootstrap");
  } catch (err) {
    // Never let bootstrap failures block the UI from rendering.
    console.warn("[openoptimized] bootstrap failed", err);
  }
}

export default function AppEntry() {
  onMount(() => {
    void runOOBootstrap();
  });

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
          </LocalProvider>
        </GlobalSyncProvider>
      </GlobalSDKProvider>
    </ServerProvider>
  );
}
