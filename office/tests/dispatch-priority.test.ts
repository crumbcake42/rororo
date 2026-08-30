import { test, describe, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OfficeConfig } from "../src/config.js";
import type { GitHubIssue } from "../src/github.js";

// ---------------------------------------------------------------------------
// Module-level mock — separate from dispatch.test.ts so that listIssuesByLabel
// can return a controllable set of issues for priority-sorting tests.
// ---------------------------------------------------------------------------

let stubbedReadyIssues: GitHubIssue[] = [];

mock.module(new URL("../src/github.js", import.meta.url).href, {
  namedExports: {
    getIssue: async (n: number) => ({
      number: n,
      labels: [],
      title: `Issue ${n}`,
      html_url: `https://github.com/test/repo/issues/${n}`,
    }),
    setLabels: async () => {},
    listIssuesByLabel: async () => stubbedReadyIssues,
    listAllIssues: async () => [],
    getIssueComments: async () => [],
    addComment: async () => {},
    createIssue: async () => ({
      number: 0,
      labels: [],
      title: "",
      html_url: "",
    }),
    getPR: async () => ({
      number: 0,
      title: "",
      head_branch: "",
      base_branch: "",
      html_url: "",
    }),
    listRecentPRs: async () => [],
    createPR: async () => ({
      html_url: "https://github.com/test/repo/pull/1",
    }),
    // Returns null so dispatchNext short-circuits before any git operations.
    getPipelineLabel: () => null,
    getStatusLabel: () => null,
  },
});

const { dispatchNext } = await import("../src/dispatch.js");

const minimalConfig = {} as unknown as OfficeConfig;

function makeIssue(number: number, labels: string[]): GitHubIssue {
  return {
    number,
    labels,
    title: `Issue ${number}`,
    body: "",
    assignees: [],
    state: "open",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    html_url: `https://example.com/${number}`,
  };
}

// ---------------------------------------------------------------------------
// dispatchNext() priority queue sorting
//
// When no specific issue number is given, dispatchNext sorts ready issues by
// priority rank (high=0, normal=1, low=2) and picks the first one. We verify
// the chosen issue by inspecting the "no pipeline label" console.log message
// that dispatchNext emits when getPipelineLabel returns null.
// ---------------------------------------------------------------------------

describe("dispatchNext() priority queue sorting", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-priority-test-"));
    stubbedReadyIssues = [];
    logMock = mock.method(console, "log", () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns false when the queue is empty", async () => {
    stubbedReadyIssues = [];
    const result = await dispatchNext(minimalConfig, tmpDir);
    assert.equal(result, false);
  });

  test("dispatches the high-priority issue ahead of a normal-priority issue", async () => {
    stubbedReadyIssues = [
      makeIssue(10, ["status:ready"]),                        // normal priority, lower number
      makeIssue(20, ["status:ready", "priority:high"]),       // high priority, higher number
    ];
    await dispatchNext(minimalConfig, tmpDir);
    const logged = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .join("\n");
    assert.ok(
      logged.includes("#20"),
      `Expected issue #20 (high priority) to be picked first. Log: ${logged}`,
    );
  });

  test("dispatches the normal-priority issue ahead of a low-priority issue", async () => {
    stubbedReadyIssues = [
      makeIssue(5, ["status:ready", "priority:low"]),  // low priority, lowest number
      makeIssue(30, ["status:ready"]),                  // normal priority, higher number
    ];
    await dispatchNext(minimalConfig, tmpDir);
    const logged = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .join("\n");
    assert.ok(
      logged.includes("#30"),
      `Expected issue #30 (normal priority) to be picked over low-priority #5. Log: ${logged}`,
    );
  });

  test("dispatches the high-priority issue ahead of a low-priority issue regardless of issue number", async () => {
    stubbedReadyIssues = [
      makeIssue(1, ["status:ready", "priority:low"]),   // low priority, lowest number
      makeIssue(99, ["status:ready", "priority:high"]), // high priority, highest number
    ];
    await dispatchNext(minimalConfig, tmpDir);
    const logged = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .join("\n");
    assert.ok(
      logged.includes("#99"),
      `Expected issue #99 (high priority) to be picked over low-priority #1. Log: ${logged}`,
    );
  });

  test("breaks ties by issue number ascending (FIFO within same priority)", async () => {
    stubbedReadyIssues = [
      makeIssue(15, ["status:ready"]),
      makeIssue(5, ["status:ready"]),
      makeIssue(10, ["status:ready"]),
    ];
    await dispatchNext(minimalConfig, tmpDir);
    const logged = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .join("\n");
    assert.ok(
      logged.includes("#5"),
      `Expected issue #5 (lowest number) to be picked first among equal-priority issues. Log: ${logged}`,
    );
  });

  test("single ready issue is dispatched regardless of priority", async () => {
    stubbedReadyIssues = [makeIssue(7, ["status:ready", "priority:low"])];
    const result = await dispatchNext(minimalConfig, tmpDir);
    // dispatchNext returns false because getPipelineLabel returns null —
    // but the issue was selected and attempted. The queue was not empty.
    assert.equal(result, false);
    const logged = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .join("\n");
    assert.ok(
      logged.includes("#7"),
      `Expected issue #7 to be attempted. Log: ${logged}`,
    );
  });
});
