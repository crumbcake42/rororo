import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OfficeConfig } from "./config.js";
import { dispatchNext } from "./dispatch.js";

const STATE_FILE = ".office-daemon-state.json";

interface DaemonState {
  paused: boolean;
  startedAt: string;
  lastDispatch: string | null;
}

function statePath(projectRoot: string): string {
  return resolve(projectRoot, STATE_FILE);
}

function loadState(projectRoot: string): DaemonState {
  const path = statePath(projectRoot);
  if (existsSync(path)) {
    return JSON.parse(readFileSync(path, "utf-8"));
  }
  return { paused: false, startedAt: new Date().toISOString(), lastDispatch: null };
}

function saveState(projectRoot: string, state: DaemonState): void {
  writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2));
}

export function pause(projectRoot: string): void {
  const state = loadState(projectRoot);
  state.paused = true;
  saveState(projectRoot, state);
  console.log("Daemon paused.");
}

export function resume(projectRoot: string): void {
  const state = loadState(projectRoot);
  state.paused = false;
  saveState(projectRoot, state);
  console.log("Daemon resumed.");
}

export function isDaemonPaused(projectRoot: string): boolean {
  return loadState(projectRoot).paused;
}

export async function runDaemon(
  config: OfficeConfig,
  projectRoot: string,
  pollIntervalMs = 30_000
): Promise<void> {
  console.log("Agent Office daemon starting...");
  console.log(`Poll interval: ${pollIntervalMs / 1000}s`);
  console.log("Press Ctrl+C to stop.\n");

  const state = loadState(projectRoot);
  state.startedAt = new Date().toISOString();
  state.paused = false;
  saveState(projectRoot, state);

  const shutdown = () => {
    console.log("\nDaemon shutting down.");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  while (true) {
    const currentState = loadState(projectRoot);

    if (currentState.paused) {
      await sleep(pollIntervalMs);
      continue;
    }

    try {
      const dispatched = await dispatchNext(config, projectRoot);
      if (dispatched) {
        currentState.lastDispatch = new Date().toISOString();
        saveState(projectRoot, currentState);
      }
    } catch (error) {
      console.error(
        `Dispatch error: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    await sleep(pollIntervalMs);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
