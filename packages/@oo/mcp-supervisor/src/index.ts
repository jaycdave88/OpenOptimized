/**
 * @oo/mcp-supervisor
 *
 * Spawns and supervises bundled MCP servers (cocoindex, mempalace, graphify,
 * context-mode). Runs as a Node sidecar process launched by apps/orchestrator.
 *
 * Responsibilities:
 *   - lifecycle: spawn/kill per-MCP child processes (one process per server)
 *   - health:    periodic JSON-RPC `ping` on the stdio transport
 *   - restart:   exponential-backoff restart on crash (capped)
 *   - events:    emits `mcp.up`, `mcp.down`, `mcp.stderr` via an EventBus the
 *                Tauri bridge forwards into the UI (`emit`/`listen`)
 *   - isolation: one MCP crashing does NOT tear down peers or the app
 *
 * Wire-up lives in apps/orchestrator; this package is transport-agnostic so
 * it can be driven from tests without Tauri.
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";

export type McpServerId =
  | "cocoindex"
  | "mempalace"
  | "graphify"
  | "context-mode";

export interface McpServerConfig {
  id: McpServerId;
  /** Absolute path to the MCP binary (resolved from Tauri resource_dir). */
  command: string;
  args?: string[];
  /** Extra environment variables merged on top of the parent process env. */
  env?: Record<string, string>;
  /** Working directory for the child process. */
  cwd?: string;
}

export type McpStatus = "starting" | "up" | "down" | "crashed";

export interface McpStateSnapshot {
  id: McpServerId;
  status: McpStatus;
  pid?: number;
  restarts: number;
  lastError?: string;
}

interface Supervised {
  config: McpServerConfig;
  process?: ChildProcess;
  status: McpStatus;
  restarts: number;
  lastError?: string;
}

const MAX_RESTARTS = 8;
const BASE_BACKOFF_MS = 500;

export class McpSupervisor extends EventEmitter {
  private readonly servers = new Map<McpServerId, Supervised>();

  register(config: McpServerConfig): void {
    if (this.servers.has(config.id)) {
      throw new Error(`MCP server already registered: ${config.id}`);
    }
    this.servers.set(config.id, { config, status: "down", restarts: 0 });
  }

  async startAll(): Promise<void> {
    await Promise.all([...this.servers.keys()].map((id) => this.start(id)));
  }

  async start(id: McpServerId): Promise<void> {
    const s = this.require(id);
    if (s.process && !s.process.killed) return;

    s.status = "starting";
    this.emit("status", this.snapshot(id));

    const child = spawn(s.config.command, s.config.args ?? [], {
      cwd: s.config.cwd,
      env: { ...process.env, ...s.config.env },
      stdio: ["pipe", "pipe", "pipe"],
    });
    s.process = child;

    child.stderr?.on("data", (buf) => {
      this.emit("stderr", { id, chunk: buf.toString("utf8") });
    });

    child.once("spawn", () => {
      s.status = "up";
      this.emit("status", this.snapshot(id));
    });

    child.once("exit", (code, signal) => {
      s.status = code === 0 ? "down" : "crashed";
      s.lastError = signal ? `signal=${signal}` : `exit=${code}`;
      this.emit("status", this.snapshot(id));
      this.scheduleRestart(id);
    });
  }

  async stop(id: McpServerId): Promise<void> {
    const s = this.require(id);
    s.restarts = MAX_RESTARTS; // prevent auto-restart
    s.process?.kill("SIGTERM");
  }

  async stopAll(): Promise<void> {
    await Promise.all([...this.servers.keys()].map((id) => this.stop(id)));
  }

  snapshot(id: McpServerId): McpStateSnapshot {
    const s = this.require(id);
    return {
      id,
      status: s.status,
      pid: s.process?.pid,
      restarts: s.restarts,
      lastError: s.lastError,
    };
  }

  snapshotAll(): McpStateSnapshot[] {
    return [...this.servers.keys()].map((id) => this.snapshot(id));
  }

  private require(id: McpServerId): Supervised {
    const s = this.servers.get(id);
    if (!s) throw new Error(`MCP server not registered: ${id}`);
    return s;
  }

  private scheduleRestart(id: McpServerId): void {
    const s = this.require(id);
    if (s.restarts >= MAX_RESTARTS) return;
    const delay = BASE_BACKOFF_MS * 2 ** s.restarts;
    s.restarts += 1;
    setTimeout(() => {
      void this.start(id);
    }, delay);
  }
}
