/**
 * @oo/ollama-client
 *
 * Thin wrapper around the local Ollama REST API (default http://127.0.0.1:11434).
 *
 * Surface:
 *   - detect():  returns { running, version } — used during onboarding and
 *                by the Tauri `ollama_status` command.
 *   - listModels():  proxies /api/tags; used to populate the model picker.
 *   - pullModel(name, onProgress):  proxies /api/pull and streams progress
 *                chunks; used by ModelManager to download defaults (e.g.
 *                qwen2.5-coder:14b, nomic-embed-text) on first run.
 *
 * Notes:
 *   - Kept dependency-free (native fetch + ReadableStream) so it bundles
 *     cleanly into both the Tauri Node sidecar and any future Rust shim.
 *   - No auth — Ollama is bound to localhost.
 */

export interface OllamaDetectResult {
  running: boolean;
  version?: string;
  error?: string;
}

export interface OllamaModel {
  name: string;
  size: number;
  modified_at: string;
  digest: string;
}

export interface OllamaPullProgress {
  status: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export interface OllamaClientOptions {
  baseUrl?: string;
  /** Fetch implementation — override for tests. */
  fetch?: typeof fetch;
}

const DEFAULT_BASE_URL = "http://127.0.0.1:11434";

export class OllamaClient {
  private readonly baseUrl: string;
  private readonly fetch: typeof fetch;

  constructor(options: OllamaClientOptions = {}) {
    this.baseUrl = options.baseUrl ?? DEFAULT_BASE_URL;
    this.fetch = options.fetch ?? globalThis.fetch;
  }

  async detect(): Promise<OllamaDetectResult> {
    try {
      const res = await this.fetch(`${this.baseUrl}/api/version`, {
        method: "GET",
      });
      if (!res.ok) {
        return { running: false, error: `HTTP ${res.status}` };
      }
      const body = (await res.json()) as { version: string };
      return { running: true, version: body.version };
    } catch (err) {
      return {
        running: false,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async listModels(): Promise<OllamaModel[]> {
    const res = await this.fetch(`${this.baseUrl}/api/tags`);
    if (!res.ok) throw new Error(`listModels failed: HTTP ${res.status}`);
    const body = (await res.json()) as { models: OllamaModel[] };
    return body.models ?? [];
  }

  async pullModel(
    name: string,
    onProgress?: (p: OllamaPullProgress) => void,
    signal?: AbortSignal,
  ): Promise<void> {
    const res = await this.fetch(`${this.baseUrl}/api/pull`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, stream: true }),
      signal,
    });
    if (!res.ok || !res.body) {
      throw new Error(`pullModel failed: HTTP ${res.status}`);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        try {
          const progress = JSON.parse(line) as OllamaPullProgress;
          onProgress?.(progress);
        } catch {
          // Ollama occasionally emits non-JSON keepalives; ignore.
        }
      }
    }
  }
}
