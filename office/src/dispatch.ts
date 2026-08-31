import {
  readFileSync,
  existsSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
  unlinkSync,
} from "node:fs";
import { execSync, spawn } from "node:child_process";
import { resolve } from "node:path";
import yaml from "js-yaml";
import type { OfficeConfig } from "./config.js";
import { getBaseBranch, getModelForRole } from "./config.js";
import {
  listIssuesByLabel,
  getIssue,
  getIssueComments,
  setLabels,
  addComment,
  createPR,
  getPipelineLabel,
  type GitHubIssue,
} from "./github.js";
import {
  branchName,
  createWorktree,
  cleanupWorktree,
  type WorktreeInfo,
} from "./worktree.js";
import { notify } from "./notify.js";

export interface PipelineStep {
  role: string;
  description: string;
  mode?: string;
  variant?: string;
  instance?: string;
  directive_index?: number;
  rounds?: number;
  blocking?: boolean;
  outputs?: string[];
  inputs?: string[];
}

export interface Pipeline {
  name: string;
  description: string;
  adversarial?: boolean;
  steps: PipelineStep[];
}

export interface UsageBudget {
  shouldWindDown(): boolean;
  recordAgentTime(elapsedMs: number): void;
  reason(): string;
}

export type PipelineSignal = "pause" | "cancel";

export type DispatchResult =
  "completed" | "paused" | "cancelled" | "blocked" | "failed";

interface SignalFile {
  action: PipelineSignal;
}

function signalFilePath(projectRoot: string, issueNumber: number): string {
  return resolve(projectRoot, `.office-signal-${issueNumber}.json`);
}

export function writeSignal(
  projectRoot: string,
  issueNumber: number,
  action: PipelineSignal,
): void {
  const payload: SignalFile = { action };
  writeFileSync(
    signalFilePath(projectRoot, issueNumber),
    JSON.stringify(payload),
  );
}

function readAndConsumeSignal(
  projectRoot: string,
  issueNumber: number,
): PipelineSignal | null {
  const path = signalFilePath(projectRoot, issueNumber);
  if (!existsSync(path)) return null;
  try {
    const content = readFileSync(path, "utf-8");
    unlinkSync(path);
    const raw = JSON.parse(content) as SignalFile;
    return raw.action ?? null;
  } catch {
    try {
      unlinkSync(path);
    } catch {
      // file already removed
    }
    return null;
  }
}

const WORKTREE_DIR = ".worktrees";

const PRIORITY_ORDER: Record<string, number> = {
  "priority:high": 0,
  "priority:low": 2,
};
const PRIORITY_NORMAL = 1;

export function getPriorityRank(labels: string[]): number {
  for (const label of labels) {
    if (label in PRIORITY_ORDER) return PRIORITY_ORDER[label];
  }
  return PRIORITY_NORMAL;
}

export function sortByPriority<T extends { number: number; labels: string[] }>(
  issues: T[],
): T[] {
  return [...issues].sort((a, b) => {
    const rankDiff = getPriorityRank(a.labels) - getPriorityRank(b.labels);
    if (rankDiff !== 0) return rankDiff;
    return a.number - b.number;
  });
}

function remoteBranchExists(projectRoot: string, branch: string): boolean {
  try {
    const output = execSync(`git ls-remote --heads origin "${branch}"`, {
      cwd: projectRoot,
      stdio: "pipe",
      encoding: "utf-8",
    });
    return output.trim().length > 0;
  } catch {
    return false;
  }
}

