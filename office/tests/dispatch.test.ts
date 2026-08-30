import { test, describe, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// ---------------------------------------------------------------------------
// Module-level mock setup
// ---------------------------------------------------------------------------
// mock.module must be called before any office module is dynamically imported
// so that dispatch.ts and daemon.ts never load the real github.js.

let stubbedIssueLabels: string[] = [];
const setLabelsCalls: Array<[number, string[], string[]]> = [];

mock.module(new URL("../src/github.js", import.meta.url).href, {
  namedExports: {
    getIssue: async (n: number) => ({
      number: n,
      labels: stubbedIssueLabels,
      title: "Test Issue",
      html_url: `https://github.com/test/repo/issues/${n}`,
    }),
    setLabels: async (
      issueNumber: number,
      add: string[],
      remove: string[],
    ) => {
      setLabelsCalls.push([issueNumber, add, remove]);
    },
    listIssuesByLabel: async () => [],
    listAllIssues: async () => [],
    getIssueComments: async () => [],
    addComment: async () => {},
    createIssue: async () => ({ number: 0, labels: [], title: "", html_url: "" }),
    getPR: async () => ({ number: 0, title: "", head_branch: "", base_branch: "", html_url: "" }),
    listRecentPRs: async () => [],
    createPR: async () => ({
      html_url: "https://github.com/test/repo/pull/1",
    }),
    getPipelineLabel: () => null,
    getStatusLabel: () => null,
  },
});

const { writeSignal } = await import("../src/dispatch.js");
const { pausePipeline, cancelPipeline, resumePipeline } = await import(
  "../src/daemon.js"
);

// ---------------------------------------------------------------------------
// writeSignal()
// ---------------------------------------------------------------------------

describe("writeSignal()", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-dispatch-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("creates a signal file at the correct path for pause", () => {
    writeSignal(tmpDir, 42, "pause");
    assert.ok(
      existsSync(join(tmpDir, ".office-signal-42.json")),
      "expected .office-signal-42.json to exist",
    );
  });

  test("creates a signal file at the correct path for cancel", () => {
    writeSignal(tmpDir, 99, "cancel");
    assert.ok(
      existsSync(join(tmpDir, ".office-signal-99.json")),
      "expected .office-signal-99.json to exist",
    );
  });

  test("writes { action: 'pause' } for a pause signal", () => {
    writeSignal(tmpDir, 1, "pause");
    const raw = readFileSync(join(tmpDir, ".office-signal-1.json"), "utf-8");
    const parsed = JSON.parse(raw) as { action: string };
    assert.equal(parsed.action, "pause");
  });

  test("writes { action: 'cancel' } for a cancel signal", () => {
    writeSignal(tmpDir, 1, "cancel");
    const raw = readFileSync(join(tmpDir, ".office-signal-1.json"), "utf-8");
    const parsed = JSON.parse(raw) as { action: string };
    assert.equal(parsed.action, "cancel");
  });

  test("uses issue-number-specific filenames to isolate concurrent pipelines", () => {
    writeSignal(tmpDir, 10, "pause");
    writeSignal(tmpDir, 20, "cancel");

    const raw10 = readFileSync(join(tmpDir, ".office-signal-10.json"), "utf-8");
    const raw20 = readFileSync(join(tmpDir, ".office-signal-20.json"), "utf-8");

    assert.equal((JSON.parse(raw10) as { action: string }).action, "pause");
    assert.equal((JSON.parse(raw20) as { action: string }).action, "cancel");
  });

  test("overwrites the previous signal (last write wins)", () => {
    writeSignal(tmpDir, 5, "pause");
    writeSignal(tmpDir, 5, "cancel");
    const raw = readFileSync(join(tmpDir, ".office-signal-5.json"), "utf-8");
    assert.equal((JSON.parse(raw) as { action: string }).action, "cancel");
  });
});

// ---------------------------------------------------------------------------
// pausePipeline()
// ---------------------------------------------------------------------------

