import { test, describe, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  existsSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { OfficeConfig } from "../src/config.js";
import type { GitHubIssue } from "../src/github.js";
import type { DispatchResult } from "../src/dispatch.js";
import { EventEmitter } from "node:events";

// ---------------------------------------------------------------------------
// Module-level mocks — must precede dynamic imports
// ---------------------------------------------------------------------------

const setLabelsCalls: Array<[number, string[], string[]]> = [];
const addCommentCalls: Array<[number, string]> = [];
const notifyCalls: Array<Record<string, unknown>> = [];

mock.module(new URL("../src/github.js", import.meta.url).href, {
  namedExports: {
    getIssue: async (n: number) => ({
      number: n,
      labels: ["status:ready"],
      title: "Test Issue",
      html_url: `https://github.com/test/repo/issues/${n}`,
    }),
    setLabels: async (num: number, add: string[], remove: string[]) => {
      setLabelsCalls.push([num, add, remove]);
    },
    listIssuesByLabel: async () => [],
    listAllIssues: async () => [],
    getIssueComments: async () => [],
    addComment: async (num: number, body: string) => {
      addCommentCalls.push([num, body]);
    },
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
    getPipelineLabel: () => null,
    getStatusLabel: () => null,
  },
});

mock.module(new URL("../src/worktree.js", import.meta.url).href, {
  namedExports: {
    branchName: (_num: number, _title: string, _pipeline: string) =>
      "test-branch",
    createWorktree: (
      _root: string,
      _base: string,
      _branch: string,
      issueNumber: number,
    ) => ({
      path: "/tmp/fake-worktree",
      branch: "test-branch",
      issueNumber,
    }),
    cleanupWorktree: () => {},
  },
});

mock.module(new URL("../src/notify.js", import.meta.url).href, {
  namedExports: {
    notify: async (_config: unknown, payload: Record<string, unknown>) => {
      notifyCalls.push(payload);
    },
  },
});

mock.module(new URL("../src/config.js", import.meta.url).href, {
  namedExports: {
    loadConfig: () => ({}),
    getBaseBranch: () => "dev",
    getModelForRole: () => "test-model",
  },
});

// Callback invoked each time mock spawn fires — tests can set this to
// inject a signal file mid-step (simulating a signal arriving during
// agent execution, after the initial drain at dispatch start).
let onSpawnClose: (() => void) | null = null;

// Mock child_process: execSync is a no-op, spawn returns a mock that
// emits close(0) on the next tick so invokeAgent resolves immediately.
mock.module("node:child_process", {
  namedExports: {
    execSync: () => "",
    spawn: () => {
      const child = new EventEmitter() as EventEmitter & {
        stdin: { write: () => void; end: () => void };
        stdout: EventEmitter;
        stderr: EventEmitter;
        kill: () => void;
      };
      child.stdin = { write: () => {}, end: () => {} };
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();
      child.kill = () => {};
      process.nextTick(() => {
        onSpawnClose?.();
        child.emit("close", 0);
      });
      return child;
    },
  },
});

const { writeSignal, dispatchIssue } = await import("../src/dispatch.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpProject(): string {
  const dir = mkdtempSync(join(tmpdir(), "office-signal-test-"));
  // Create a 2-step pipeline so signal check runs between steps.
  const pipelinesDir = join(dir, "pipelines");
  mkdirSync(pipelinesDir, { recursive: true });
  writeFileSync(
    join(pipelinesDir, "feature.yml"),
    [
      "name: feature",
      "description: test pipeline",
      "steps:",
      "  - role: architect",
      '    description: "step one"',
      "  - role: implementer",
      '    description: "step two"',
    ].join("\n"),
  );
  // Create agent files so invokeAgent doesn't reject.
  const agentDir = join(dir, ".claude", "agents");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, "architect.md"), "test agent");
  writeFileSync(join(agentDir, "implementer.md"), "test agent");
  return dir;
}

function makeIssue(number: number): GitHubIssue {
  return {
    number,
    labels: ["status:in-progress"],
    title: "Test Issue",
    body: "",
    assignees: [],
    state: "open",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    html_url: `https://github.com/test/repo/issues/${number}`,
  };
}

