import { describe, test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  rmSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";
import yaml from "js-yaml";

import { pause, resume, isDaemonPaused, daemonStatus } from "./daemon.js";

const STATE_FILE = ".office-daemon-state.json";

interface DaemonState {
  status: string;
  startedAt: string;
  lastDispatch: string | null;
  tasksDispatched: number;
}

function createTempDir(): string {
  return mkdtempSync(join(tmpdir(), "daemon-test-"));
}

function removeTempDir(dir: string): void {
  rmSync(dir, { recursive: true, force: true });
}

function readState(dir: string): DaemonState {
  return JSON.parse(
    readFileSync(join(dir, STATE_FILE), "utf-8"),
  ) as DaemonState;
}

function writeState(dir: string, state: DaemonState): void {
  writeFileSync(join(dir, STATE_FILE), JSON.stringify(state, null, 2));
}

function makeState(overrides: Partial<DaemonState> = {}): DaemonState {
  return {
    status: "active",
    startedAt: new Date().toISOString(),
    lastDispatch: null,
    tasksDispatched: 0,
    ...overrides,
  };
}

describe("pause()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  test("creates state file with status paused when none exists", () => {
    pause(tempDir);
    assert.equal(readState(tempDir).status, "paused");
  });

  test("transitions from active to paused", () => {
    writeState(tempDir, makeState({ status: "active" }));
    pause(tempDir);
    assert.equal(readState(tempDir).status, "paused");
  });

  test("transitions from hibernation to paused", () => {
    writeState(tempDir, makeState({ status: "hibernation", tasksDispatched: 3 }));
    pause(tempDir);
    assert.equal(readState(tempDir).status, "paused");
  });

  test("preserves tasksDispatched when pausing", () => {
    writeState(tempDir, makeState({ tasksDispatched: 5 }));
    pause(tempDir);
    assert.equal(readState(tempDir).tasksDispatched, 5);
  });

  test("preserves lastDispatch timestamp when pausing", () => {
    const ts = "2026-08-30T10:00:00.000Z";
    writeState(tempDir, makeState({ lastDispatch: ts }));
    pause(tempDir);
    assert.equal(readState(tempDir).lastDispatch, ts);
  });
});

describe("resume()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  test("sets status to active when paused", () => {
    writeState(tempDir, makeState({ status: "paused" }));
    resume(tempDir);
    assert.equal(readState(tempDir).status, "active");
  });

  test("sets status to active when no state file exists", () => {
    resume(tempDir);
    assert.equal(readState(tempDir).status, "active");
  });

  test("preserves tasksDispatched on resume", () => {
    writeState(tempDir, makeState({ status: "paused", tasksDispatched: 7 }));
    resume(tempDir);
    assert.equal(readState(tempDir).tasksDispatched, 7);
  });

  test("preserves lastDispatch on resume", () => {
    const ts = "2026-08-30T12:00:00.000Z";
    writeState(tempDir, makeState({ status: "paused", lastDispatch: ts }));
    resume(tempDir);
    assert.equal(readState(tempDir).lastDispatch, ts);
  });
});

describe("isDaemonPaused()", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  test("returns true when state is paused", () => {
    writeState(tempDir, makeState({ status: "paused" }));
    assert.ok(isDaemonPaused(tempDir));
  });

  test("returns false when state is active", () => {
    writeState(tempDir, makeState({ status: "active" }));
    assert.ok(!isDaemonPaused(tempDir));
  });

  test("returns false when state is hibernation", () => {
    writeState(tempDir, makeState({ status: "hibernation" }));
    assert.ok(!isDaemonPaused(tempDir));
  });

  test("returns false when no state file exists (defaults to active)", () => {
    assert.ok(!isDaemonPaused(tempDir));
  });
});

