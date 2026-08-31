# PR Review

Agentic PR review focused on semantic correctness. Triggered manually via CLI or GitHub Action — never automatic.

## CLI Command

### Scenario: Review a PR by number
- GIVEN `office review <PR#>` is invoked
- WHEN the PR exists and is open
- THEN the system fetches the diff, assembles context, invokes the reviewer agent, and prints findings to terminal

### Scenario: PR not found or closed
- GIVEN `office review <PR#>` is invoked
- WHEN the PR does not exist or is not open
- THEN the command exits with an error message

### Scenario: Post findings as PR comment
- GIVEN `office review <PR#> --comment` is invoked
- WHEN the reviewer agent produces findings
- THEN the findings are posted as a comment on the PR in addition to being printed to terminal

## Context Assembly

### Scenario: Diff and changed files
- GIVEN a PR is being reviewed
- WHEN the system assembles context
- THEN it fetches the PR's head and base branches, runs `git diff origin/<base>...origin/<head>`, and reads the full contents of changed files from the head ref

### Scenario: System documents included
- GIVEN a PR is being reviewed
- WHEN the system assembles context
- THEN it includes ARCHITECTURE.md, PITFALLS.md, and relevant specs from `office/specs/`

### Scenario: Semantic review focus
- GIVEN context is assembled for the reviewer agent
- WHEN the context prompt is constructed
- THEN it includes instructions to focus on: field/type naming consistency across modules, import/export mismatches, tests asserting against a different API than the implementation, dead code from merge conflict resolution, and contradictions with ARCHITECTURE.md or specs

## Agent Invocation

### Scenario: Reviewer agent model selection
- GIVEN the reviewer agent is invoked
- WHEN the model is selected
- THEN it uses `getModelForRole(config, "reviewer")` from the config system

### Scenario: Reviewer agent invocation
- GIVEN context is assembled
- WHEN the reviewer agent is invoked
- THEN it uses the same `invokeAgent` function as the dispatch system with `captureOutput: true`, running from the project root (no worktree needed — review is read-only)

## GitHub Action

### Scenario: Manual trigger via workflow_dispatch
- GIVEN the `review.yml` workflow exists
- WHEN a user triggers it with a `pr_number` input
- THEN it checks out the repo, installs dependencies, builds office, and runs `office review <PR#> --comment`

### Scenario: Action requirements
- GIVEN the review action runs
- WHEN it invokes the reviewer agent
- THEN it requires `ANTHROPIC_API_KEY` as a repository secret and `GITHUB_TOKEN` (provided automatically by GitHub Actions)

## Structured Review Output

### Scenario: Reviewer outputs structured findings
- GIVEN a reviewer agent is invoked (via `office review` or as a pipeline step)
- WHEN the reviewer produces findings
- THEN it outputs prose review AND a JSON findings block between `<!-- FINDINGS_START -->` and `<!-- FINDINGS_END -->` markers

### Scenario: Finding structure
- GIVEN the reviewer produces structured findings
- WHEN each finding is serialized
- THEN it includes: `file` (string, path), `line` (optional number), `severity` (`blocking` | `suggestion` | `nit`), `description` (string), `recommendation` (string), and `disposition` (`revise` | `follow-up` | `informational`)

### Scenario: Disposition classification
- GIVEN the reviewer produces a finding
- WHEN it classifies the disposition
- THEN `revise` is used for small, mechanically fixable items on the current branch (add a test, rename a variable, fix a typo), `follow-up` for larger items requiring separate planning (architectural changes, new features, cross-cutting refactors), and `informational` for observations requiring no action

### Scenario: No actionable findings
- GIVEN the reviewer finds no issues (full approval)
- WHEN it outputs the findings block
- THEN the JSON array is empty and the prose indicates approval

### Scenario: Parsing structured findings
- GIVEN reviewer output contains `<!-- FINDINGS_START -->` and `<!-- FINDINGS_END -->` markers
- WHEN the dispatch system or review module parses the output
- THEN it extracts the JSON array between the markers, validates required fields (`file`, `severity`, `description`, `recommendation`, `disposition`), and returns typed `ReviewFinding` objects

### Scenario: Missing or malformed findings block
- GIVEN reviewer output does not contain valid findings markers or the JSON is malformed
- WHEN the parser attempts extraction
- THEN it returns an empty findings array and logs a warning — the pipeline proceeds without revision

## Constraints
- Manual trigger only — no automatic trigger on push or PR open (cost control).
- Semantic review focus is in the context prompt. The reviewer agent definition includes instructions for structured output format.
- No worktree created for `office review` — it operates on remote refs via `git diff`.
- `invokeAgent` is reused from `dispatch.ts` (exported), not duplicated.
- Review context assembly is independent from dispatch context assembly — no shared extraction.
- `parseReviewFindings` is exported from `review.ts` for use by both the review command and the dispatch pipeline loop.
