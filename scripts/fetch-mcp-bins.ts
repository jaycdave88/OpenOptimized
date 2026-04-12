/**
 * scripts/fetch-mcp-bins.ts
 *
 * DEPRECATED. Kept as a thin shim for backwards compatibility.
 *
 * Level A (fetch prebuilt release binaries) was only viable once upstream
 * MCP repos published tagged release artifacts — which they don't yet.
 * Level B replaces it: each MCP is a git submodule under `vendor/` and is
 * built from source into `resources/mcp-bin/<name>/` by
 * `scripts/build-mcp-bins.sh`.
 *
 * This shim simply invokes the new script so existing npm/pnpm commands
 * (`pnpm fetch:mcp`) keep working.
 */

import { spawnSync } from "node:child_process";
import { join } from "node:path";

const root = join(new URL(".", import.meta.url).pathname, "..");
const script = join(root, "scripts", "build-mcp-bins.sh");

console.log(
  "[fetch-mcp-bins] deprecated — delegating to scripts/build-mcp-bins.sh",
);
const result = spawnSync("bash", [script], {
  cwd: root,
  stdio: "inherit",
});
process.exit(result.status ?? 1);