function createWorktreeFromRemote(
  projectRoot: string,
  branch: string,
  issueNumber: number,
): WorktreeInfo {
  const worktreeBase = resolve(projectRoot, WORKTREE_DIR);
  if (!existsSync(worktreeBase)) {
    mkdirSync(worktreeBase, { recursive: true });
  }

  const dirName = branch.replace(/\//g, "-");
  const worktreePath = resolve(worktreeBase, dirName);

  if (existsSync(worktreePath)) {
    throw new Error(
      `Worktree already exists at ${worktreePath}. Clean it up first.`,
    );
  }

  execSync(
    `git worktree add -B "${branch}" "${worktreePath}" "origin/${branch}"`,
    { cwd: projectRoot, stdio: "pipe" },
  );

  return { path: worktreePath, branch, issueNumber };
}

function getCompletedStepIndices(worktreePath: string): Set<number> {
  try {
    const log = execSync("git log --format=%s", {
      cwd: worktreePath,
      encoding: "utf-8",
      stdio: "pipe",
    });
    const completed = new Set<number>();
    for (const subject of log.split("\n")) {
      const match = subject.match(/^step (\d+)\/\d+:/);
      if (match) {
        completed.add(parseInt(match[1], 10) - 1);
      }
    }
    return completed;
  } catch {
    return new Set();
  }
}

function commitStep(
  worktreePath: string,
  stepNumber: number,
  totalSteps: number,
  role: string,
): void {
  const status = execSync("git status --porcelain", {
    cwd: worktreePath,
    encoding: "utf-8",
    stdio: "pipe",
  });
  if (status.trim().length === 0) {
    console.log(
      `  No changes from step ${stepNumber}/${totalSteps} (${role}) — skipping commit.`,
    );
    return;
  }
  execSync("git add -A", { cwd: worktreePath, stdio: "pipe" });
  execSync(`git commit -m "step ${stepNumber}/${totalSteps}: ${role}"`, {
    cwd: worktreePath,
    stdio: "pipe",
  });
  console.log(`  Committed step ${stepNumber}/${totalSteps}: ${role}.`);
}

function pushBranchOnFailure(
  worktreePath: string,
  branch: string,
  baseBranch: string,
): void {
  try {
    const ahead = execSync(`git log "origin/${baseBranch}..HEAD" --oneline`, {
      cwd: worktreePath,
      encoding: "utf-8",
      stdio: "pipe",
    });
    if (ahead.trim().length === 0) {
      return;
    }
    console.log(`Pushing branch ${branch} to preserve completed steps...`);
    execSync(`git push -u origin "${branch}"`, {
      cwd: worktreePath,
      stdio: "pipe",
    });
  } catch {
    // Best-effort
  }
}

function loadPipeline(projectRoot: string, pipelineName: string): Pipeline {
  const pipelinePath = resolve(projectRoot, "pipelines", `${pipelineName}.yml`);
  if (!existsSync(pipelinePath)) {
    throw new Error(`Pipeline definition not found: ${pipelinePath}`);
  }
  return yaml.load(readFileSync(pipelinePath, "utf-8")) as Pipeline;
}

function assembleContext(
  projectRoot: string,
  issue: GitHubIssue,
  comments: Array<{ body: string; user: string }>,
  pipeline: Pipeline,
  stepIndex: number,
): string {
  const parts: string[] = [];

  parts.push(`# Task: #${issue.number} — ${issue.title}\n`);
  parts.push(issue.body);
  parts.push("");

  if (comments.length > 0) {
    parts.push("## Issue Comments\n");
    for (const c of comments) {
      parts.push(`**${c.user}:** ${c.body}\n`);
    }
  }

  const archPath = resolve(projectRoot, "ARCHITECTURE.md");
  if (existsSync(archPath)) {
    parts.push("## Architecture\n");
    parts.push(readFileSync(archPath, "utf-8"));
    parts.push("");
  }

  const pitfallsPath = resolve(projectRoot, "PITFALLS.md");
  if (existsSync(pitfallsPath)) {
    parts.push("## Pitfalls\n");
    parts.push(readFileSync(pitfallsPath, "utf-8"));
    parts.push("");
  }

  const specsDir = resolve(projectRoot, "office", "specs");
  if (existsSync(specsDir)) {
    const specDirs = readdirSync(specsDir, { withFileTypes: true }).filter(
      (d) => d.isDirectory(),
    );
    for (const dir of specDirs) {
      const specFile = resolve(specsDir, dir.name, "spec.md");
      if (existsSync(specFile)) {
        parts.push(`## Spec: ${dir.name}\n`);
        parts.push(readFileSync(specFile, "utf-8"));
        parts.push("");
      }
    }
  }

  parts.push("## Pipeline Context\n");
  parts.push(`Pipeline: ${pipeline.name}`);
  parts.push(
    `Step ${stepIndex + 1} of ${pipeline.steps.length}: ${pipeline.steps[stepIndex].role}`,
  );
  parts.push(`Description: ${pipeline.steps[stepIndex].description}`);

  if (stepIndex > 0) {
    parts.push("\nPrevious steps:");
    for (let i = 0; i < stepIndex; i++) {
      parts.push(
        `  ${i + 1}. ${pipeline.steps[i].role} — ${pipeline.steps[i].description}`,
      );
    }
  }

  if (stepIndex < pipeline.steps.length - 1) {
    parts.push("\nNext steps:");
    for (let i = stepIndex + 1; i < pipeline.steps.length; i++) {
      parts.push(
        `  ${i + 1}. ${pipeline.steps[i].role} — ${pipeline.steps[i].description}`,
      );
    }
  }

  return parts.join("\n");
}

export function invokeAgent(
  config: OfficeConfig,
  projectRoot: string,
  worktreePath: string,
  step: PipelineStep,
  contextPrompt: string,
  captureOutput = false,
  readOnly = false,
): Promise<string> {
  const model = getModelForRole(config, step.role);
  const agentFile = resolve(
    projectRoot,
    ".claude",
    "agents",
    `${step.role}.md`,
  );

  if (!existsSync(agentFile)) {
    return Promise.reject(
      new Error(`Agent definition not found: ${agentFile}`),
    );
  }

  const args = [
    "--model",
    model,
    "--print",
    ...(readOnly
      ? ["--permission-mode", "plan"]
      : ["--dangerously-skip-permissions"]),
    "--append-system-prompt-file",
    agentFile,
  ];

  const idleTimeoutSecs = config.dispatch.agent_idle_timeout;
  const maxTimeoutSecs = config.dispatch.agent_max_timeout;
  const idleMs = idleTimeoutSecs * 1000;
  const maxMs = maxTimeoutSecs * 1000;
  // Intentionally not config-driven: exit grace is a fixed safety net, not a tuning knob.
  const exitGraceMs = 30_000;

  console.log(`Invoking ${step.role} agent (${model}) in ${worktreePath}...`);

  return new Promise<string>((promiseResolve, promiseReject) => {
    const child = spawn("claude", args, {
      cwd: worktreePath,
      stdio: ["pipe", "pipe", "pipe"],
      shell: true,
    });

    let stdout = "";
    let killed = false;
    let killReason = "";
    let killedAfterOutput = false;
    let stdoutEnded = false;
    let graceTimer: ReturnType<typeof setTimeout> | null = null;

    const killChild = (reason: string, afterOutput = false) => {
      if (killed) return;
      killed = true;
      killReason = reason;
      killedAfterOutput = afterOutput;
      child.kill();
    };

    let idleTimer = setTimeout(
      () =>
        killChild(`idle for ${idleTimeoutSecs}s with no output — likely hung`),
      idleMs,
    );

    const resetIdleTimer = () => {
      if (stdoutEnded) return;
      clearTimeout(idleTimer);
      idleTimer = setTimeout(
        () =>
          killChild(
            `idle for ${idleTimeoutSecs}s with no output — likely hung`,
          ),
        idleMs,
      );
    };

    const maxTimer = setTimeout(
      () => killChild(`exceeded max timeout of ${maxTimeoutSecs}s`),
      maxMs,
    );

    child.stdout.on("data", (chunk: Buffer) => {
      resetIdleTimer();
      if (captureOutput) {
        stdout += chunk.toString();
      } else {
        process.stdout.write(chunk);
      }
    });

    // Output complete: cancel idle timer, start short grace period.
    // If the process lingers past the grace period it is killed as success —
    // the work product is committed, the hang is an external CLI behaviour.
    child.stdout.on("end", () => {
      stdoutEnded = true;
      clearTimeout(idleTimer);
      clearTimeout(maxTimer);
      graceTimer = setTimeout(
        () =>
          killChild(
            `lingered ${exitGraceMs / 1000}s after output ended — treating as success`,
            true,
          ),
        exitGraceMs,
      );
    });

    child.stderr.on("data", (chunk: Buffer) => {
      resetIdleTimer();
      process.stderr.write(chunk);
    });

    child.stdin.write(contextPrompt);
    child.stdin.end();

    child.on("close", (code) => {
      clearTimeout(idleTimer);
      clearTimeout(maxTimer);
      if (graceTimer !== null) clearTimeout(graceTimer);

      if (killed && !killedAfterOutput) {
        promiseReject(new Error(`Agent ${step.role} killed: ${killReason}`));
      } else if (!killed && !stdoutEnded && code !== 0) {
        promiseReject(
          new Error(`Agent ${step.role} failed with exit code ${code}`),
        );
      } else {
        promiseResolve(captureOutput ? stdout : "");
      }
    });

    child.on("error", (err) => {
      clearTimeout(idleTimer);
      clearTimeout(maxTimer);
      if (graceTimer !== null) clearTimeout(graceTimer);
      promiseReject(
        new Error(`Agent ${step.role} failed to start: ${err.message}`),
      );
    });
  });
}

interface DebateRound {
  round: number;
  instanceA: string;
  instanceB: string;
}

function formatTranscript(rounds: DebateRound[]): string {
  const parts: string[] = ["# Adversarial Debate Transcript\n"];
  for (const r of rounds) {
    parts.push(`## Round ${r.round}\n`);
    parts.push(`### Architect A\n\n${r.instanceA}\n`);
    parts.push(`### Architect B\n\n${r.instanceB}\n`);
  }
  return parts.join("\n");
}

async function runAdversarialDebate(
  config: OfficeConfig,
  projectRoot: string,
  worktreePath: string,
  issue: GitHubIssue,
  comments: Array<{ body: string; user: string }>,
  pipeline: Pipeline,
): Promise<void> {
  const maxRounds = config.adversarial.max_rounds;
  const directives = config.adversarial.architect_directives;

  const stepA = pipeline.steps.find((s) => s.instance === "A");
  const stepB = pipeline.steps.find((s) => s.instance === "B");
  const pmStep = pipeline.steps.find((s) => s.role === "pm");
  const userStep = pipeline.steps.find((s) => s.role === "user");

  if (!stepA || !stepB || !pmStep) {
    throw new Error(
      "Adversarial pipeline must have instance A, instance B, and a PM step",
    );
  }

  const directiveA = directives[stepA.directive_index ?? 0] ?? "";
  const directiveB = directives[stepB.directive_index ?? 1] ?? "";

  const baseContext = assembleContext(
    projectRoot,
    issue,
    comments,
    pipeline,
    0,
  );

  const rounds: DebateRound[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    console.log(`\n=== Debate Round ${round}/${maxRounds} ===`);

    const priorTranscript = rounds.length > 0 ? formatTranscript(rounds) : "";

    const contextA = [
      baseContext,
      `\n## Your Directive\n\n${directiveA}`,
      `\nYou are Architect A in round ${round} of ${maxRounds}.`,
      priorTranscript ? `\n## Prior Debate Rounds\n\n${priorTranscript}` : "",
    ].join("\n");

    console.log(`\n--- Architect A (Round ${round}) ---`);
    const outputA = await invokeAgent(
      config,
      projectRoot,
      worktreePath,
      stepA,
      contextA,
      true,
    );

    const contextB = [
      baseContext,
      `\n## Your Directive\n\n${directiveB}`,
      `\nYou are Architect B in round ${round} of ${maxRounds}.`,
      priorTranscript ? `\n## Prior Debate Rounds\n\n${priorTranscript}` : "",
      `\n## Architect A's Argument (Round ${round})\n\n${outputA}`,
    ].join("\n");

    console.log(`\n--- Architect B (Round ${round}) ---`);
    const outputB = await invokeAgent(
      config,
      projectRoot,
      worktreePath,
      stepB,
      contextB,
      true,
    );

    rounds.push({ round, instanceA: outputA, instanceB: outputB });
  }

  const transcript = formatTranscript(rounds);

  await addComment(issue.number, transcript);
  console.log("\nDebate transcript posted to issue.");

  console.log("\n--- PM Judge ---");
  const pmContext = [
    baseContext,
    `\n## Full Debate Transcript\n\n${transcript}`,
    `\nYou are the PM judge. Synthesize the debate above into a clear recommendation with tradeoffs. Do not pick a winner — identify the best path forward given both perspectives.`,
  ].join("\n");

  const synthesis = await invokeAgent(
    config,
    projectRoot,
    worktreePath,
    pmStep,
    pmContext,
    true,
  );

  await addComment(issue.number, `## PM Synthesis\n\n${synthesis}`);
  console.log("PM synthesis posted to issue.");

  if (userStep) {
    await setLabels(
      issue.number,
      ["status:blocked-human"],
      ["status:in-progress"],
    );
    await addComment(
      issue.number,
      `The adversarial debate is complete and the PM has provided a synthesis above.\n\nPlease review and respond with your decision. The architect will update ARCHITECTURE.md and the relevant OpenSpec spec to reflect the approved decision.`,
    );
    await notify(config, {
      issueNumber: issue.number,
      title: issue.title,
      message: "Adversarial debate complete — your decision is needed",
      url: issue.html_url,
    });
    console.log("Awaiting user decision.");
  }
}

export async function dispatchNext(
  config: OfficeConfig,
  projectRoot: string,
  issueNumber?: number,
  priority?: "high" | "low",
  budget?: UsageBudget,
): Promise<DispatchResult | false> {
  let issue: GitHubIssue;

  if (issueNumber) {
    issue = await getIssue(issueNumber);
    const hasReady = issue.labels.includes("status:ready");
    if (!hasReady) {
      console.log(`Issue #${issueNumber} is not labeled status:ready.`);
      return false;
    }
    if (priority) {
      const priorityLabel = `priority:${priority}`;
      if (!issue.labels.includes(priorityLabel)) {
        const opposite = priority === "high" ? "priority:low" : "priority:high";
        const remove = issue.labels.includes(opposite) ? [opposite] : [];
        await setLabels(issue.number, [priorityLabel], remove);
        issue.labels.push(priorityLabel);
        issue.labels = issue.labels.filter((l) => !remove.includes(l));
      }
    }
  } else {
    const readyIssues = await listIssuesByLabel("status:ready");
    if (readyIssues.length === 0) {
      console.log("No tasks in status:ready.");
      return false;
    }
    const sorted = sortByPriority(readyIssues);
    issue = sorted[0];
  }

  const pipelineName = getPipelineLabel(issue);

  if (!pipelineName) {
    console.log(`Issue #${issue.number} has no pipeline label. Skipping.`);
    return false;
  }

  const result = await dispatchIssue(
    config,
    projectRoot,
    issue,
    pipelineName,
    budget,
  );
  return result;
}

export async function dispatchIssue(
  config: OfficeConfig,
  projectRoot: string,
  issue: GitHubIssue,
  pipelineName: string,
  budget?: UsageBudget,
): Promise<DispatchResult> {
  const pipeline = loadPipeline(projectRoot, pipelineName);
  const baseBranch = getBaseBranch(config);
  const branch = branchName(issue.number, issue.title, pipelineName);

  readAndConsumeSignal(projectRoot, issue.number);

  console.log(`\nDispatching #${issue.number}: ${issue.title}`);
  console.log(`Pipeline: ${pipelineName} (${pipeline.steps.length} steps)`);
  console.log(`Branch: ${branch}\n`);

  await setLabels(issue.number, ["status:in-progress"], ["status:ready"]);

  execSync("git fetch origin", { cwd: projectRoot, stdio: "pipe" });
  const resuming = remoteBranchExists(projectRoot, branch);

  const worktree = resuming
    ? createWorktreeFromRemote(projectRoot, branch, issue.number)
    : createWorktree(projectRoot, baseBranch, branch, issue.number);

  if (resuming) {
    console.log(`Resuming pipeline from existing branch ${branch}.`);
  }

  try {
    const comments = await getIssueComments(issue.number);

    if (pipeline.adversarial) {
      await runAdversarialDebate(
        config,
        projectRoot,
        worktree.path,
        issue,
        comments,
        pipeline,
      );
      return "blocked";
    }

    const completedSteps = resuming
      ? getCompletedStepIndices(worktree.path)
      : new Set<number>();

    if (completedSteps.size > 0) {
      console.log(`Skipping ${completedSteps.size} already-completed step(s).`);
    }

    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];

      if (step.role === "user") {
        await setLabels(
          issue.number,
          ["status:blocked-human"],
          ["status:in-progress"],
        );
        await addComment(
          issue.number,
          `Pipeline step ${i + 1} requires user input: ${step.description}\n\nPlease respond on this issue to continue.`,
        );
        await notify(config, {
          issueNumber: issue.number,
          title: issue.title,
          message: `Pipeline step requires your input: ${step.description}`,
          url: issue.html_url,
        });
        console.log(
          `Blocked on user input at step ${i + 1}. Respond on the issue to continue.`,
        );
        return "blocked";
      }

      if (completedSteps.has(i)) {
        console.log(
          `\n--- Step ${i + 1}/${pipeline.steps.length}: ${step.role} (already completed, skipping) ---`,
        );
        continue;
      }

      console.log(
        `\n--- Step ${i + 1}/${pipeline.steps.length}: ${step.role} ---`,
      );

      const context = assembleContext(
        projectRoot,
        issue,
        comments,
        pipeline,
        i,
      );

      const stepStart = Date.now();
      await invokeAgent(config, projectRoot, worktree.path, step, context);
      const stepElapsed = Date.now() - stepStart;
      budget?.recordAgentTime(stepElapsed);

      commitStep(worktree.path, i + 1, pipeline.steps.length, step.role);

      // Check for pause/cancel signal or usage wind-down before the next step.
      if (i < pipeline.steps.length - 1) {
        const signal = readAndConsumeSignal(projectRoot, issue.number);
        const windDown = budget?.shouldWindDown() ?? false;

        if (signal === "cancel" || signal === "pause" || windDown) {
          const isPause =
            signal !== "cancel" && (signal === "pause" || windDown);
          const pausePoint = `step ${i + 1} of ${pipeline.steps.length} (${step.role})`;
          const commentReason = windDown
            ? `Usage budget wind-down triggered: ${budget!.reason()}. Paused after ${pausePoint}.`
            : signal === "pause"
              ? `Paused by user request after ${pausePoint}.`
              : `Cancelled by user request after ${pausePoint}.`;

          pushBranchOnFailure(worktree.path, branch, baseBranch);

          const newLabel = isPause
            ? "status:paused"
            : "status:blocked-unclassified";
          await setLabels(issue.number, [newLabel], ["status:in-progress"]);
          await addComment(issue.number, commentReason);
          await notify(config, {
            issueNumber: issue.number,
            title: issue.title,
            message: commentReason,
            url: issue.html_url,
          });

          console.log(
            `\n${isPause ? "Paused" : "Cancelled"} pipeline for #${issue.number} after ${pausePoint}.`,
          );
          return isPause ? "paused" : "cancelled";
        }
      }
    }

    const lateSignal = readAndConsumeSignal(projectRoot, issue.number);
    if (lateSignal) {
      console.warn(
        `${lateSignal === "cancel" ? "Cancel" : "Pause"} signal arrived too late — pipeline already completed normally.`,
      );
    }

    console.log(`\nPushing branch ${branch} to origin...`);
    execSync(`git push -u origin "${branch}"`, {
      cwd: worktree.path,
      stdio: "pipe",
    });

    const prTitle = `${pipelineName.startsWith("bug") ? "fix" : "feat"}(#${issue.number}): ${issue.title}`;
    const stepSummary = pipeline.steps
      .map((s, idx) => `${idx + 1}. **${s.role}** — ${s.description}`)
      .join("\n");
    const prBody = [
      `## Summary`,
      ``,
      `Closes #${issue.number}`,
      ``,
      `## Pipeline: ${pipeline.name}`,
      ``,
      stepSummary,
    ].join("\n");

    const pr = await createPR(branch, baseBranch, prTitle, prBody);
    console.log(`PR created: ${pr.html_url}`);

    await setLabels(issue.number, ["status:review"], ["status:in-progress"]);

    console.log(`\nPipeline complete for #${issue.number}. Status: review.`);
    return "completed";
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);

    pushBranchOnFailure(worktree.path, branch, baseBranch);

    await addComment(
      issue.number,
      `Pipeline failed at a step:\n\n\`\`\`\n${message}\n\`\`\``,
    );
    await setLabels(
      issue.number,
      ["status:blocked-unclassified"],
      ["status:in-progress"],
    );
    await notify(config, {
      issueNumber: issue.number,
      title: issue.title,
      message: `Pipeline failed: ${message}`,
      url: issue.html_url,
    });

    console.error(`\nPipeline failed for #${issue.number}: ${message}`);
    return "failed";
  } finally {
    try {
      cleanupWorktree(projectRoot, worktree.path, branch);
      console.log(`Cleaned up worktree for ${branch}.`);
    } catch {
      // Best-effort cleanup
    }
  }
}
