import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import type { OfficeConfig } from "./config.js";
import { dispatchNext, writeSignal, type UsageBudget } from "./dispatch.js";
import { getIssue, listIssuesByLabel, setLabels } from "./github.js";
import { notify } from "./notify.js";

const STATE_FILE = ".office-daemon-state.json";
const DEFAULT_HIBERNATION_INTERVAL_S = 300;

export class SessionBudget implements UsageBudget {
  private budgetMs: number;
  private thresholdPct: number;
  private elapsedMs = 0;

  constructor(budgetMinutes: number, thresholdPct: number) {
    this.budgetMs = budgetMinutes * 60 * 1000;
    this.thresholdPct = thresholdPct;
  }

  recordAgentTime(elapsedMs: number): void {
    this.elapsedMs += elapsedMs;
  }

  shouldWindDown(): boolean {
    if (this.budgetMs === 0) return false;
    return this.elapsedMs / this.budgetMs >= this.thresholdPct / 100;
  }

  reason(): string {
    const usedMin = Math.round(this.elapsedMs / 60_000);
    const budgetMin = Math.round(this.budgetMs / 60_000);
    return `${usedMin} of ${budgetMin} minutes consumed (threshold: ${this.thresholdPct}%)`;
  }
}

type DaemonStatusValue = "active" | "hibernation" | "paused";

interface DaemonState {
  status: DaemonStatusValue;
  startedAt: string;
  lastDispatch: string | null;
  tasksDispatched: number;
}

function statePath(projectRoot: string): string {
  return resolve(projectRoot, STATE_FILE);
}

function loadState(projectRoot: string): DaemonState {
  const path = statePath(projectRoot);
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Partial<DaemonState>;
    return {
      status: raw.status ?? "active",
      startedAt: raw.startedAt ?? new Date().toISOString(),
      lastDispatch: raw.lastDispatch ?? null,
      tasksDispatched: raw.tasksDispatched ?? 0,
    };
  }
  return {
    status: "active",
    startedAt: new Date().toISOString(),
    lastDispatch: null,
    tasksDispatched: 0,
  };
}

function saveState(projectRoot: string, state: DaemonState): void {
  writeFileSync(statePath(projectRoot), JSON.stringify(state, null, 2));
}

async function notifyDaemon(
  config: OfficeConfig,
  message: string,
): Promise<void> {
  if (config.notification_mode === "afk") {
    await notify(config, {
      issueNumber: 0,
      title: "Agent Office Daemon",
      message,
      url: "",
    });
  } else {
    console.log(`[daemon] ${message}`);
  }
}

export function pauseDaemon(projectRoot: string): void {
  const state = loadState(projectRoot);
  state.status = "paused";
  saveState(projectRoot, state);
  console.log("Daemon paused.");
}

export async function pausePipeline(
  projectRoot: string,
  issueNumber: number,
): Promise<void> {
  const issue = await getIssue(issueNumber);
  if (!issue.labels.includes("status:in-progress")) {
    console.warn(
      `Issue #${issueNumber} is not in-progress. No signal written.`,
    );
    return;
  }
  writeSignal(projectRoot, issueNumber, "pause");
  console.log(
    `Pause signal written for #${issueNumber}. Pipeline will pause at next step boundary.`,
  );
}

export async function cancelPipeline(
  projectRoot: string,
  issueNumber: number,
): Promise<void> {
  const issue = await getIssue(issueNumber);
  if (!issue.labels.includes("status:in-progress")) {
    console.warn(
      `Issue #${issueNumber} is not in-progress. No signal written.`,
    );
    return;
  }
  writeSignal(projectRoot, issueNumber, "cancel");
  console.log(
    `Cancel signal written for #${issueNumber}. Pipeline will stop at next step boundary.`,
  );
}

export function resumeDaemon(projectRoot: string): void {
  const state = loadState(projectRoot);
  state.status = "active";
  saveState(projectRoot, state);
  console.log("Daemon resumed — will check for ready tasks immediately.");
}

export async function resumePipeline(
  _projectRoot: string,
  issueNumber: number,
): Promise<void> {
  const issue = await getIssue(issueNumber);
  if (!issue.labels.includes("status:paused")) {
    console.warn(`Issue #${issueNumber} is not paused.`);
    return;
  }
  await setLabels(issueNumber, ["status:ready"], ["status:paused"]);
  console.log(
    `Issue #${issueNumber} re-labeled status:ready. Next dispatch cycle will resume the pipeline.`,
  );
}

