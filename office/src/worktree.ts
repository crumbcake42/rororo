import { execSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";

const WORKTREE_DIR = ".worktrees";

export interface WorktreeInfo {
  path: string;
  branch: string;
  issueNumber: number;
}

function slugify(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

export function branchName(
  issueNumber: number,
  title: string,
  pipeline: string,
): string {
  const slug = slugify(title);
  const prefix = pipeline.startsWith("bug") ? "fix" : "feat";
  return `${prefix}/${issueNumber}-${slug}`;
}

export function createWorktree(
  projectRoot: string,
  baseBranch: string,
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
      `Worktree already exists at ${worktreePath}. Clean it up first or use a different branch name.`,
    );
  }

  execSync(`git fetch origin ${baseBranch}`, {
    cwd: projectRoot,
    stdio: "pipe",
  });

  execSync(
    `git worktree add "${worktreePath}" -b "${branch}" "origin/${baseBranch}"`,
    { cwd: projectRoot, stdio: "pipe" },
  );

  return { path: worktreePath, branch, issueNumber };
}

export function cleanupWorktree(
  projectRoot: string,
  worktreePath: string,
  branch: string,
): void {
  if (existsSync(worktreePath)) {
    execSync(`git worktree remove "${worktreePath}" --force`, {
      cwd: projectRoot,
      stdio: "pipe",
    });
  }

  try {
    execSync(`git branch -D "${branch}"`, {
      cwd: projectRoot,
      stdio: "pipe",
    });
  } catch {
    // Branch might already be deleted
  }
}

export function listWorktrees(projectRoot: string): WorktreeInfo[] {
  const worktreeBase = resolve(projectRoot, WORKTREE_DIR);
  if (!existsSync(worktreeBase)) {
    return [];
  }

  try {
    const output = execSync("git worktree list --porcelain", {
      cwd: projectRoot,
      encoding: "utf-8",
    });

    const worktrees: WorktreeInfo[] = [];
    const entries = output.split("\n\n").filter(Boolean);

    for (const entry of entries) {
      const lines = entry.split("\n");
      const pathLine = lines.find((l) => l.startsWith("worktree "));
      const branchLine = lines.find((l) => l.startsWith("branch "));

      if (pathLine && branchLine) {
        const path = pathLine.replace("worktree ", "");
        const branch = branchLine.replace("branch refs/heads/", "");

        if (path.includes(WORKTREE_DIR)) {
          const issueMatch = branch.match(/\/(\d+)-/);
          worktrees.push({
            path,
            branch,
            issueNumber: issueMatch ? parseInt(issueMatch[1], 10) : 0,
          });
        }
      }
    }

    return worktrees;
  } catch {
    return [];
  }
}
