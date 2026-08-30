import { execSync } from "node:child_process";
import { Octokit } from "@octokit/rest";

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  assignees: string[];
  state: string;
  created_at: string;
  updated_at: string;
  html_url: string;
}

export interface GitHubComment {
  id: number;
  body: string;
  user: string;
  created_at: string;
}

export interface GitHubPR {
  number: number;
  title: string;
  head_branch: string;
  base_branch: string;
  state: string;
  merged: boolean;
  html_url: string;
}

function getOctokit(): Octokit {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    throw new Error(
      "GITHUB_TOKEN not set. Add it to .env or set it as an environment variable.",
    );
  }
  return new Octokit({ auth: token });
}

function getRepoInfo(): { owner: string; repo: string } {
  const remote = process.env.GITHUB_REPOSITORY ?? detectRemoteFromGit();
  if (!remote) {
    throw new Error(
      "Cannot determine GitHub repository. Set GITHUB_REPOSITORY or run from a git repo with a GitHub remote.",
    );
  }
  const [owner, repo] = remote.split("/");
  return { owner, repo };
}

function detectRemoteFromGit(): string | null {
  try {
    const url = execSync("git remote get-url origin", {
      encoding: "utf-8",
    }).trim();
    const match = url.match(/github\.com[:/](.+?)(?:\.git)?$/);
    return match ? match[1] : null;
  } catch {
    return null;
  }
}

function extractLabels(labels: Array<{ name?: string } | string>): string[] {
  return labels.map((l) => (typeof l === "string" ? l : (l.name ?? "")));
}

export async function listIssuesByLabel(label: string): Promise<GitHubIssue[]> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const { data } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    labels: label,
    state: "open",
    per_page: 100,
  });

  return data
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      labels: extractLabels(issue.labels),
      assignees: issue.assignees?.map((a) => a.login) ?? [],
      state: issue.state,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      html_url: issue.html_url,
    }));
}

export async function listAllIssues(): Promise<GitHubIssue[]> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const { data } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    state: "all",
    per_page: 100,
  });

  return data
    .filter((issue) => !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title: issue.title,
      body: issue.body ?? "",
      labels: extractLabels(issue.labels),
      assignees: issue.assignees?.map((a) => a.login) ?? [],
      state: issue.state,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      html_url: issue.html_url,
    }));
}

export async function getIssue(issueNumber: number): Promise<GitHubIssue> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const { data } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  return {
    number: data.number,
    title: data.title,
    body: data.body ?? "",
    labels: extractLabels(data.labels),
    assignees: data.assignees?.map((a) => a.login) ?? [],
    state: data.state,
    created_at: data.created_at,
    updated_at: data.updated_at,
    html_url: data.html_url,
  };
}

export async function getIssueComments(
  issueNumber: number,
): Promise<GitHubComment[]> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const { data } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: issueNumber,
    per_page: 100,
  });

  return data.map((comment) => ({
    id: comment.id,
    body: comment.body ?? "",
    user: comment.user?.login ?? "unknown",
    created_at: comment.created_at,
  }));
}

export async function addComment(
  issueNumber: number,
  body: string,
): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  await octokit.rest.issues.createComment({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });
}

export async function setLabels(
  issueNumber: number,
  labelsToAdd: string[],
  labelsToRemove: string[],
): Promise<void> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  for (const label of labelsToRemove) {
    try {
      await octokit.rest.issues.removeLabel({
        owner,
        repo,
        issue_number: issueNumber,
        name: label,
      });
    } catch {
      // Label might not exist on the issue
    }
  }

  if (labelsToAdd.length > 0) {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: labelsToAdd,
    });
  }
}

export async function createIssue(
  title: string,
  body: string,
  labels: string[],
): Promise<GitHubIssue> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const { data } = await octokit.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels,
  });

  return {
    number: data.number,
    title: data.title,
    body: data.body ?? "",
    labels: extractLabels(data.labels),
    assignees: data.assignees?.map((a) => a.login) ?? [],
    state: data.state,
    created_at: data.created_at,
    updated_at: data.updated_at,
    html_url: data.html_url,
  };
}

export async function getPR(prNumber: number): Promise<GitHubPR> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: prNumber,
  });

  return {
    number: data.number,
    title: data.title,
    head_branch: data.head.ref,
    base_branch: data.base.ref,
    state: data.state,
    merged: data.merged_at !== null,
    html_url: data.html_url,
  };
}

export async function listRecentPRs(
  state: "open" | "closed" | "all" = "all",
  limit = 20,
): Promise<GitHubPR[]> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state,
    per_page: limit,
    sort: "updated",
    direction: "desc",
  });

  return data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    head_branch: pr.head.ref,
    base_branch: pr.base.ref,
    state: pr.state,
    merged: pr.merged_at !== null,
    html_url: pr.html_url,
  }));
}

export async function createPR(
  headBranch: string,
  baseBranch: string,
  title: string,
  body: string,
): Promise<GitHubPR> {
  const octokit = getOctokit();
  const { owner, repo } = getRepoInfo();

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head: headBranch,
    base: baseBranch,
  });

  return {
    number: data.number,
    title: data.title,
    head_branch: data.head.ref,
    base_branch: data.base.ref,
    state: data.state,
    merged: data.merged_at !== null,
    html_url: data.html_url,
  };
}

export function getPipelineLabel(issue: GitHubIssue): string | null {
  const pipelineLabel = issue.labels.find((l) => l.startsWith("pipeline:"));
  return pipelineLabel ? pipelineLabel.replace("pipeline:", "") : null;
}

export function getStatusLabel(issue: GitHubIssue): string | null {
  const statusLabel = issue.labels.find((l) => l.startsWith("status:"));
  return statusLabel ? statusLabel.replace("status:", "") : null;
}
