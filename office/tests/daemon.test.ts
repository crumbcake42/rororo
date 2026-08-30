import { test, describe, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { pause, resume, isDaemonPaused, daemonStatus } from "../src/daemon.js";

const STATE_FILE = ".office-daemon-state.json";

function writeState(
  dir: string,
  overrides: Partial<{
    phase: string;
    startedAt: string;
    lastDispatch: string | null;
    tasksDispatched: number;
  }> = {},
): void {
  const state = {
    phase: "active",
    startedAt: new Date().toISOString(),
    lastDispatch: null,
    tasksDispatched: 0,
    ...overrides,
  };
  writeFileSync(join(dir, STATE_FILE), JSON.stringify(state, null, 2));
}

function readState(dir: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(join(dir, STATE_FILE), "utf-8"),
  ) as Record<string, unknown>;
}

describe("pause()", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-daemon-test-"));
    logMock = mock.method(console, "log", () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("prints not-running message when no state file exists", () => {
    pause(tmpDir);
    const logged = logMock.mock.calls.map((c) => c.arguments[0]);
    assert.ok(
      logged.some((msg) => String(msg).includes("No daemon state found")),
      `Expected 'No daemon state found' in: ${JSON.stringify(logged)}`,
    );
  });

  test("transitions active daemon to paused", () => {
    writeState(tmpDir, { phase: "active" });
    pause(tmpDir);
    assert.equal(readState(tmpDir).phase, "paused");
  });

  test("transitions hibernating daemon to paused", () => {
    writeState(tmpDir, { phase: "hibernation" });
    pause(tmpDir);
    assert.equal(readState(tmpDir).phase, "paused");
  });

  test("logs confirmation message on success", () => {
    writeState(tmpDir, { phase: "active" });
    pause(tmpDir);
    const logged = logMock.mock.calls.map((c) => c.arguments[0]);
    assert.ok(
      logged.some((msg) => String(msg).includes("paused")),
      `Expected confirmation in: ${JSON.stringify(logged)}`,
    );
  });
});

describe("resume()", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-daemon-test-"));
    logMock = mock.method(console, "log", () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("prints not-running message when no state file exists", () => {
    resume(tmpDir);
    const logged = logMock.mock.calls.map((c) => c.arguments[0]);
    assert.ok(
      logged.some((msg) => String(msg).includes("No daemon state found")),
      `Expected 'No daemon state found' in: ${JSON.stringify(logged)}`,
    );
  });

  test("transitions paused daemon to active", () => {
    writeState(tmpDir, { phase: "paused" });
    resume(tmpDir);
    assert.equal(readState(tmpDir).phase, "active");
  });

  test("logs confirmation message on success", () => {
    writeState(tmpDir, { phase: "paused" });
    resume(tmpDir);
    const logged = logMock.mock.calls.map((c) => c.arguments[0]);
    assert.ok(
      logged.some((msg) => String(msg).includes("resumed")),
      `Expected confirmation in: ${JSON.stringify(logged)}`,
    );
  });

  test("preserves tasksDispatched counter on resume", () => {
    writeState(tmpDir, { phase: "paused", tasksDispatched: 7 });
    resume(tmpDir);
    assert.equal(readState(tmpDir).tasksDispatched, 7);
  });
});

describe("isDaemonPaused()", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-daemon-test-"));
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("returns false when no state file exists", () => {
    assert.equal(isDaemonPaused(tmpDir), false);
  });

  test("returns true when phase is paused", () => {
    writeState(tmpDir, { phase: "paused" });
    assert.equal(isDaemonPaused(tmpDir), true);
  });

  test("returns false when phase is active", () => {
    writeState(tmpDir, { phase: "active" });
    assert.equal(isDaemonPaused(tmpDir), false);
  });

  test("returns false when phase is hibernation", () => {
    writeState(tmpDir, { phase: "hibernation" });
    assert.equal(isDaemonPaused(tmpDir), false);
  });
});

