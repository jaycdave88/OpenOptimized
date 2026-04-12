/**
 * @oo/config
 *
 * First-run bootstrap. On every app launch:
 *   1. If $APPSUPPORT/OpenOptimized/opencode.json doesn't exist, copy the
 *      bundled resources/opencode.defaults.json into place.
 *   2. If $APPSUPPORT/OpenOptimized/.opencode/agents/ is empty, copy the
 *      bundled resources/agents/*.md personas into it.
 *   3. Resolve absolute paths for bundled MCP binaries (they move from
 *      "resources/mcp-bin/<name>" in dev to "<AppBundle>/Resources/mcp-bin/<name>"
 *      in production) and patch them into opencode.json's `mcp` section.
 *
 * This package does NOT perform IO policy beyond idempotent copies; it never
 * overwrites user edits to opencode.json. Resolution of resource paths is
 * supplied by the caller (Tauri's `resource_dir()` or a dev fallback), so
 * this package stays testable without Tauri.
 */

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export interface BootstrapOptions {
  /** Absolute path to the user's OpenOptimized data dir ($APPSUPPORT/OpenOptimized). */
  userDataDir: string;
  /** Absolute path to the bundled resources dir (Tauri resource_dir() / resources). */
  resourcesDir: string;
}

export interface BootstrapResult {
  createdOpencodeJson: boolean;
  copiedAgents: number;
  mcpBinPaths: Record<string, string>;
}

const MCP_BINS = ["cocoindex", "mempalace", "graphify", "context-mode"] as const;

async function exists(p: string): Promise<boolean> {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
}

async function copyIfMissing(src: string, dest: string): Promise<boolean> {
  if (await exists(dest)) return false;
  await mkdir(dirname(dest), { recursive: true });
  const content = await readFile(src);
  await writeFile(dest, content);
  return true;
}

/**
 * Bootstrap the user's config directory. Idempotent and safe to run on every
 * launch.
 */
export async function bootstrap(options: BootstrapOptions): Promise<BootstrapResult> {
  const { userDataDir, resourcesDir } = options;

  const opencodeSrc = join(resourcesDir, "opencode.defaults.json");
  const opencodeDest = join(userDataDir, "opencode.json");
  const createdOpencodeJson = await copyIfMissing(opencodeSrc, opencodeDest);

  const agentsSrc = join(resourcesDir, "agents");
  const agentsDest = join(userDataDir, ".opencode", "agents");
  let copiedAgents = 0;
  if (await exists(agentsSrc)) {
    await mkdir(agentsDest, { recursive: true });
    const entries = await readdir(agentsSrc, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const src = join(agentsSrc, entry.name);
      const dest = join(agentsDest, entry.name);
      if (await copyIfMissing(src, dest)) copiedAgents += 1;
    }
  }

  const mcpBinPaths: Record<string, string> = {};
  for (const name of MCP_BINS) {
    mcpBinPaths[name] = join(resourcesDir, "mcp-bin", name);
  }

  return { createdOpencodeJson, copiedAgents, mcpBinPaths };
}