describe("daemonStatus()", () => {
  let tempDir: string;
  let output: string[];
  let origLog: typeof console.log;

  beforeEach(() => {
    tempDir = createTempDir();
    output = [];
    origLog = console.log;
    console.log = (...args: unknown[]) => {
      output.push(args.map(String).join(" "));
    };
  });

  afterEach(() => {
    console.log = origLog;
    removeTempDir(tempDir);
  });

  test("reports active status", () => {
    writeState(tempDir, makeState({ status: "active" }));
    daemonStatus(tempDir);
    assert.ok(output.some((l) => l.includes("active")));
  });

  test("reports hibernation status", () => {
    writeState(tempDir, makeState({ status: "hibernation" }));
    daemonStatus(tempDir);
    assert.ok(output.some((l) => l.includes("hibernation")));
  });

  test("reports paused status", () => {
    writeState(tempDir, makeState({ status: "paused" }));
    daemonStatus(tempDir);
    assert.ok(output.some((l) => l.includes("paused")));
  });

  test("reports task dispatch count", () => {
    writeState(tempDir, makeState({ tasksDispatched: 12 }));
    daemonStatus(tempDir);
    assert.ok(output.some((l) => l.includes("12")));
  });

  test('reports "none" when no task has been dispatched', () => {
    writeState(tempDir, makeState({ lastDispatch: null }));
    daemonStatus(tempDir);
    assert.ok(output.some((l) => l.toLowerCase().includes("none")));
  });

  test("reports last dispatch timestamp when available", () => {
    const ts = "2026-08-30T10:00:00.000Z";
    writeState(tempDir, makeState({ lastDispatch: ts }));
    daemonStatus(tempDir);
    assert.ok(output.some((l) => l.includes(ts)));
  });

  test("reports uptime in minutes and seconds format", () => {
    const startedAt = new Date(Date.now() - 125_000).toISOString();
    writeState(tempDir, makeState({ startedAt }));
    daemonStatus(tempDir);
    assert.ok(output.some((l) => /\d+m \d+s/.test(l)));
  });
});

describe("state file structure", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  test("pause writes a state file with all required fields", () => {
    pause(tempDir);
    const s = readState(tempDir);
    assert.ok(typeof s.status === "string");
    assert.ok(typeof s.startedAt === "string");
    assert.ok(typeof s.tasksDispatched === "number");
    assert.ok("lastDispatch" in s);
  });

  test("resume writes a state file with all required fields", () => {
    resume(tempDir);
    const s = readState(tempDir);
    assert.ok(typeof s.status === "string");
    assert.ok(typeof s.startedAt === "string");
    assert.ok(typeof s.tasksDispatched === "number");
    assert.ok("lastDispatch" in s);
  });

  test("state file is valid JSON", () => {
    pause(tempDir);
    const raw = readFileSync(join(tempDir, STATE_FILE), "utf-8");
    assert.doesNotThrow(() => JSON.parse(raw));
  });
});

describe("pause + resume round-trip", () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = createTempDir();
  });

  afterEach(() => {
    removeTempDir(tempDir);
  });

  test("pause then resume restores active state", () => {
    pause(tempDir);
    assert.ok(isDaemonPaused(tempDir));
    resume(tempDir);
    assert.ok(!isDaemonPaused(tempDir));
    assert.equal(readState(tempDir).status, "active");
  });

  test("multiple pause calls leave daemon paused", () => {
    pause(tempDir);
    pause(tempDir);
    assert.ok(isDaemonPaused(tempDir));
  });

  test("multiple resume calls leave daemon active", () => {
    pause(tempDir);
    resume(tempDir);
    resume(tempDir);
    assert.ok(!isDaemonPaused(tempDir));
  });
});

describe("office.config.yml daemon section", () => {
  test("daemon.hibernation_interval is 300 seconds (5-minute default)", () => {
    const configPath = fileURLToPath(
      new URL("../../office.config.yml", import.meta.url),
    );
    const config = yaml.load(
      readFileSync(configPath, "utf-8"),
    ) as Record<string, unknown>;
    const daemonCfg = config["daemon"] as Record<string, unknown> | undefined;
    assert.ok(daemonCfg !== undefined, "daemon section must exist in office.config.yml");
    assert.equal(
      daemonCfg["hibernation_interval"],
      300,
      "hibernation_interval should be 300 (5 minutes)",
    );
  });
});
