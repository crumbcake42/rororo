import { test, describe, mock, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import type { ReviewFinding, Pipeline } from "../src/dispatch.js";

// ---------------------------------------------------------------------------
// Module-level mock setup — must precede dynamic imports
// ---------------------------------------------------------------------------

let createIssueCalls: Array<{ title: string; body: string; labels: string[] }> =
  [];

mock.module("node:child_process", {
  namedExports: {
    execSync: () => "",
    execFileSync: () => "",
    spawn: () => {
      throw new Error("spawn should not be called in these tests");
    },
    spawnSync: () => ({ status: 0, stdout: "", stderr: "" }),
  },
});

mock.module(new URL("../src/github.js", import.meta.url).href, {
  namedExports: {
    getIssue: async () => ({}),
    setLabels: async () => {},
    listIssuesByLabel: async () => [],
    getIssueComments: async () => [],
    addComment: async () => {},
    createIssue: async (
      title: string,
      body: string,
      labels: string[],
    ) => {
      createIssueCalls.push({ title, body, labels });
      return {
        number: 100 + createIssueCalls.length,
        labels,
        title,
        html_url: "",
      };
    },
    getPR: async () => ({ number: 0, title: "", state: "open", head_branch: "", base_branch: "", html_url: "" }),
    createPR: async () => ({ html_url: "" }),
    getPipelineLabel: () => null,
    getStatusLabel: () => null,
  },
});

const { parseReviewFindings, createFollowUpIssues, buildRevisionContext, buildConfirmationContext } = await import("../src/dispatch.js");
// Verify re-export from review.ts resolves to the same function
const reviewModule = await import("../src/review.js");
const parseFromReview = reviewModule.parseReviewFindings;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FINDINGS_START = "<!-- FINDINGS_START -->";
const FINDINGS_END = "<!-- FINDINGS_END -->";

function wrap(json: string): string {
  return `Some prose.\n${FINDINGS_START}\n${json}\n${FINDINGS_END}\nMore prose.`;
}

function makeValidFinding(overrides: Partial<ReviewFinding> = {}): ReviewFinding {
  return {
    file: "src/foo.ts",
    severity: "suggestion",
    description: "A finding description",
    recommendation: "Fix it",
    disposition: "revise",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// parseReviewFindings() — exported from dispatch.ts
// ---------------------------------------------------------------------------

describe("parseReviewFindings()", () => {
  let warnMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    warnMock = mock.method(console, "warn", () => {});
  });

  afterEach(() => {
    warnMock.mock.restore();
  });

  // ---- Marker detection ----

  test("returns empty array when FINDINGS_START marker is absent", () => {
    const output = `${FINDINGS_END}\n[]`;
    const result = parseReviewFindings(output);
    assert.deepEqual(result, []);
  });

  test("returns empty array when FINDINGS_END marker is absent", () => {
    const output = `${FINDINGS_START}\n[]`;
    const result = parseReviewFindings(output);
    assert.deepEqual(result, []);
  });

  test("returns empty array when both markers are absent", () => {
    const result = parseReviewFindings("No findings block here.");
    assert.deepEqual(result, []);
  });

  test("returns empty array when END marker precedes START marker", () => {
    const output = `${FINDINGS_END}\n[]${FINDINGS_START}`;
    const result = parseReviewFindings(output);
    assert.deepEqual(result, []);
  });

  test("emits a warning when markers are absent", () => {
    parseReviewFindings("no markers");
    assert.ok(warnMock.mock.callCount() > 0, "should warn when markers are missing");
  });

  // ---- JSON parsing ----

  test("returns empty array when content between markers is not valid JSON", () => {
    const output = wrap("not { valid } json");
    const result = parseReviewFindings(output);
    assert.deepEqual(result, []);
  });

  test("emits a warning when JSON parsing fails", () => {
    parseReviewFindings(wrap("{{invalid}}"));
    assert.ok(warnMock.mock.callCount() > 0, "should warn on JSON parse failure");
  });

  test("returns empty array when parsed JSON is not an array (object)", () => {
    const output = wrap(JSON.stringify({ file: "a.ts", severity: "nit" }));
    const result = parseReviewFindings(output);
    assert.deepEqual(result, []);
  });

  test("returns empty array when parsed JSON is not an array (string)", () => {
    const output = wrap(JSON.stringify("a string"));
    const result = parseReviewFindings(output);
    assert.deepEqual(result, []);
  });

  test("returns empty array when parsed JSON is not an array (null)", () => {
    const output = wrap(JSON.stringify(null));
    const result = parseReviewFindings(output);
    assert.deepEqual(result, []);
  });

  test("emits a warning when findings block is not a JSON array", () => {
    parseReviewFindings(wrap(JSON.stringify({ not: "an array" })));
    assert.ok(warnMock.mock.callCount() > 0, "should warn when block is not an array");
  });

  // ---- Happy path: valid findings ----

  test("returns empty array for an empty findings array", () => {
    const result = parseReviewFindings(wrap("[]"));
    assert.deepEqual(result, []);
  });

  test("returns a single valid finding with all required fields", () => {
    const finding = makeValidFinding();
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "src/foo.ts");
    assert.equal(result[0].severity, "suggestion");
    assert.equal(result[0].description, "A finding description");
    assert.equal(result[0].recommendation, "Fix it");
    assert.equal(result[0].disposition, "revise");
  });

  test("preserves optional line field when present", () => {
    const finding = makeValidFinding({ line: 42 });
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result[0].line, 42);
  });

  test("finding without optional line field is still valid", () => {
    const finding = makeValidFinding();
    delete (finding as Partial<ReviewFinding>).line;
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 1);
    assert.equal(result[0].line, undefined);
  });

  // ---- Severity values ----

  test("accepts severity: blocking", () => {
    const result = parseReviewFindings(
      wrap(JSON.stringify([makeValidFinding({ severity: "blocking" })])),
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "blocking");
  });

  test("accepts severity: suggestion", () => {
    const result = parseReviewFindings(
      wrap(JSON.stringify([makeValidFinding({ severity: "suggestion" })])),
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "suggestion");
  });

  test("accepts severity: nit", () => {
    const result = parseReviewFindings(
      wrap(JSON.stringify([makeValidFinding({ severity: "nit" })])),
    );
    assert.equal(result.length, 1);
    assert.equal(result[0].severity, "nit");
  });

  test("rejects findings with an unknown severity value", () => {
    const finding = makeValidFinding({ severity: "critical" as "nit" });
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 0);
  });

  // ---- Disposition values ----

  test("accepts disposition: revise", () => {
    const result = parseReviewFindings(
      wrap(JSON.stringify([makeValidFinding({ disposition: "revise" })])),
    );
    assert.equal(result[0].disposition, "revise");
  });

  test("accepts disposition: follow-up", () => {
    const result = parseReviewFindings(
      wrap(JSON.stringify([makeValidFinding({ disposition: "follow-up" })])),
    );
    assert.equal(result[0].disposition, "follow-up");
  });

  test("accepts disposition: informational", () => {
    const result = parseReviewFindings(
      wrap(JSON.stringify([makeValidFinding({ disposition: "informational" })])),
    );
    assert.equal(result[0].disposition, "informational");
  });

  test("rejects findings with an unknown disposition value", () => {
    const finding = makeValidFinding({ disposition: "ignore" as "revise" });
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 0);
  });

  // ---- Required field validation ----

  test("rejects findings missing file field", () => {
    const finding = { ...makeValidFinding() };
    delete (finding as Partial<ReviewFinding>).file;
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 0);
  });

  test("rejects findings where file is not a string", () => {
    const finding = { ...makeValidFinding(), file: 123 };
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 0);
  });

  test("rejects findings missing description field", () => {
    const finding = { ...makeValidFinding() };
    delete (finding as Partial<ReviewFinding>).description;
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 0);
  });

  test("rejects findings missing recommendation field", () => {
    const finding = { ...makeValidFinding() };
    delete (finding as Partial<ReviewFinding>).recommendation;
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 0);
  });

  test("rejects findings missing severity field", () => {
    const finding = { ...makeValidFinding() };
    delete (finding as Partial<ReviewFinding>).severity;
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 0);
  });

  test("rejects findings missing disposition field", () => {
    const finding = { ...makeValidFinding() };
    delete (finding as Partial<ReviewFinding>).disposition;
    const result = parseReviewFindings(wrap(JSON.stringify([finding])));
    assert.equal(result.length, 0);
  });

  test("rejects null entries in the findings array", () => {
    const result = parseReviewFindings(wrap(JSON.stringify([null])));
    assert.equal(result.length, 0);
  });

  test("rejects primitive entries in the findings array", () => {
    const result = parseReviewFindings(wrap(JSON.stringify(["string", 42])));
    assert.equal(result.length, 0);
  });

  // ---- Partial filtering ----

  test("filters out invalid findings while keeping valid ones in a mixed array", () => {
    const valid = makeValidFinding();
    const invalid = { file: "a.ts", severity: "suggestion" }; // missing description, recommendation, disposition
    const result = parseReviewFindings(wrap(JSON.stringify([valid, invalid, valid])));
    assert.equal(result.length, 2);
    assert.equal(result[0].file, "src/foo.ts");
    assert.equal(result[1].file, "src/foo.ts");
  });

  // ---- Multiple valid findings ----

  test("returns multiple valid findings preserving order", () => {
    const findings = [
      makeValidFinding({ file: "a.ts", disposition: "revise" }),
      makeValidFinding({ file: "b.ts", disposition: "follow-up" }),
      makeValidFinding({ file: "c.ts", disposition: "informational" }),
    ];
    const result = parseReviewFindings(wrap(JSON.stringify(findings)));
    assert.equal(result.length, 3);
    assert.equal(result[0].file, "a.ts");
    assert.equal(result[1].file, "b.ts");
    assert.equal(result[2].file, "c.ts");
  });

  // ---- Whitespace tolerance ----

  test("trims whitespace between markers before parsing", () => {
    const finding = makeValidFinding();
    const output = `${FINDINGS_START}\n\n  ${JSON.stringify([finding])}  \n\n${FINDINGS_END}`;
    const result = parseReviewFindings(output);
    assert.equal(result.length, 1);
  });

  // ---- Marker extraction is position-based ----

  test("extracts only JSON between the markers, ignoring surrounding prose", () => {
    const finding = makeValidFinding({ file: "target.ts" });
    const output = [
      "Agent prose before the block.",
      FINDINGS_START,
      JSON.stringify([finding]),
      FINDINGS_END,
      "Agent prose after the block.",
    ].join("\n");
    const result = parseReviewFindings(output);
    assert.equal(result.length, 1);
    assert.equal(result[0].file, "target.ts");
  });
});

