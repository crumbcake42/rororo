import { execSync } from "node:child_process";
import { writeFileSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomBytes } from "node:crypto";
import type { OfficeConfig } from "./config.js";
import { getStatus, formatStatus } from "./status.js";
import { listRecentPRs } from "./github.js";

export async function generateStandup(
  config: OfficeConfig,
  projectRoot: string
): Promise<string> {
  const report = await getStatus();
  const lines: string[] = [];

  lines.push("# Standup Report\n");
  lines.push(`_Generated: ${new Date().toISOString()}_\n`);

  if (config.standup.include_completed && report.done.length > 0) {
    lines.push("## Completed");
    for (const issue of report.done.slice(0, 5)) {
      lines.push(`  - #${issue.number} — ${issue.title}`);
    }
    lines.push("");
  }

  if (config.standup.include_in_progress && report.inProgress.length > 0) {
    lines.push("## In Progress");
    for (const issue of report.inProgress) {
      lines.push(`  - #${issue.number} — ${issue.title}`);
    }
    lines.push("");
  }

  const blocked = [
    ...report.blockedHuman,
    ...report.blockedDependency,
    ...report.blockedUnclassified,
  ];
  if (config.standup.include_blocked && blocked.length > 0) {
    lines.push("## Blocked");
    for (const issue of report.blockedHuman) {
      lines.push(
        `  - #${issue.number} — ${issue.title} (waiting on human response)`
      );
    }
    for (const issue of report.blockedDependency) {
      lines.push(
        `  - #${issue.number} — ${issue.title} (waiting on dependency)`
      );
    }
    for (const issue of report.blockedUnclassified) {
      lines.push(
        `  - #${issue.number} — ${issue.title} (needs triage)`
      );
    }
    lines.push("");
  }

  if (config.standup.include_recent_commits) {
    try {
      const commits = execSync(
        'git log --oneline --since="24 hours ago" -20',
        { cwd: projectRoot, encoding: "utf-8" }
      ).trim();
      if (commits) {
        lines.push("## Recent Commits");
        for (const line of commits.split("\n")) {
          lines.push(`  - ${line}`);
        }
        lines.push("");
      }
    } catch {
      // No git history or git not available
    }

    try {
      const prs = await listRecentPRs("all", 5);
      if (prs.length > 0) {
        lines.push("## Recent PRs");
        for (const pr of prs) {
          const status = pr.merged
            ? "merged"
            : pr.state === "open"
              ? "open"
              : "closed";
          lines.push(`  - #${pr.number} — ${pr.title} (${status})`);
        }
        lines.push("");
      }
    } catch {
      // GitHub API not available
    }
  }

  if (report.ready.length > 0) {
    lines.push("## Ready for Dispatch");
    for (const issue of report.ready) {
      lines.push(`  - #${issue.number} — ${issue.title}`);
    }
    lines.push("");
  }

  const statusSection = formatStatus(report, projectRoot);
  lines.push("---\n");
  lines.push(statusSection);

  return lines.join("\n");
}

export function launchInteractiveStandup(
  config: OfficeConfig,
  projectRoot: string,
  standupData: string
): void {
  const prompt = `You are the PM agent running an interactive standup. Here is the current project state:\n\n${standupData}\n\nThe user will ask questions about the project. Answer from this data. If they ask for details on a specific task, agent, or decision, spawn the relevant role agent as a subagent to provide detailed answers.`;

  const filename = `office-standup-${randomBytes(8).toString("hex")}.md`;
  const promptFile = join(tmpdir(), filename);
  writeFileSync(promptFile, prompt, "utf-8");

  try {
    execSync(
      `claude --agent pm --model ${config.models.opus} --prompt-file "${promptFile}"`,
      { cwd: projectRoot, stdio: "inherit" }
    );
  } catch {
    console.error("Interactive standup session ended.");
  } finally {
    try {
      unlinkSync(promptFile);
    } catch {
      // Best-effort cleanup
    }
  }
}
