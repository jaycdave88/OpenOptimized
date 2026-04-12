/**
 * apps/oo-supervisor/script/build.ts
 *
 * Compile src/cli.ts into a standalone binary via `bun build --compile`.
 * Matches the pattern used by apps/opencode-router and apps/orchestrator
 * so Tauri's `externalBin` resolves to a real binary at bundle time.
 *
 * Usage (from the workspace root):
 *   bun apps/oo-supervisor/script/build.ts --outdir apps/oo-supervisor/dist/bin --filename oo-supervisor
 *   bun apps/oo-supervisor/script/build.ts --target bun-darwin-arm64 --target bun-darwin-x64
 */

import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

const bunRuntime = (
  globalThis as typeof globalThis & {
    Bun?: {
      build?: (...args: any[]) => Promise<any>;
      argv?: string[];
    };
  }
).Bun;

if (!bunRuntime?.build || !bunRuntime.argv) {
  console.error("This script must be run with Bun.");
  process.exit(1);
}

const bun = bunRuntime as {
  build: (...args: any[]) => Promise<any>;
  argv: string[];
};

type BuildOptions = {
  targets: string[];
  outdir: string;
  filename: string;
};

function readArgs(argv: string[]): BuildOptions {
  const options: BuildOptions = {
    targets: [],
    outdir: resolve("dist", "bin"),
    filename: "oo-supervisor",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const value = argv[i];
    if (!value) continue;

    if (value === "--target") {
      const next = argv[i + 1];
      if (next) {
        options.targets.push(next);
        i += 1;
      }
      continue;
    }
    if (value.startsWith("--target=")) {
      const next = value.slice("--target=".length).trim();
      if (next) options.targets.push(next);
      continue;
    }
    if (value === "--outdir") {
      const next = argv[i + 1];
      if (next) {
        options.outdir = resolve(next);
        i += 1;
      }
      continue;
    }
    if (value.startsWith("--outdir=")) {
      const next = value.slice("--outdir=".length).trim();
      if (next) options.outdir = resolve(next);
      continue;
    }
    if (value === "--filename") {
      const next = argv[i + 1];
      if (next) {
        options.filename = next;
        i += 1;
      }
      continue;
    }
    if (value.startsWith("--filename=")) {
      const next = value.slice("--filename=".length).trim();
      if (next) options.filename = next;
    }
  }

  return options;
}

function outputName(filename: string, target?: string) {
  const needsExe = target ? target.includes("windows") : process.platform === "win32";
  const suffix = target ? `-${target}` : "";
  const ext = needsExe ? ".exe" : "";
  return `${filename}${suffix}${ext}`;
}

async function buildOnce(
  entrypoint: string,
  outdir: string,
  filename: string,
  target?: string,
) {
  mkdirSync(outdir, { recursive: true });
  const outfile = join(outdir, outputName(filename, target));
  const args = ["build", entrypoint, "--compile", "--outfile", outfile];

  const pkgPath = resolve("package.json");
  try {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };
    if (typeof pkg.version === "string" && pkg.version.trim()) {
      args.push(
        "--define",
        `__OO_SUPERVISOR_VERSION__="${pkg.version.trim()}"`,
      );
    }
  } catch {
    // ignore
  }

  if (target) args.push("--target", target);

  const result = spawnSync("bun", args, { stdio: "inherit" });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const options = readArgs(bun.argv.slice(2));
const entrypoint = resolve("src", "cli.ts");
const targets = options.targets.length ? options.targets : [undefined];

for (const target of targets) {
  await buildOnce(entrypoint, options.outdir, options.filename, target);
}