// ---------------------------------------------------------------------------
// parseReviewFindings() re-export from review.ts
// ---------------------------------------------------------------------------

describe("parseReviewFindings re-export from review.ts", () => {
  test("parseReviewFindings is exported from review.ts", () => {
    assert.equal(typeof parseFromReview, "function");
  });

  test("re-exported function behaves identically to the dispatch.ts original", () => {
    const finding = makeValidFinding({ file: "reexport-test.ts" });
    const output = wrap(JSON.stringify([finding]));
    const fromDispatch = parseReviewFindings(output);
    const fromReview = parseFromReview(output);
    assert.deepEqual(fromDispatch, fromReview);
  });
});

// ---------------------------------------------------------------------------
// createFollowUpIssues() — integration tests
// ---------------------------------------------------------------------------

const testIssue = {
  number: 42,
  title: "Test issue",
  body: "",
  labels: ["status:in-progress", "pipeline:backend-feature"],
  assignees: [],
  state: "open",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  html_url: "",
};

const testPipeline: Pipeline = {
  name: "backend-feature",
  description: "test pipeline",
  steps: [{ role: "implementer", description: "implement" }],
};

describe("createFollowUpIssues()", () => {
  let logMock: ReturnType<typeof mock.method>;

  beforeEach(() => {
    createIssueCalls = [];
    logMock = mock.method(console, "log", () => {});
  });

  afterEach(() => {
    logMock.mock.restore();
  });

  test("creates no issues when findings array is empty", async () => {
    await createFollowUpIssues(testIssue, [], testPipeline);
    assert.equal(createIssueCalls.length, 0);
  });

  test("creates one issue per finding", async () => {
    const findings: ReviewFinding[] = [
      makeValidFinding({ file: "a.ts", disposition: "follow-up" }),
      makeValidFinding({ file: "b.ts", disposition: "follow-up" }),
    ];
    await createFollowUpIssues(testIssue, findings, testPipeline);
    assert.equal(createIssueCalls.length, 2);
  });

  test("includes status:backlog and parent pipeline label", async () => {
    const findings: ReviewFinding[] = [
      makeValidFinding({ disposition: "follow-up" }),
    ];
    await createFollowUpIssues(testIssue, findings, testPipeline);
    assert.deepEqual(createIssueCalls[0].labels, [
      "status:backlog",
      "pipeline:backend-feature",
    ]);
  });

  test("title references parent issue number", async () => {
    const findings: ReviewFinding[] = [
      makeValidFinding({
        description: "Short desc",
        disposition: "follow-up",
      }),
    ];
    await createFollowUpIssues(testIssue, findings, testPipeline);
    assert.match(createIssueCalls[0].title, /Follow-up from #42/);
  });

  test("truncates long descriptions in title", async () => {
    const findings: ReviewFinding[] = [
      makeValidFinding({
        description: "A".repeat(100),
        disposition: "follow-up",
      }),
    ];
    await createFollowUpIssues(testIssue, findings, testPipeline);
    assert.ok(createIssueCalls[0].title.length < 100);
    assert.match(createIssueCalls[0].title, /\.\.\.$/);
  });

  test("body includes file, severity, description, and recommendation", async () => {
    const findings: ReviewFinding[] = [
      makeValidFinding({
        file: "src/target.ts",
        line: 42,
        severity: "blocking",
        description: "Must fix this",
        recommendation: "Do the thing",
        disposition: "follow-up",
      }),
    ];
    await createFollowUpIssues(testIssue, findings, testPipeline);
    const body = createIssueCalls[0].body;
    assert.match(body, /src\/target\.ts/);
    assert.match(body, /line 42/);
    assert.match(body, /blocking/);
    assert.match(body, /Must fix this/);
    assert.match(body, /Do the thing/);
  });
});

// ---------------------------------------------------------------------------
// buildRevisionContext() — context assembly tests
// ---------------------------------------------------------------------------

describe("buildRevisionContext()", () => {
  test("includes issue number and title", () => {
    const findings: ReviewFinding[] = [makeValidFinding()];
    const ctx = buildRevisionContext(testIssue, findings);
    assert.match(ctx, /#42/);
    assert.match(ctx, /Test issue/);
  });

  test("includes finding file, description, and recommendation", () => {
    const findings: ReviewFinding[] = [
      makeValidFinding({
        file: "src/important.ts",
        description: "Critical bug here",
        recommendation: "Fix the bug",
      }),
    ];
    const ctx = buildRevisionContext(testIssue, findings);
    assert.match(ctx, /src\/important\.ts/);
    assert.match(ctx, /Critical bug here/);
    assert.match(ctx, /Fix the bug/);
  });
});

// ---------------------------------------------------------------------------
// buildConfirmationContext() — context assembly tests
// ---------------------------------------------------------------------------

describe("buildConfirmationContext()", () => {
  test("includes issue number and title", () => {
    const findings: ReviewFinding[] = [makeValidFinding()];
    const ctx = buildConfirmationContext(testIssue, findings);
    assert.match(ctx, /#42/);
    assert.match(ctx, /Test issue/);
  });

  test("mentions confirmation review scope", () => {
    const findings: ReviewFinding[] = [makeValidFinding()];
    const ctx = buildConfirmationContext(testIssue, findings);
    assert.match(ctx, /confirmation/i);
  });
});
