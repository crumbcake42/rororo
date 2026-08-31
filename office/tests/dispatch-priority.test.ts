import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { sortByPriority, getPriorityRank } from "../src/dispatch.js";

interface MinimalIssue {
  number: number;
  labels: string[];
}

function makeIssue(number: number, labels: string[]): MinimalIssue {
  return { number, labels };
}

// ---------------------------------------------------------------------------
// getPriorityRank()
// ---------------------------------------------------------------------------

describe("getPriorityRank()", () => {
  test("returns 0 for priority:high", () => {
    assert.equal(getPriorityRank(["status:ready", "priority:high"]), 0);
  });

  test("returns 1 (normal) when no priority label present", () => {
    assert.equal(getPriorityRank(["status:ready"]), 1);
  });

  test("returns 2 for priority:low", () => {
    assert.equal(getPriorityRank(["priority:low"]), 2);
  });
});

// ---------------------------------------------------------------------------
// sortByPriority()
// ---------------------------------------------------------------------------

describe("sortByPriority()", () => {
  test("high-priority issue sorts before normal-priority issue", () => {
    const issues = [
      makeIssue(10, ["status:ready"]),
      makeIssue(20, ["status:ready", "priority:high"]),
    ];
    const sorted = sortByPriority(issues);
    assert.equal(sorted[0].number, 20);
  });

  test("normal-priority issue sorts before low-priority issue", () => {
    const issues = [
      makeIssue(5, ["status:ready", "priority:low"]),
      makeIssue(30, ["status:ready"]),
    ];
    const sorted = sortByPriority(issues);
    assert.equal(sorted[0].number, 30);
  });

  test("high-priority sorts before low-priority regardless of issue number", () => {
    const issues = [
      makeIssue(1, ["status:ready", "priority:low"]),
      makeIssue(99, ["status:ready", "priority:high"]),
    ];
    const sorted = sortByPriority(issues);
    assert.equal(sorted[0].number, 99);
  });

  test("breaks ties by issue number ascending (FIFO within same priority)", () => {
    const issues = [
      makeIssue(15, ["status:ready"]),
      makeIssue(5, ["status:ready"]),
      makeIssue(10, ["status:ready"]),
    ];
    const sorted = sortByPriority(issues);
    assert.deepEqual(
      sorted.map((i) => i.number),
      [5, 10, 15],
    );
  });

  test("does not mutate the input array", () => {
    const issues = [
      makeIssue(20, ["status:ready"]),
      makeIssue(10, ["status:ready", "priority:high"]),
    ];
    const original = [...issues];
    sortByPriority(issues);
    assert.deepEqual(
      issues.map((i) => i.number),
      original.map((i) => i.number),
    );
  });

  test("single item returns unchanged", () => {
    const issues = [makeIssue(7, ["status:ready", "priority:low"])];
    const sorted = sortByPriority(issues);
    assert.equal(sorted.length, 1);
    assert.equal(sorted[0].number, 7);
  });

  test("empty array returns empty", () => {
    const sorted = sortByPriority([]);
    assert.equal(sorted.length, 0);
  });
});
