import { test, describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { execSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  fetchAndDiff,
  readFileAtRef,
  assembleReviewContext,
} from "../src/review.js";

function git(cwd: string, args: string): void {
  execSync(`git ${args}`, { cwd, stdio: "pipe" });
}

function initBareRemote(): string {
  const remote = mkdtempSync(join(tmpdir(), "review-test-remote-"));
  git(remote, "init --bare");
  return remote;
}

function cloneRepo(remote: string): string {
  const local = mkdtempSync(join(tmpdir(), "review-test-local-"));
  git(local, `clone "${remote}" .`);
  git(local, 'config user.email "test@test.com"');
  git(local, 'config user.name "Test"');
  return local;
}

describe("fetchAndDiff()", () => {
  let remote: string;
  let local: string;

  beforeEach(() => {
    remote = initBareRemote();
    local = cloneRepo(remote);

    writeFileSync(join(local, "base.txt"), "base content\n");
    git(local, "add -A");
    git(local, 'commit -m "initial"');
    git(local, "push origin HEAD:main");

    git(local, "checkout -b feature");
    writeFileSync(join(local, "feature.txt"), "new feature\n");
    git(local, "add -A");
    git(local, 'commit -m "add feature"');
    git(local, "push origin feature");
  });

  afterEach(() => {
    rmSync(remote, { recursive: true, force: true });
    rmSync(local, { recursive: true, force: true });
  });

  test("returns diff and changed files between branches", () => {
    const result = fetchAndDiff(local, "main", "feature");
    assert.ok(result.diff.includes("feature.txt"));
    assert.deepEqual(result.changedFiles, ["feature.txt"]);
  });

  test("returns empty diff when branches are identical", () => {
    const result = fetchAndDiff(local, "main", "main");
    assert.equal(result.diff, "");
    assert.deepEqual(result.changedFiles, []);
  });
});

describe("readFileAtRef()", () => {
  let remote: string;
  let local: string;

  beforeEach(() => {
    remote = initBareRemote();
    local = cloneRepo(remote);

    writeFileSync(join(local, "hello.txt"), "hello world\n");
    git(local, "add -A");
    git(local, 'commit -m "add hello"');
    git(local, "push origin HEAD:main");
  });

  afterEach(() => {
    rmSync(remote, { recursive: true, force: true });
    rmSync(local, { recursive: true, force: true });
  });

  test("reads file content at a given ref", () => {
    const content = readFileAtRef(local, "origin/main", "hello.txt");
    assert.equal(content, "hello world\n");
  });

  test("returns empty string for nonexistent file", () => {
    const content = readFileAtRef(local, "origin/main", "nope.txt");
    assert.equal(content, "");
  });
});

describe("assembleReviewContext()", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "review-test-ctx-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("includes PR metadata in output", () => {
    const ctx = assembleReviewContext(
      tmpDir,
      { number: 1, title: "Test PR", head_branch: "feat", base_branch: "main" },
      "diff content",
      [],
    );
    assert.ok(ctx.includes("PR Review: #1"));
    assert.ok(ctx.includes("Test PR"));
    assert.ok(ctx.includes("feat"));
    assert.ok(ctx.includes("main"));
  });

  test("includes ARCHITECTURE.md when present", () => {
    writeFileSync(join(tmpDir, "ARCHITECTURE.md"), "# Arch doc");
    const ctx = assembleReviewContext(
      tmpDir,
      { number: 1, title: "t", head_branch: "h", base_branch: "b" },
      "diff",
      [],
    );
    assert.ok(ctx.includes("# Arch doc"));
  });

  test("includes PITFALLS.md when present", () => {
    writeFileSync(join(tmpDir, "PITFALLS.md"), "# Known pitfalls");
    const ctx = assembleReviewContext(
      tmpDir,
      { number: 1, title: "t", head_branch: "h", base_branch: "b" },
      "diff",
      [],
    );
    assert.ok(ctx.includes("# Known pitfalls"));
  });

  test("includes diff in output", () => {
    const ctx = assembleReviewContext(
      tmpDir,
      { number: 1, title: "t", head_branch: "h", base_branch: "b" },
      "+added line\n-removed line",
      [],
    );
    assert.ok(ctx.includes("+added line"));
    assert.ok(ctx.includes("-removed line"));
  });

  test("includes review instructions", () => {
    const ctx = assembleReviewContext(
      tmpDir,
      { number: 1, title: "t", head_branch: "h", base_branch: "b" },
      "diff",
      [],
    );
    assert.ok(ctx.includes("Field/type naming consistency"));
    assert.ok(ctx.includes("Import/export mismatches"));
  });

  test("truncates when context exceeds MAX_CONTEXT_BYTES", () => {
    const hugeDiff = "x".repeat(200_000);
    const ctx = assembleReviewContext(
      tmpDir,
      { number: 1, title: "t", head_branch: "h", base_branch: "b" },
      hugeDiff,
      [],
    );
    assert.ok(ctx.length <= 200_000);
    assert.ok(ctx.includes("[truncated"));
  });

  test("includes spec files when present", () => {
    const specsDir = join(tmpDir, "office", "specs", "dispatch");
    mkdirSync(specsDir, { recursive: true });
    writeFileSync(join(specsDir, "spec.md"), "# Dispatch spec");
    const ctx = assembleReviewContext(
      tmpDir,
      { number: 1, title: "t", head_branch: "h", base_branch: "b" },
      "diff",
      [],
    );
    assert.ok(ctx.includes("Spec: dispatch"));
    assert.ok(ctx.includes("# Dispatch spec"));
  });
});
