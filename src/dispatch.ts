import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";
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

  const decisionsPath = resolve(projectRoot, "DECISIONS.md");
  if (existsSync(decisionsPath)) {
    parts.push("## Decisions\n");
    parts.push(readFileSync(decisionsPath, "utf-8"));
    parts.push("");
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
  contextPrompt: string
): void {
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
    "claude",
    "--agent", step.role,
    "--model", model,
    "--print",
    "--dangerously-skip-permissions",
  ];

  console.log(
    `Invoking ${step.role} agent (${model}) in ${worktreePath}...`
  );

  try {
    execSync(
      `${args.join(" ")} "${contextPrompt.replace(/"/g, '\\"')}"`,
      {
        cwd: worktreePath,
        stdio: "inherit",
        timeout: 600_000,
      }
    );
  } catch (error) {
    throw new Error(
      `Agent ${step.role} failed: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

export async function dispatchNext(
  config: OfficeConfig,
  projectRoot: string
): Promise<boolean> {
  const readyIssues = await listIssuesByLabel("status:ready");

  if (readyIssues.length === 0) {
    console.log("No tasks in status:ready.");
    return false;
  }

  const issue = readyIssues[0];
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
  }
}
