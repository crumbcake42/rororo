import { test, describe, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventEmitter } from "node:events";
import type { OfficeConfig } from "../src/config.js";
import type { PipelineStep } from "../src/dispatch.js";

// ---------------------------------------------------------------------------
// Module-level mock setup — must precede dynamic imports
// ---------------------------------------------------------------------------

type MockChild = EventEmitter & {
  stdin: { write: () => void; end: () => void };
  stdout: EventEmitter;
  stderr: EventEmitter;
  kill: ReturnType<typeof mock.fn>;
};

let currentChild: MockChild | null = null;

function makeMockChild(): MockChild {
  const child = new EventEmitter() as MockChild;
  child.stdin = { write: () => {}, end: () => {} };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.kill = mock.fn(() => {});
  return child;
}

mock.module("node:child_process", {
  namedExports: {
    execSync: () => "",
    spawn: () => {
      currentChild = makeMockChild();
      return currentChild;
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

const { invokeAgent } = await import("../src/dispatch.js");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTmpProject(role = "test-agent"): string {
  const dir = mkdtempSync(join(tmpdir(), "office-agent-timeout-test-"));
  const agentDir = join(dir, ".claude", "agents");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(join(agentDir, `${role}.md`), "test agent definition");
  return dir;
}

const testStep: PipelineStep = { role: "test-agent", description: "test step" };

const testConfig = {
  dispatch: { agent_idle_timeout: 300, agent_max_timeout: 3600 },
} as unknown as OfficeConfig;

// ---------------------------------------------------------------------------
// invokeAgent() — process lifecycle and timeout behavior
// ---------------------------------------------------------------------------

describe("invokeAgent() process lifecycle", () => {
  let tmpDir: string;
  let logMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = makeTmpProject();
    currentChild = null;
    logMock = mock.method(console, "log", () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
    mock.timers.reset();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("resolves when stdout ends then process exits with code 0", async () => {
    const promise = invokeAgent(testConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;
    child.stdout.emit("end");
    child.emit("close", 0);
    const result = await promise;
    assert.equal(result, "");
  });

  test("rejects when process exits with non-zero code", async () => {
    const promise = invokeAgent(testConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;
    child.stdout.emit("end");
    child.emit("close", 1);
    await assert.rejects(promise, /failed with exit code 1/);
  });

  test("resolves when process lingers past exit grace period after stdout ends", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });

    const promise = invokeAgent(testConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;

    // Agent finishes producing output
    child.stdout.emit("end");

    // Advance past the 30s exit grace period
    mock.timers.tick(30_001);

    // kill() was called; emit close so the promise settles
    assert.equal(
      child.kill.mock.callCount(),
      1,
      "kill should be called after grace period expires",
    );
    child.emit("close", null);

    // Should resolve (success), not reject — work product is committed
    const result = await promise;
    assert.equal(result, "");
  });

  test("grace period timer is cancelled when process exits before it fires", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });

    const promise = invokeAgent(testConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;

    // stdout ends, then process exits cleanly within the grace window
    child.stdout.emit("end");
    child.emit("close", 0);

    // Advancing past where the grace period would have fired must not kill
    mock.timers.tick(30_001);

    const result = await promise;
    assert.equal(result, "");
    assert.equal(
      child.kill.mock.callCount(),
      0,
      "kill should NOT be called when process exits before grace period",
    );
  });

  test("idle timer fires and rejects when agent produces no output before stdout ends", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });

    const promise = invokeAgent(testConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;

    // Advance past the 300s idle timeout with no output or stdout end
    mock.timers.tick(300_001);

    assert.equal(
      child.kill.mock.callCount(),
      1,
      "kill should be called when idle timeout fires",
    );
    child.emit("close", null);

    await assert.rejects(promise, /idle for 300s with no output/);
  });

  test("idle timer is reset by stdout data, delaying the timeout", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });

    const promise = invokeAgent(testConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;

    // Some output arrives at 200s — well before the 300s idle deadline
    mock.timers.tick(200_000);
    child.stdout.emit("data", Buffer.from("partial output"));

    // Idle timer was reset; 300s from the data event = 500s total
    // Tick the remaining 300s
    mock.timers.tick(300_001);

    assert.equal(
      child.kill.mock.callCount(),
      1,
      "kill should be called 300s after the last data event",
    );
    child.emit("close", null);

    await assert.rejects(promise, /idle for 300s with no output/);
  });

  test("idle timer is reset by stderr data before stdout ends", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });

    const promise = invokeAgent(testConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;

    // stderr arrives at 200s — resets the 300s idle timer
    mock.timers.tick(200_000);
    child.stderr.emit("data", Buffer.from("some stderr"));

    // Original 300s deadline (from spawn) has passed, but timer was reset
    mock.timers.tick(100_000); // now at 300s total
    assert.equal(child.kill.mock.callCount(), 0, "idle timer should have been reset by stderr");

    // Advance past the reset deadline (200s + 300s = 500s total)
    mock.timers.tick(200_001);
    assert.equal(child.kill.mock.callCount(), 1, "idle timer should fire 300s after stderr data");

    child.emit("close", null);
    await assert.rejects(promise, /idle for 300s with no output/);
  });

  test("max timer fires and rejects when agent exceeds max timeout before stdout ends", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });

    const shortMaxConfig = {
      dispatch: { agent_idle_timeout: 300, agent_max_timeout: 60 },
    } as unknown as OfficeConfig;

    const promise = invokeAgent(shortMaxConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;

    // Keep resetting idle timer with data so only max timer fires
    mock.timers.tick(30_000);
    child.stdout.emit("data", Buffer.from("output"));
    mock.timers.tick(30_001); // past 60s max timeout

    assert.equal(child.kill.mock.callCount(), 1, "max timer should fire");
    child.emit("close", null);
    await assert.rejects(promise, /exceeded max timeout of 60s/);
  });

  test("idle timer does not reset after stdout ends", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });

    const promise = invokeAgent(testConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;

    // stdout ends — idle timer is cancelled, grace timer (30s) starts
    child.stdout.emit("end");

    // Stderr data after stdout ends must NOT restart the idle timer
    child.stderr.emit("data", Buffer.from("some stderr after output"));

    // Advance past the 30s grace period — only the grace timer should fire
    mock.timers.tick(30_001);
    assert.equal(
      child.kill.mock.callCount(),
      1,
      "grace period kill should fire after 30s",
    );

    // Advance well past where an idle timer reset by stderr would fire (300s)
    // Kill count must remain 1 — no additional idle kill from stderr data
    mock.timers.tick(300_000);
    assert.equal(
      child.kill.mock.callCount(),
      1,
      "stderr data after stdout ends must not create a new idle timer",
    );

    child.emit("close", null);
    await promise; // resolves as success (killedAfterOutput=true)
  });

  test("max timer is cancelled when stdout ends so it cannot misfire as failure", async () => {
    mock.timers.enable({ apis: ["setTimeout"] });

    const shortMaxConfig = {
      dispatch: { agent_idle_timeout: 300, agent_max_timeout: 10 },
    } as unknown as OfficeConfig;

    const promise = invokeAgent(shortMaxConfig, tmpDir, tmpDir, testStep, "ctx");
    await Promise.resolve();
    const child = currentChild!;

    // stdout ends at 5s — before the 10s max timeout
    mock.timers.tick(5_000);
    child.stdout.emit("end");

    // Advance past the 10s max timeout boundary
    mock.timers.tick(6_000);

    // Max timer should NOT have fired — only grace timer is active
    assert.equal(
      child.kill.mock.callCount(),
      0,
      "max timer must not fire after stdout ends",
    );

    // Process exits cleanly within the 30s grace period
    child.emit("close", 0);
    const result = await promise;
    assert.equal(result, "");
  });

  test("resolves with captured stdout when captureOutput is true", async () => {
    const promise = invokeAgent(
      testConfig,
      tmpDir,
      tmpDir,
      testStep,
      "ctx",
      true,
    );
    await Promise.resolve();
    const child = currentChild!;
    child.stdout.emit("data", Buffer.from("hello "));
    child.stdout.emit("data", Buffer.from("world"));
    child.stdout.emit("end");
    child.emit("close", 0);
    const result = await promise;
    assert.equal(result, "hello world");
  });

  test("rejects when agent definition file does not exist", async () => {
    const badStep: PipelineStep = {
      role: "nonexistent-agent",
      description: "missing",
    };
    await assert.rejects(
      invokeAgent(testConfig, tmpDir, tmpDir, badStep, "ctx"),
      /Agent definition not found/,
    );
  });
});
