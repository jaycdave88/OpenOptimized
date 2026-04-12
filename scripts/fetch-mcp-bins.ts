/**
 * scripts/fetch-mcp-bins.ts
 *
 * Download prebuilt MCP server binaries into resources/mcp-bin/ for release
 * builds. Pin-and-checksum each binary so reproducible builds verify and
 * `@oo/mcp-supervisor` refuses to launch a tampered binary.
 *
 * Usage:
 *   pnpm fetch:mcp            # both arm64 + x86_64
 *   pnpm fetch:mcp --arch=arm64
 *
 * Manifest is inline (below) and version-controlled. Bumping a pinned SHA is
 * a deliberate, reviewable change.
 *
 * Status: Phase 0 skeleton. The actual release URLs + checksums are TBD and
 * will land once each upstream repo publishes tagged binaries. Until then,
 * running this is a no-op unless OO_FETCH_ACTUAL=1 is set.
 */

import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join, dirname } from "node:path";

type Arch = "arm64" | "x86_64";

interface BinaryManifestEntry {
  id: string;
  owner: string;
  repo: string;
  commit: string;
  artifacts: Record<Arch, { url: string; sha256: string } | null>;
}

/**
 * PIN MANIFEST — one commit SHA per MCP; artifact URLs + SHA-256 TBD when
 * upstream repos publish release binaries. Bumping these is reviewable.
 */
const MANIFEST: BinaryManifestEntry[] = [
  {
    id: "cocoindex",
    owner: "jaycdave88",
    repo: "cocoindex-code",
    commit: "HEAD",
    artifacts: { arm64: null, x86_64: null },
  },
  {
    id: "mempalace",
    owner: "jaycdave88",
    repo: "mempalace",
    commit: "HEAD",
    artifacts: { arm64: null, x86_64: null },
  },
  {
    id: "graphify",
    owner: "jaycdave88",
    repo: "graphify",
    commit: "HEAD",
    artifacts: { arm64: null, x86_64: null },
  },
  {
    id: "context-mode",
    owner: "jaycdave88",
    repo: "context-mode",
    commit: "HEAD",
    artifacts: { arm64: null, x86_64: null },
  },
];

async function sha256OfBuffer(buf: Uint8Array): Promise<string> {
  const h = createHash("sha256");
  h.update(buf);
  return h.digest("hex");
}

async function downloadTo(
  url: string,
  dest: string,
  expectedSha256: string,
): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const actual = await sha256OfBuffer(buf);
  if (actual !== expectedSha256) {
    throw new Error(
      `checksum mismatch for ${url}: expected ${expectedSha256}, got ${actual}`,
    );
  }
  await mkdir(dirname(dest), { recursive: true });
  await writeFile(dest, buf, { mode: 0o755 });
}

async function main(): Promise<void> {
  const archFlag = process.argv.find((a) => a.startsWith("--arch="));
  const archs: Arch[] = archFlag
    ? [archFlag.split("=")[1] as Arch]
    : ["arm64", "x86_64"];

  const outBase = join(process.cwd(), "resources", "mcp-bin");
  const manifestPath = join(outBase, "manifest.json");
  const resolved: Array<{ id: string; arch: Arch; path: string }> = [];

  if (process.env.OO_FETCH_ACTUAL !== "1") {
    console.log(
      "[fetch-mcp-bins] dry run (OO_FETCH_ACTUAL != 1) — no downloads.",
    );
    console.log(
      "[fetch-mcp-bins] when upstream publishes binaries, fill in artifact URLs + sha256 in scripts/fetch-mcp-bins.ts and re-run.",
    );
    await mkdir(outBase, { recursive: true });
    await writeFile(
      manifestPath,
      JSON.stringify({ dryRun: true, manifest: MANIFEST }, null, 2),
    );
    return;
  }

  for (const entry of MANIFEST) {
    for (const arch of archs) {
      const artifact = entry.artifacts[arch];
      if (!artifact) {
        throw new Error(`no ${arch} artifact for ${entry.id}`);
      }
      const dest = join(outBase, arch, entry.id);
      console.log(`[fetch-mcp-bins] ${entry.id} (${arch}) → ${dest}`);
      await downloadTo(artifact.url, dest, artifact.sha256);
      resolved.push({ id: entry.id, arch, path: dest });
    }
  }

  await writeFile(manifestPath, JSON.stringify({ resolved }, null, 2));
  console.log(`[fetch-mcp-bins] wrote ${manifestPath}`);
}

main().catch((err) => {
  console.error("[fetch-mcp-bins] failed:", err);
  process.exit(1);
});
