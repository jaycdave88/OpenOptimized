#!/usr/bin/env node
/**
 * oo-supervisor
 *
 * Sidecar process launched by Tauri alongside the other openwork sidecars
 * (opencode, openwork-server, opencode-router, openwork-orchestrator).
 *
 * Responsibilities:
 *   - Read $APPSUPPORT/OpenOptimized/opencode.json and extract the `mcp`
 *     block.
 *   - Spawn one supervised child per enabled MCP server using
 *     @oo/mcp-supervisor.
 *   - Emit newline-delimited JSON events on stdout so the Tauri shell can
 *     forward them as `mcp.status` / `mcp.stderr` events to the UI.
 *   - Listen on stdin for newline-delimited JSON commands: `{ "type":
 *     "restart", "id": "cocoindex" }` etc.
 *
 * No HTTP port, no extra deps beyond @oo/mcp-supervisor — this stays small
 * so bun can compile it to a static binary for the .app bundle.
 */

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  McpSupervisor,
  type McpServerConfig,
  type McpServerId,
} from "@oo/mcp-supervisor";

const KNOWN_IDS: readonly McpServerId[] = [
  "cocoindex",
  "mempalace",
  "graphify",
  "context-mode",
];

interface OpencodeMcpEntry {
  type?: string;
  command?: string[];
  enabled?: boolean;
  environment?: Record<string, string>;
}

interface OpencodeConfig {
  mcp?: Record<string, OpencodeMcpEntry>;
}

function userConfigPath(): string {
  // On macOS and Linux the user-data path ends up here; the Rust side
  // uses Tauri's `app_config_dir()` which resolves to the same location on
  // macOS ($HOME/Library/Application Support/<identifier>). When running
  // under `bun dev` we honor OO_USER_DATA_DIR as an override.
  const override = process.env.OO_USER_DATA_DIR;
  if (override) return join(override, "opencode.json");
  const home = homedir();
  if (process.platform === "darwin") {
    return join(
      home,
      "Library",
      "Application Support",
      "dev.openoptimized.app",
      "opencode.json",
    );
  }
  return join(home, ".config", "OpenOptimized", "opencode.json");
}

async function loadConfig(): Promise<OpencodeConfig> {
  const path = userConfigPath();
  try {
    const raw = await readFile(path, "utf8");
    return JSON.parse(raw) as OpencodeConfig;
  } catch (err) {
    emit({ type: "config.missing", path, error: String(err) });
    return {};
  }
}

function emit(event: Record<string, unknown>): void {
  process.stdout.write(JSON.stringify({ t: Date.now(), ...event }) + "\n");
}

function toServerConfig(
  id: string,
  entry: OpencodeMcpEntry,
): McpServerConfig | null {
  if (!KNOWN_IDS.includes(id as McpServerId)) return null;
  if (entry.enabled === false) return null;
  const cmd = entry.command ?? [];
  if (!cmd[0]) return null;

  // Forward workspace directory so MCP servers (e.g. graphify) can find
  // project-relative files like graphify-out/graph.json.
  const workspaceDir = process.env.OO_WORKSPACE_DIR;
  const env: Record<string, string> = { ...entry.environment };
  if (workspaceDir) {
    env.OO_WORKSPACE_DIR = workspaceDir;
  }

  return {
    id: id as McpServerId,
    command: cmd[0],
    args: cmd.slice(1),
    env: Object.keys(env).length > 0 ? env : undefined,
    cwd: workspaceDir || undefined,
  };
}

async function main(): Promise<void> {
  const sup = new McpSupervisor();
  sup.on("status", (snap) => emit({ type: "mcp.status", ...snap }));
  sup.on("stderr", (payload) => emit({ type: "mcp.stderr", ...payload }));

  const config = await loadConfig();
  const mcp = config.mcp ?? {};
  for (const [id, entry] of Object.entries(mcp)) {
    const cfg = toServerConfig(id, entry);
    if (!cfg) continue;
    sup.register(cfg);
  }
  await sup.startAll();
  emit({ type: "ready", registered: sup.snapshotAll().map((s) => s.id) });

  // Accept commands on stdin.
  process.stdin.setEncoding("utf8");
  let buf = "";
  process.stdin.on("data", (chunk) => {
    buf += chunk;
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl).trim();
      buf = buf.slice(nl + 1);
      if (!line) continue;
      try {
        const cmd = JSON.parse(line) as {
          type: string;
          id?: McpServerId;
        };
        handleCommand(sup, cmd).catch((err) =>
          emit({ type: "error", error: String(err) }),
        );
      } catch {
        emit({ type: "error", error: `bad stdin line: ${line}` });
      }
    }
  });

  const shutdown = async () => {
    await sup.stopAll();
    emit({ type: "shutdown" });
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

async function handleCommand(
  sup: McpSupervisor,
  cmd: { type: string; id?: McpServerId },
): Promise<void> {
  switch (cmd.type) {
    case "status":
      emit({ type: "snapshot", servers: sup.snapshotAll() });
      return;
    case "restart":
      if (!cmd.id) throw new Error("restart requires id");
      await sup.stop(cmd.id);
      await sup.start(cmd.id);
      return;
    case "stop":
      if (!cmd.id) throw new Error("stop requires id");
      await sup.stop(cmd.id);
      return;
    default:
      throw new Error(`unknown command: ${cmd.type}`);
  }
}

main().catch((err) => {
  emit({ type: "fatal", error: String(err) });
  process.exit(1);
});