export function isDaemonPaused(projectRoot: string): boolean {
  return loadState(projectRoot).status === "paused";
}

export async function daemonStatus(projectRoot: string): Promise<void> {
  const state = loadState(projectRoot);
  const uptimeMs = Date.now() - new Date(state.startedAt).getTime();
  const uptimeStr = formatUptime(uptimeMs);

  const lastDispatch = state.lastDispatch
    ? new Date(state.lastDispatch).toLocaleString()
    : "never";

  let queueDepth = "unknown";
  try {
    const readyIssues = await listIssuesByLabel("status:ready");
    queueDepth = String(readyIssues.length);
  } catch {
    // Non-fatal — GitHub may be unavailable
  }

  console.log(`State:            ${state.status}`);
  console.log(`Uptime:           ${uptimeStr}`);
  console.log(`Tasks dispatched: ${state.tasksDispatched}`);
  console.log(`Last dispatch:    ${lastDispatch}`);
  console.log(`Ready queue:      ${queueDepth} tasks`);
}

export async function runDaemon(
  config: OfficeConfig,
  projectRoot: string,
  _pollIntervalMs = 30_000,
): Promise<void> {
  const hibernationIntervalMs =
    (config.daemon.hibernation_interval ?? DEFAULT_HIBERNATION_INTERVAL_S) *
    1000;

  const budgetMinutes = config.daemon.session_budget_minutes ?? 0;
  const thresholdPct = config.daemon.usage_threshold_pct ?? 80;
  const budget: UsageBudget =
    budgetMinutes > 0
      ? new SessionBudget(budgetMinutes, thresholdPct)
      : {
          shouldWindDown: () => false,
          recordAgentTime: () => {},
          reason: () => "",
        };

  console.log("Agent Office daemon starting...");
  console.log(`Hibernation interval: ${hibernationIntervalMs / 1000}s`);
  if (budgetMinutes > 0) {
    console.log(
      `Usage budget: ${budgetMinutes} minutes (wind-down at ${thresholdPct}%)`,
    );
  }
  console.log("Press Ctrl+C to stop.\n");

  saveState(projectRoot, {
    status: "active",
    startedAt: new Date().toISOString(),
    lastDispatch: null,
    tasksDispatched: 0,
  });

  await notifyDaemon(config, "Daemon started.");

  const shutdown = () => {
    console.log("\nDaemon shutting down.");
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  let prevStatus: DaemonStatusValue = "active";

  while (true) {
    const state = loadState(projectRoot);

    if (state.status === "paused") {
      if (prevStatus !== "paused") {
        await notifyDaemon(config, "Daemon paused.");
      }
      prevStatus = "paused";
      await sleep(5_000);
      continue;
    }

    if (prevStatus === "paused") {
      await notifyDaemon(config, "Daemon resumed — checking for ready tasks.");
    }
    prevStatus = state.status;

    // Check usage budget before attempting next dispatch.
    if (budget.shouldWindDown()) {
      state.status = "paused";
      saveState(projectRoot, state);
      await notifyDaemon(
        config,
        `Usage budget wind-down: ${budget.reason()}. Daemon paused. Run \`office resume\` to continue.`,
      );
      prevStatus = "paused";
      continue;
    }

    let result: Awaited<ReturnType<typeof dispatchNext>> = false;
    try {
      result = await dispatchNext(
        config,
        projectRoot,
        undefined,
        undefined,
        budget,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Dispatch error: ${message}`);
      await notifyDaemon(config, `Dispatch error: ${message}`);
    }

    if (result) {
      if (result === "completed") {
        state.tasksDispatched++;
      }
      state.lastDispatch = new Date().toISOString();
      if (budget.shouldWindDown()) {
        state.status = "paused";
        prevStatus = "paused";
      } else if (state.status === "hibernation") {
        state.status = "active";
        console.log("Task found — transitioning to active.");
      }
      saveState(projectRoot, state);
      if (prevStatus !== "paused") {
        prevStatus = state.status;
      }
      continue;
    }

    // Queue is empty
    if (state.status === "active") {
      state.status = "hibernation";
      saveState(projectRoot, state);
      await notifyDaemon(
        config,
        `Queue empty — hibernating. Polling every ${hibernationIntervalMs / 1000}s.`,
      );
      prevStatus = "hibernation";
    }

    await sleep(hibernationIntervalMs);
  }
}

function formatUptime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
