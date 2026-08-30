import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { OfficeConfig } from "./config.js";
import { getModelForRole } from "./config.js";
import { createIssue } from "./github.js";

export async function launchCreateSession(
  config: OfficeConfig,
  projectRoot: string,
  topic?: string,
): Promise<void> {
  const topicLine = topic
    ? `The user wants to work on: "${topic}".`
    : "The user hasn't specified a topic yet — ask them what they want to work on.";

  const prompt = [
    "You are the PM agent running an interactive issue creation session.",
    "",
    topicLine,
    "",
    "Your job is to scope this into a well-formed GitHub Issue. Walk through these steps:",
    "1. Understand the problem or feature the user wants to address.",
    "2. Determine which pipeline type fits (backend-feature, frontend-feature, fullstack-feature, bug-fix, refactor, architecture-decision, chore).",
    "3. Define clear acceptance criteria.",
    "4. Identify the file scope (which files/directories the task may modify).",
    "5. Check for dependencies on other issues.",
    "6. Draft the issue using the template format for the selected pipeline type.",
    "",
    "Issue templates follow this structure:",
    "- Features: Description, Acceptance Criteria, Scope, Dependencies, Architecture Decisions Required, Additional Context",
    "- Bug fixes: Bug Description, Steps to Reproduce, Expected Behavior, Acceptance Criteria, Scope, Additional Context",
    "- Chores: Description, Acceptance Criteria, Scope, Additional Context",
    "",
    "When the issue is scoped, present the draft to the user for review.",
    "When the user approves, output the final issue in this exact format:",
    "",
    "===ISSUE_START===",
    "PIPELINE: <pipeline-name>",
    "TITLE: <issue title>",
    "BODY:",
    "<full issue body in markdown>",
    "===ISSUE_END===",
    "",
    "Do not create the issue yourself — just output it in this format for the CLI to process.",
  ].join("\n");

  const filename = `office-create-${randomBytes(8).toString("hex")}.md`;
  const promptFile = join(tmpdir(), filename);
  writeFileSync(promptFile, prompt, "utf-8");

  const model = getModelForRole(config, "pm");

  let output: string;
  try {
    const result = execSync(
      `claude --agent pm --model ${model} --output-format json --prompt-file "${promptFile}"`,
      {
        cwd: projectRoot,
        stdio: ["inherit", "pipe", "inherit"],
        timeout: 600_000,
      },
    );
    output = result.toString("utf-8");
  } catch {
    console.error("Issue creation session ended without creating an issue.");
    return;
  } finally {
    try {
      unlinkSync(promptFile);
    } catch {
      // Best-effort cleanup
    }
  }

  const issueMatch = output.match(
    /===ISSUE_START===\s*\nPIPELINE:\s*(.+)\nTITLE:\s*(.+)\nBODY:\n([\s\S]*?)\n===ISSUE_END===/,
  );

  if (!issueMatch) {
    console.log("No issue was finalized during the session.");
    return;
  }

  const [, pipeline, title, body] = issueMatch;
  const labels = [`status:backlog`, `pipeline:${pipeline.trim()}`];

  try {
    const issue = await createIssue(title.trim(), body.trim(), labels);
    console.log(`\nIssue created: #${issue.number} — ${issue.title}`);
    console.log(`Labels: ${labels.join(", ")}`);
    console.log(`URL: ${issue.html_url}`);
  } catch (error) {
    console.error(
      `Failed to create issue: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