describe("daemonStatus()", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;
  let savedToken: string | undefined;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "office-daemon-test-"));
    logMock = mock.method(console, "log", () => {});
    // No GITHUB_TOKEN → listIssuesByLabel throws → queue depth shows "unknown"
    savedToken = process.env.GITHUB_TOKEN;
    delete process.env.GITHUB_TOKEN;
  });

  afterEach(() => {
    logMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
    if (savedToken !== undefined) {
      process.env.GITHUB_TOKEN = savedToken;
    } else {
      delete process.env.GITHUB_TOKEN;
    }
  });

  test("prints not-started message when no state file exists", async () => {
    await daemonStatus(tmpDir);
    const logged = logMock.mock.calls.map((c) => c.arguments[0]);
    assert.equal(logged.length, 1, "should print exactly one line");
    assert.ok(
      String(logged[0]).includes("Daemon has not started"),
      `Expected not-started message, got: ${JSON.stringify(logged)}`,
    );
    assert.ok(
      String(logged[0]).includes("office start"),
      "should mention how to start the daemon",
    );
  });

  test("prints state field", async () => {
    writeState(tmpDir, { phase: "active" });
    await daemonStatus(tmpDir);
    const output = logMock.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    assert.ok(output.includes("active"), `Expected 'active' in output: ${output}`);
  });

  test("prints paused phase correctly", async () => {
    writeState(tmpDir, { phase: "paused" });
    await daemonStatus(tmpDir);
    const output = logMock.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    assert.ok(output.includes("paused"), `Expected 'paused' in output: ${output}`);
  });

  test("prints hibernation phase correctly", async () => {
    writeState(tmpDir, { phase: "hibernation" });
    await daemonStatus(tmpDir);
    const output = logMock.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    assert.ok(output.includes("hibernation"), `Expected 'hibernation' in output: ${output}`);
  });

  test("prints tasks dispatched count", async () => {
    writeState(tmpDir, { tasksDispatched: 3 });
    await daemonStatus(tmpDir);
    const output = logMock.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    assert.ok(
      output.includes("3"),
      `Expected tasks count '3' in output: ${output}`,
    );
  });

  test("shows 'never' for last dispatch when no dispatch has occurred", async () => {
    writeState(tmpDir, { lastDispatch: null });
    await daemonStatus(tmpDir);
    const output = logMock.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    assert.ok(output.includes("never"), `Expected 'never' in output: ${output}`);
  });

  test("shows formatted timestamp when last dispatch exists", async () => {
    const lastDispatch = new Date().toISOString();
    writeState(tmpDir, { lastDispatch });
    await daemonStatus(tmpDir);
    const output = logMock.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    // When lastDispatch is set it should NOT show "never"
    const lastDispatchLine = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .find((l) => l.includes("Last dispatch"));
    assert.ok(lastDispatchLine, "should have a Last dispatch line");
    assert.ok(
      !lastDispatchLine.includes("never"),
      `Last dispatch line should not say 'never': ${lastDispatchLine}`,
    );
  });

  test("shows 'unknown' queue depth when GitHub is unavailable", async () => {
    writeState(tmpDir);
    await daemonStatus(tmpDir);
    const output = logMock.mock.calls.map((c) => String(c.arguments[0])).join("\n");
    assert.ok(output.includes("unknown"), `Expected 'unknown' queue depth: ${output}`);
  });

  test("prints uptime in seconds for daemon started less than a minute ago", async () => {
    const startedAt = new Date(Date.now() - 30_000).toISOString();
    writeState(tmpDir, { startedAt });
    await daemonStatus(tmpDir);
    const uptimeLine = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .find((l) => l.includes("Uptime"));
    assert.ok(uptimeLine, "should have Uptime line");
    // e.g. "30s"
    assert.match(uptimeLine, /\d+s/, "uptime should end in seconds 's'");
  });

  test("prints uptime in minutes for daemon running over a minute", async () => {
    const startedAt = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    writeState(tmpDir, { startedAt });
    await daemonStatus(tmpDir);
    const uptimeLine = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .find((l) => l.includes("Uptime"));
    assert.ok(uptimeLine, "should have Uptime line");
    // e.g. "5m 0s"
    assert.match(uptimeLine, /\d+m/, "uptime should include minutes 'm'");
  });

  test("prints uptime in hours for daemon running over an hour", async () => {
    const startedAt = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    writeState(tmpDir, { startedAt });
    await daemonStatus(tmpDir);
    const uptimeLine = logMock.mock.calls
      .map((c) => String(c.arguments[0]))
      .find((l) => l.includes("Uptime"));
    assert.ok(uptimeLine, "should have Uptime line");
    // e.g. "2h 0m"
    assert.match(uptimeLine, /\d+h/, "uptime should include hours 'h'");
  });

  test("prints all five status fields", async () => {
    writeState(tmpDir, { tasksDispatched: 0 });
    await daemonStatus(tmpDir);
    const lines = logMock.mock.calls.map((c) => String(c.arguments[0]));
    assert.equal(lines.length, 5, `Expected 5 output lines, got ${lines.length}: ${JSON.stringify(lines)}`);
    assert.ok(lines.some((l) => l.includes("State:")), "missing State line");
    assert.ok(lines.some((l) => l.includes("Uptime:")), "missing Uptime line");
    assert.ok(lines.some((l) => l.includes("Tasks dispatched:")), "missing Tasks dispatched line");
    assert.ok(lines.some((l) => l.includes("Last dispatch:")), "missing Last dispatch line");
    assert.ok(lines.some((l) => l.includes("Ready queue:")), "missing Ready queue line");
  });
});
