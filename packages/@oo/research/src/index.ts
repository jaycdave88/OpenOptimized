/**
 * @oo/research
 *
 * Wraps the `autoresearch` Python CLI (jaycdave88/autoresearch) as a
 * supervised sidecar process. Exposed to the UI as a `Research` mode via
 * the ModeSwitcher component.
 *
 * Each run:
 *   - gets a unique id
 *   - lives under $APPSUPPORT/OpenOptimized/autoresearch/runs/<id>/
 *   - streams stdout/stderr lines to the UI via an EventEmitter
 *   - supports cancellation via SIGTERM
 *
 * Prerequisites (detected by the orchestrator, not this package):
 *   - Python 3.12 + a bootstrapped venv under
 *     $APPSUPPORT/OpenOptimized/autoresearch/venv/
 *   - See scripts/bootstrap-python-sidecars.sh
 */

import { spawn, type ChildProcess } from "node:child_process";
import { EventEmitter } from "node:events";
import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface ResearchRunOptions {
  /** User prompt / research question. */
  prompt: string;
  /** Absolute path to the Python interpreter (from the bootstrapped venv). */
  python: string;
  /** Absolute path to the autoresearch entrypoint script. */
  entrypoint: string;
  /** Absolute path to $APPSUPPORT/OpenOptimized/autoresearch/runs. */
  runsDir: string;
  /** Extra env vars (e.g., OLLAMA_HOST). */
  env?: Record<string, string>;
}

export interface ResearchRunHandle {
  id: string;
  dir: string;
  events: EventEmitter;
  cancel(): void;
  done: Promise<number | null>;
}

export async function startResearchRun(
  options: ResearchRunOptions,
): Promise<ResearchRunHandle> {
  const id = randomUUID();
  const dir = join(options.runsDir, id);
  await mkdir(dir, { recursive: true });

  const events = new EventEmitter();
  const child: ChildProcess = spawn(
    options.python,
    [options.entrypoint, "--out", dir, "--prompt", options.prompt],
    {
      cwd: dir,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.on("data", (buf) => {
    for (const line of buf.toString("utf8").split("\n")) {
      if (line) events.emit("stdout", { id, line });
    }
  });
  child.stderr?.on("data", (buf) => {
    for (const line of buf.toString("utf8").split("\n")) {
      if (line) events.emit("stderr", { id, line });
    }
  });

  const done = new Promise<number | null>((resolve) => {
    child.once("exit", (code) => {
      events.emit("exit", { id, code });
      resolve(code);
    });
  });

  return {
    id,
    dir,
    events,
    cancel: () => {
      child.kill("SIGTERM");
    },
    done,
  };
}