describe("pausePipeline()", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;
  let warnMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-dispatch-test-"));
    stubbedIssueLabels = [];
    logMock = mock.method(console, "log", () => {});
    warnMock = mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
    warnMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("writes a pause signal file when the issue is in-progress", async () => {
    stubbedIssueLabels = ["status:in-progress"];
    await pausePipeline(tmpDir, 7);
    const signalPath = join(tmpDir, ".office-signal-7.json");
    assert.ok(existsSync(signalPath), "pause signal file should be created");
    const parsed = JSON.parse(readFileSync(signalPath, "utf-8")) as {
      action: string;
    };
    assert.equal(parsed.action, "pause");
  });

  test("does not write a signal file when the issue is not in-progress", async () => {
    stubbedIssueLabels = ["status:ready"];
    await pausePipeline(tmpDir, 8);
    assert.ok(
      !existsSync(join(tmpDir, ".office-signal-8.json")),
      "signal file should not be written for a non-in-progress issue",
    );
  });

  test("emits a warning when the issue is not in-progress", async () => {
    stubbedIssueLabels = ["status:done"];
    await pausePipeline(tmpDir, 9);
    assert.ok(
      warnMock.mock.callCount() > 0,
      "console.warn should be called for a non-in-progress issue",
    );
  });
});

// ---------------------------------------------------------------------------
// cancelPipeline()
// ---------------------------------------------------------------------------

describe("cancelPipeline()", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;
  let warnMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-dispatch-test-"));
    stubbedIssueLabels = [];
    logMock = mock.method(console, "log", () => {});
    warnMock = mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
    warnMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("writes a cancel signal file when the issue is in-progress", async () => {
    stubbedIssueLabels = ["status:in-progress"];
    await cancelPipeline(tmpDir, 11);
    const signalPath = join(tmpDir, ".office-signal-11.json");
    assert.ok(existsSync(signalPath), "cancel signal file should be created");
    const parsed = JSON.parse(readFileSync(signalPath, "utf-8")) as {
      action: string;
    };
    assert.equal(parsed.action, "cancel");
  });

  test("does not write a signal file when the issue is not in-progress", async () => {
    stubbedIssueLabels = ["status:paused"];
    await cancelPipeline(tmpDir, 12);
    assert.ok(
      !existsSync(join(tmpDir, ".office-signal-12.json")),
      "signal file should not be written for a non-in-progress issue",
    );
  });

  test("emits a warning when the issue is not in-progress", async () => {
    stubbedIssueLabels = ["status:review"];
    await cancelPipeline(tmpDir, 13);
    assert.ok(
      warnMock.mock.callCount() > 0,
      "console.warn should be called for a non-in-progress issue",
    );
  });
});

// ---------------------------------------------------------------------------
// resumePipeline()
// ---------------------------------------------------------------------------

describe("resumePipeline()", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;
  let warnMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-dispatch-test-"));
    stubbedIssueLabels = [];
    setLabelsCalls.length = 0;
    logMock = mock.method(console, "log", () => {});
    warnMock = mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
    warnMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("calls setLabels to add status:ready and remove status:paused when issue is paused", async () => {
    stubbedIssueLabels = ["status:paused"];
    await resumePipeline(tmpDir, 15);
    assert.equal(setLabelsCalls.length, 1, "setLabels should be called once");
    assert.deepEqual(setLabelsCalls[0][1], ["status:ready"]);
    assert.deepEqual(setLabelsCalls[0][2], ["status:paused"]);
  });

  test("does not call setLabels when the issue is not paused", async () => {
    stubbedIssueLabels = ["status:in-progress"];
    await resumePipeline(tmpDir, 16);
    assert.equal(
      setLabelsCalls.length,
      0,
      "setLabels should not be called for a non-paused issue",
    );
  });

  test("emits a warning when the issue is not paused", async () => {
    stubbedIssueLabels = ["status:blocked-human"];
    await resumePipeline(tmpDir, 17);
    assert.ok(
      warnMock.mock.callCount() > 0,
      "console.warn should be called when issue is not paused",
    );
  });
});
