import { test, describe, beforeEach, afterEach, mock } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { loadConfig, checkDispatchModeAdvisory } from "../src/config.js";

function writeConfig(dir: string, overrides: Record<string, unknown>): void {
  const base = {
    project_name: "test",
    branch_strategy: "simple",
    notification_mode: "watch",
    dispatch_mode: "manual",
    models: { opus: "claude-opus-4-6", sonnet: "claude-sonnet-4-6" },
    quality_gates: {},
    ...overrides,
  };
  mkdirSync(dir, { recursive: true });
  writeFileSync(
    join(dir, "office.config.yml"),
    Object.entries(base)
      .map(([k, v]) =>
        typeof v === "object"
          ? `${k}:\n` +
            Object.entries(v as Record<string, unknown>)
              .map(([sk, sv]) => `  ${sk}: ${JSON.stringify(sv)}`)
              .join("\n")
          : `${k}: ${JSON.stringify(v)}`,
      )
      .join("\n"),
  );
}

describe("dispatch_mode advisory warnings", () => {
  let tmpDir: string;
  let warnMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "dispatch-mode-test-"));
    warnMock = mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    warnMock.mock.restore();
    rmSync(tmpDir, { recursive: true, force: true });
  });

  test("loadConfig reads dispatch_mode: daemon", () => {
    writeConfig(tmpDir, { dispatch_mode: "daemon" });
    const config = loadConfig(tmpDir);
    assert.equal(config.dispatch_mode, "daemon");
  });

  test("loadConfig reads dispatch_mode: manual", () => {
    writeConfig(tmpDir, { dispatch_mode: "manual" });
    const config = loadConfig(tmpDir);
    assert.equal(config.dispatch_mode, "manual");
  });

  test("loadConfig defaults dispatch_mode to manual when omitted", () => {
    writeConfig(tmpDir, {});
    const config = loadConfig(tmpDir);
    assert.equal(config.dispatch_mode, "manual");
  });

  test("dispatch command warns when dispatch_mode is daemon", () => {
    writeConfig(tmpDir, { dispatch_mode: "daemon" });
    const config = loadConfig(tmpDir);
    checkDispatchModeAdvisory(config, "dispatch");
    assert.equal(warnMock.mock.callCount(), 1);
    const msg = String(warnMock.mock.calls[0].arguments[0]);
    assert.ok(msg.includes("daemon"), `Expected 'daemon' in: ${msg}`);
    assert.ok(
      msg.includes("Run `office start` instead"),
      `Expected actionable guidance in: ${msg}`,
    );
  });

  test("dispatch command does not warn when dispatch_mode is manual", () => {
    writeConfig(tmpDir, { dispatch_mode: "manual" });
    const config = loadConfig(tmpDir);
    checkDispatchModeAdvisory(config, "dispatch");
    assert.equal(warnMock.mock.callCount(), 0);
  });

  test("start command warns when dispatch_mode is manual", () => {
    writeConfig(tmpDir, { dispatch_mode: "manual" });
    const config = loadConfig(tmpDir);
    checkDispatchModeAdvisory(config, "start");
    assert.equal(warnMock.mock.callCount(), 1);
    const msg = String(warnMock.mock.calls[0].arguments[0]);
    assert.ok(msg.includes("manual"), `Expected 'manual' in: ${msg}`);
    assert.ok(
      msg.includes("Change dispatch_mode to 'daemon'"),
      `Expected actionable guidance in: ${msg}`,
    );
  });

  test("start command does not warn when dispatch_mode is daemon", () => {
    writeConfig(tmpDir, { dispatch_mode: "daemon" });
    const config = loadConfig(tmpDir);
    checkDispatchModeAdvisory(config, "start");
    assert.equal(warnMock.mock.callCount(), 0);
  });
});
