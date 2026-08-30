import { readFileSync, existsSync, readdirSync } from "node:fs";
import { execSync, spawnSync } from "node:child_process";
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

function loadPipeline(
  projectRoot: string,
  pipelineName: string
): Pipeline {
  const pipelinePath = resolve(
    projectRoot,
    "pipelines",
    `${pipelineName}.yml`
  );
  if (!existsSync(pipelinePath)) {
    throw new Error(`Pipeline definition not found: ${pipelinePath}`);
  }
  return yaml.load(
    readFileSync(pipelinePath, "utf-8")
  ) as Pipeline;
}

function assembleContext(
  projectRoot: string,
  issue: GitHubIssue,
  comments: Array<{ body: string; user: string }>,
  pipeline: Pipeline,
  stepIndex: number
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
    const specDirs = readdirSync(specsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());
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
    `Step ${stepIndex + 1} of ${pipeline.steps.length}: ${pipeline.steps[stepIndex].role}`
  );
  parts.push(`Description: ${pipeline.steps[stepIndex].description}`);

  if (stepIndex > 0) {
    parts.push("\nPrevious steps:");
    for (let i = 0; i < stepIndex; i++) {
      parts.push(`  ${i + 1}. ${pipeline.steps[i].role} — ${pipeline.steps[i].description}`);
    }
  }

  if (stepIndex < pipeline.steps.length - 1) {
    parts.push("\nNext steps:");
    for (let i = stepIndex + 1; i < pipeline.steps.length; i++) {
      parts.push(`  ${i + 1}. ${pipeline.steps[i].role} — ${pipeline.steps[i].description}`);
    }
  }

  return parts.join("\n");
}

