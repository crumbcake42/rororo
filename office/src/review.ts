import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import type { OfficeConfig } from "./config.js";
import { getPR, addComment } from "./github.js";
import { invokeAgent, parseReviewFindings } from "./dispatch.js";
import type { PipelineStep, ReviewFinding } from "./dispatch.js";

export { parseReviewFindings };
export type { ReviewFinding };

const MAX_CONTEXT_BYTES = 100_000;

function gitSpawn(
  projectRoot: string,
  args: string[],
): { stdout: string; stderr: string } {
  const result = spawnSync("git", args, {
    cwd: projectRoot,
    encoding: "utf-8",
    stdio: "pipe",
    timeout: 30_000,
  });

  if (result.status !== 0) {
    const msg = (result.stderr ?? "").trim() || `git ${args[0]} failed`;
    throw new Error(msg);
  }

  return { stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
}

export function fetchAndDiff(
  projectRoot: string,
  baseBranch: string,
  headBranch: string,
): { diff: string; changedFiles: string[] } {
  gitSpawn(projectRoot, ["fetch", "origin"]);

  const { stdout: diff } = gitSpawn(projectRoot, [
    "diff",
    `origin/${baseBranch}...origin/${headBranch}`,
  ]);

  const { stdout: nameOnly } = gitSpawn(projectRoot, [
    "diff",
    "--name-only",
    `origin/${baseBranch}...origin/${headBranch}`,
  ]);

  const changedFiles = nameOnly.trim().split("\n").filter(Boolean);
  return { diff, changedFiles };
}

export function readFileAtRef(
  projectRoot: string,
  ref: string,
  filePath: string,
): string {
  try {
    const { stdout } = gitSpawn(projectRoot, ["show", `${ref}:${filePath}`]);
    return stdout;
  } catch {
    return "";
  }
}

function truncate(text: string, maxBytes: number): string {
  if (text.length <= maxBytes) return text;
  return text.slice(0, maxBytes) + "\n\n[truncated — context limit reached]";
}

export function assembleReviewContext(
  projectRoot: string,
  pr: {
    number: number;
    title: string;
    head_branch: string;
    base_branch: string;
  },
  diff: string,
  changedFiles: string[],
): string {
  const parts: string[] = [];

  parts.push(`# PR Review: #${pr.number} — ${pr.title}\n`);
  parts.push(`**Base branch:** \`${pr.base_branch}\``);
  parts.push(`**Head branch:** \`${pr.head_branch}\``);
  parts.push("");

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

  parts.push("## PR Diff\n");
  parts.push("```diff");
  parts.push(diff);
  parts.push("```");
  parts.push("");

  if (changedFiles.length > 0) {
    parts.push("## Changed Files (full contents at head)\n");
    for (const file of changedFiles) {
      const content = readFileAtRef(
        projectRoot,
        `origin/${pr.head_branch}`,
        file,
      );
      if (content) {
        const ext = file.split(".").pop() ?? "";
        parts.push(`### \`${file}\`\n`);
        parts.push(`\`\`\`${ext}`);
        parts.push(content);
        parts.push("```");
        parts.push("");
      }
    }
  }

  parts.push("## Review Instructions\n");
  parts.push(
    "Focus your review on semantic correctness. In particular, check for:",
  );
  parts.push(
    "- **Field/type naming consistency**: Are field names, type names, and variable names consistent across all modules touched by this PR?",
  );
  parts.push(
    "- **Import/export mismatches**: Does every import reference an actual export at the correct path?",
  );
  parts.push(
    "- **Test API alignment**: Do tests assert against the same API that the implementation actually provides, rather than a stale or anticipated API?",
  );
  parts.push(
    "- **Dead code from merge conflicts**: Are there leftover stubs, commented-out alternatives, or duplicate logic from conflict resolution?",
  );
  parts.push(
    "- **Architecture/spec contradictions**: Does any part of the implementation contradict ARCHITECTURE.md or the specs above?",
  );

  return truncate(parts.join("\n"), MAX_CONTEXT_BYTES);
}

export async function reviewPR(
  config: OfficeConfig,
  projectRoot: string,
  prNumber: number,
  options: { comment: boolean },
): Promise<void> {
  const pr = await getPR(prNumber);

  if (pr.state !== "open") {
    throw new Error(
      `PR #${prNumber} is not open (state: ${pr.state}). Only open PRs can be reviewed.`,
    );
  }

  console.log(`Reviewing PR #${pr.number}: ${pr.title}`);
  console.log(`  ${pr.base_branch} ← ${pr.head_branch}`);

  const { diff, changedFiles } = fetchAndDiff(
    projectRoot,
    pr.base_branch,
    pr.head_branch,
  );

  if (!diff.trim()) {
    console.log("No diff found between branches. Nothing to review.");
    return;
  }

  console.log(
    `  Changed files (${changedFiles.length}): ${changedFiles.join(", ")}`,
  );

  const context = assembleReviewContext(projectRoot, pr, diff, changedFiles);

  const step: PipelineStep = {
    role: "reviewer",
    description: "Semantic PR review",
  };

  console.log("\nInvoking reviewer agent...\n");
  const findings = await invokeAgent(
    config,
    projectRoot,
    projectRoot,
    step,
    context,
    true,
    true,
  );

  console.log("\n## Review Findings\n");
  console.log(findings);

  if (options.comment && findings.trim()) {
    await addComment(
      prNumber,
      `## Agent Review — PR #${prNumber}\n\n${findings}`,
    );
    console.log(`\nFindings posted as comment on PR #${prNumber}.`);
  }
}