// Safe because mocked getModelForRole/getBaseBranch short-circuit config access.
const testConfig = {
  dispatch: { agent_idle_timeout: 300, agent_max_timeout: 3600 },
} as unknown as OfficeConfig;

// ---------------------------------------------------------------------------
// dispatchIssue() mid-pipeline signal handling
// ---------------------------------------------------------------------------

describe("dispatchIssue() signal handling", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;
  let errorMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    setLabelsCalls.length = 0;
    addCommentCalls.length = 0;
    notifyCalls.length = 0;
    onSpawnClose = null;
    logMock = mock.method(console, "log", () => {});
    errorMock = mock.method(console, "error", () => {});
  });

  afterEach(() => {
    onSpawnClose = null;
    logMock.mock.restore();
    errorMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("pause signal between steps sets status:paused and adds comment", async () => {
    const issue = makeIssue(42);
    let written = false;
    onSpawnClose = () => {
      if (!written) {
        written = true;
        writeSignal(tmpDir, 42, "pause");
      }
    };

    const result: DispatchResult = await dispatchIssue(
      testConfig,
      tmpDir,
      issue,
      "feature",
    );

    assert.equal(result, "paused");

    const pauseLabel = setLabelsCalls.find(([, add]) =>
      add.includes("status:paused"),
    );
    assert.ok(pauseLabel, "should set status:paused label");
    assert.deepEqual(pauseLabel![2], ["status:in-progress"]);

    assert.ok(
      addCommentCalls.some(([, body]) => body.includes("Paused")),
      "should add a pause comment",
    );
  });

  test("cancel signal between steps sets status:blocked-unclassified and adds comment", async () => {
    const issue = makeIssue(43);
    let written = false;
    onSpawnClose = () => {
      if (!written) {
        written = true;
        writeSignal(tmpDir, 43, "cancel");
      }
    };

    const result: DispatchResult = await dispatchIssue(
      testConfig,
      tmpDir,
      issue,
      "feature",
    );

    assert.equal(result, "cancelled");

    const cancelLabel = setLabelsCalls.find(([, add]) =>
      add.includes("status:blocked-unclassified"),
    );
    assert.ok(cancelLabel, "should set status:blocked-unclassified label");

    assert.ok(
      addCommentCalls.some(([, body]) => body.includes("Cancelled")),
      "should add a cancel comment",
    );
  });

  test("stale signal file is drained after pipeline completes normally", async () => {
    const issue = makeIssue(44);
    // Write signal before dispatch. The 2-step pipeline checks signals only
    // between steps (after step 1), so this signal fires mid-pipeline and
    // pauses. To test the drain path, we need a pipeline where the signal
    // arrives during the LAST step — but our mocks resolve instantly so we
    // can't time that. Instead, test directly: write signal, run a 1-step
    // pipeline, and verify the drain call at the end consumes it.

    // Create a 1-step pipeline so no mid-pipeline check fires.
    writeFileSync(
      join(tmpDir, "pipelines", "single.yml"),
      [
        "name: single",
        "description: one step",
        "steps:",
        "  - role: architect",
        '    description: "only step"',
      ].join("\n"),
    );

    writeSignal(tmpDir, 44, "cancel");
    assert.ok(
      existsSync(join(tmpDir, ".office-signal-44.json")),
      "signal file should exist before dispatch",
    );

    await dispatchIssue(testConfig, tmpDir, issue, "single");

    assert.ok(
      !existsSync(join(tmpDir, ".office-signal-44.json")),
      "signal file should be consumed (drained) after pipeline completes",
    );
  });

  test("wind-down budget triggers pause between steps", async () => {
    const issue = makeIssue(46);
    const budget = {
      shouldWindDown: () => true,
      recordAgentTime: () => {},
      reason: () => "5 of 5 minutes consumed (threshold: 80%)",
    };

    const result: DispatchResult = await dispatchIssue(
      testConfig,
      tmpDir,
      issue,
      "feature",
      budget,
    );

    assert.equal(result, "paused");

    assert.ok(
      addCommentCalls.some(([, body]) => body.includes("wind-down")),
      "should mention wind-down in comment",
    );
  });
});