function invokeAgent(
  config: OfficeConfig,
  projectRoot: string,
  worktreePath: string,
  step: PipelineStep,
  contextPrompt: string,
  captureOutput = false
): string {
  const model = getModelForRole(config, step.role);
  const agentFile = resolve(
    projectRoot,
    ".claude",
    "agents",
    `${step.role}.md`
  );

  if (!existsSync(agentFile)) {
    throw new Error(`Agent definition not found: ${agentFile}`);
  }

  const args = [
    "--model", model,
    "--print",
    "--dangerously-skip-permissions",
    "--append-system-prompt-file", agentFile,
  ];

  console.log(
    `Invoking ${step.role} agent (${model}) in ${worktreePath}...`
  );

  const result = spawnSync("claude", args, {
    cwd: worktreePath,
    input: contextPrompt,
    stdio: captureOutput ? ["pipe", "pipe", "inherit"] : ["pipe", "inherit", "inherit"],
    timeout: 600_000,
    encoding: captureOutput ? "utf-8" : undefined,
  });

  if (result.status !== 0) {
    throw new Error(
      `Agent ${step.role} failed with exit code ${result.status}`
    );
  }

  return captureOutput && result.stdout ? String(result.stdout) : "";
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
  pipeline: Pipeline
): Promise<void> {
  const maxRounds = config.adversarial.max_rounds;
  const directives = config.adversarial.architect_directives;

  const stepA = pipeline.steps.find((s) => s.instance === "A");
  const stepB = pipeline.steps.find((s) => s.instance === "B");
  const pmStep = pipeline.steps.find((s) => s.role === "pm");
  const userStep = pipeline.steps.find((s) => s.role === "user");

  if (!stepA || !stepB || !pmStep) {
    throw new Error(
      "Adversarial pipeline must have instance A, instance B, and a PM step"
    );
  }

  const directiveA = directives[stepA.directive_index ?? 0] ?? "";
  const directiveB = directives[stepB.directive_index ?? 1] ?? "";

  const baseContext = assembleContext(
    projectRoot,
    issue,
    comments,
    pipeline,
    0
  );

  const rounds: DebateRound[] = [];

  for (let round = 1; round <= maxRounds; round++) {
    console.log(`\n=== Debate Round ${round}/${maxRounds} ===`);

    const priorTranscript =
      rounds.length > 0 ? formatTranscript(rounds) : "";

    const contextA = [
      baseContext,
      `\n## Your Directive\n\n${directiveA}`,
      `\nYou are Architect A in round ${round} of ${maxRounds}.`,
      priorTranscript
        ? `\n## Prior Debate Rounds\n\n${priorTranscript}`
        : "",
    ].join("\n");

    console.log(`\n--- Architect A (Round ${round}) ---`);
    const outputA = invokeAgent(
      config,
      projectRoot,
      worktreePath,
      stepA,
      contextA,
      true
    );

    const contextB = [
      baseContext,
      `\n## Your Directive\n\n${directiveB}`,
      `\nYou are Architect B in round ${round} of ${maxRounds}.`,
      priorTranscript
        ? `\n## Prior Debate Rounds\n\n${priorTranscript}`
        : "",
      `\n## Architect A's Argument (Round ${round})\n\n${outputA}`,
    ].join("\n");

    console.log(`\n--- Architect B (Round ${round}) ---`);
    const outputB = invokeAgent(
      config,
      projectRoot,
      worktreePath,
      stepB,
      contextB,
      true
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

  const synthesis = invokeAgent(
    config,
    projectRoot,
    worktreePath,
    pmStep,
    pmContext,
    true
  );

  await addComment(
    issue.number,
    `## PM Synthesis\n\n${synthesis}`
  );
  console.log("PM synthesis posted to issue.");

  if (userStep) {
    await setLabels(
      issue.number,
      ["status:blocked-human"],
      ["status:in-progress"]
    );
    await addComment(
      issue.number,
      `The adversarial debate is complete and the PM has provided a synthesis above.\n\nPlease review and respond with your decision. The architect will update ARCHITECTURE.md and the relevant OpenSpec spec to reflect the approved decision.`
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
  issueNumber?: number
): Promise<boolean> {
  let issue: GitHubIssue;

  if (issueNumber) {
    issue = await getIssue(issueNumber);
    const hasReady = issue.labels.includes("status:ready");
    if (!hasReady) {
      console.log(`Issue #${issueNumber} is not labeled status:ready.`);
      return false;
    }
  } else {
    const readyIssues = await listIssuesByLabel("status:ready");
    if (readyIssues.length === 0) {
      console.log("No tasks in status:ready.");
      return false;
    }
    issue = readyIssues[0];
  }

  const pipelineName = getPipelineLabel(issue);

  if (!pipelineName) {
    console.log(
      `Issue #${issue.number} has no pipeline label. Skipping.`
    );
    return false;
  }

  await dispatchIssue(config, projectRoot, issue, pipelineName);
  return true;
}

export async function dispatchIssue(
  config: OfficeConfig,
  projectRoot: string,
  issue: GitHubIssue,
  pipelineName: string
): Promise<void> {
  const pipeline = loadPipeline(projectRoot, pipelineName);
  const baseBranch = getBaseBranch(config);
  const branch = branchName(issue.number, issue.title, pipelineName);

  console.log(
    `\nDispatching #${issue.number}: ${issue.title}`
  );
  console.log(`Pipeline: ${pipelineName} (${pipeline.steps.length} steps)`);
  console.log(`Branch: ${branch}\n`);

  await setLabels(
    issue.number,
    ["status:in-progress"],
    ["status:ready"]
  );

  const worktree = createWorktree(
    projectRoot,
    baseBranch,
    branch,
    issue.number
  );

  try {
    const comments = await getIssueComments(issue.number);

    if (pipeline.adversarial) {
      await runAdversarialDebate(
        config,
        projectRoot,
        worktree.path,
        issue,
        comments,
        pipeline
      );
      return;
    }

    for (let i = 0; i < pipeline.steps.length; i++) {
      const step = pipeline.steps[i];

      if (step.role === "user") {
        await setLabels(
          issue.number,
          ["status:blocked-human"],
          ["status:in-progress"]
        );
        await addComment(
          issue.number,
          `Pipeline step ${i + 1} requires user input: ${step.description}\n\nPlease respond on this issue to continue.`
        );
        await notify(config, {
          issueNumber: issue.number,
          title: issue.title,
          message: `Pipeline step requires your input: ${step.description}`,
          url: issue.html_url,
        });
        console.log(
          `Blocked on user input at step ${i + 1}. Respond on the issue to continue.`
        );
        return;
      }

      console.log(
        `\n--- Step ${i + 1}/${pipeline.steps.length}: ${step.role} ---`
      );

      const context = assembleContext(
        projectRoot,
        issue,
        comments,
        pipeline,
        i
      );

      invokeAgent(
        config,
        projectRoot,
        worktree.path,
        step,
        context
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

    await setLabels(
      issue.number,
      ["status:review"],
      ["status:in-progress"]
    );

    console.log(
      `\nPipeline complete for #${issue.number}. Status: review.`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : String(error);

    await addComment(
      issue.number,
      `Pipeline failed at a step:\n\n\`\`\`\n${message}\n\`\`\``
    );
    await setLabels(
      issue.number,
      ["status:blocked-unclassified"],
      ["status:in-progress"]
    );
    await notify(config, {
      issueNumber: issue.number,
      title: issue.title,
      message: `Pipeline failed: ${message}`,
      url: issue.html_url,
    });

    console.error(`\nPipeline failed for #${issue.number}: ${message}`);
  } finally {
    try {
      cleanupWorktree(projectRoot, worktree.path, branch);
      console.log(`Cleaned up worktree for ${branch}.`);
    } catch {
      // Best-effort cleanup
    }
  }
}
