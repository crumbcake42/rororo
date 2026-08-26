# Agent Office — Template Repo Specification

## What This Is

A forkable template repository that sets up agent-driven software development as a managed virtual office. The user operates as a lead project manager. Agents fill distinct team roles — architect, implementer, reviewer, etc. — and execute work semi-independently under mechanical process controls. The user guides key decisions (architecture, domain definitions, real-world context) and reviews output. Agents run autonomously until they hit an information gap they cannot assume or reach a preset endpoint.

This document is a complete specification. Every design decision has been made. An agent receiving this spec should be able to scaffold the entire repository without re-deriving any choices.

---

## Core Principles

1. **Process infrastructure is dumb and mechanical. Intelligence goes into work units.** The orchestration layer is scripts, config, and CI — not an LLM. Agents work within that scaffolding, they do not manage it.
2. **Each agent invocation is stateless and scoped.** Cold agents receive a context bundle (issue, relevant code, architecture docs, acceptance criteria) and produce output. No persistent agent memory across tasks.
3. **Context is files, not memory.** Shared project knowledge lives in markdown docs committed to the repo. Agents read them on start, update them as output.
4. **Quality gates are mechanical.** Tests, linters, type checks, diff size — all enforced by CI, not agent judgment.
5. **Human decision points are explicit and blocking.** A task missing a required decision is mechanically blocked. No agent decides whether it's blocked — the absence of the decision creates the block.

---

## Task Management

### System: GitHub Issues

Chosen for: web UI, API access, labels/milestones, familiarity for human contributors who may join projects later, webhook support for state-transition automation.

### Task States

Implemented as GitHub Issue labels:

| Label | Meaning |
|---|---|
| `status:backlog` | Identified but not ready for work |
| `status:ready` | Context is sufficient, can be dispatched |
| `status:in-progress` | An agent has been dispatched and is working |
| `status:review` | Work complete, awaiting human or agent review |
| `status:done` | Merged and verified |
| `status:blocked-human` | Waiting on a human decision or information |
| `status:blocked-dependency` | Waiting on another task to complete |
| `status:blocked-unclassified` | Blocked for a reason that needs triage |

### Blocking Mechanics

Three categories, each with distinct resolution:

**Human-blocked (`status:blocked-human`):**
- Agent stops work immediately.
- The blocking question is posted as a comment on the GitHub Issue.
- User is notified (mode depends on config — see Notification Modes below).
- User responds as a comment on the issue.
- A GitHub Action triggers on `issue_comment`, detects the `blocked-human` label, moves the issue to `status:ready`, and notifies the dispatch system.

**Dependency-blocked (`status:blocked-dependency`):**
- The issue includes a reference to the blocking issue (e.g., `Blocked by #14`).
- A GitHub Action triggers on PR merge, checks if any open issues reference the merged branch as a dependency, and moves them to `status:ready`.
- On the next dispatch cycle, the unblocked task is picked up.

**Unclassified (`status:blocked-unclassified`):**
- Agent encountered something unexpected and flagged it.
- Surfaced to the user for triage — user either reclassifies as human-blocked (and provides context) or resolves the issue directly.

---

## Notification Modes

Togglable via `office.config.yml` — the dispatch system reads this at runtime.

### Terminal Watch Mode (`notification_mode: watch`)
- Blocking questions print to stdout.
- Dispatch script waits for inline response or opens the GitHub Issue in the browser.
- For active working sessions where the user is present.

### AFK Mode (`notification_mode: afk`)
- Blocking questions fire a webhook to Slack (or Twilio for SMS).
- Message includes: task name, blocking question, link to the GitHub Issue.
- User responds on the GitHub Issue; the webhook-triggered GitHub Action handles the rest.

### Configuration
```yaml
notification_mode: watch  # or "afk"
afk:
  slack_webhook_url: ""   # set in .env, not committed
  twilio_sid: ""          # set in .env, not committed
  twilio_token: ""        # set in .env, not committed
  twilio_from: ""
  twilio_to: ""
```

Secrets (webhook URLs, API tokens) live in `.env` which is `.gitignore`'d. The config file references them by environment variable name.

---

## Agent Roles

Seven defined roles. Each corresponds to a markdown file in `.claude/agents/` with frontmatter specifying description, allowed tools, and model routing.

| Role | Model | Tools | Purpose |
|---|---|---|---|
| `pm` | Opus | read, write, bash | Team lead. Dispatches work, synthesizes results, runs standups, judges adversarial debates. Answers to the user. |
| `architect` | Opus | read, write | Makes and documents design decisions. Can be instantiated adversarially (two instances arguing different positions). |
| `implementer` | Sonnet | read, write, bash | Writes code. Scoped to the files/directories specified in the task. |
| `test-writer` | Sonnet | read, write, bash | Writes tests against code they did not write. Always operates after implementation. |
| `reviewer` | Sonnet | read | Code review for quality, conventions, correctness. Read-only tools to prevent "fixing" things during review. |
| `ux-engineer` | Sonnet | read, write, bash | Frontend implementation and UI/UX review. Single role covering both building and evaluating interfaces. |
| `security-reviewer` | Opus | read, bash | Vulnerability and auth auditing. Read-only with bash for running security scanning tools. |

### Model Routing Rationale
- **Opus** for roles where judgment quality matters most: PM (synthesis and coordination), architect (design decisions with long-term consequences), security reviewer (adversarial reasoning about attack surfaces).
- **Sonnet** for roles where throughput matters more: implementer (volume of code), test writer (volume of test cases), reviewer (structured evaluation), ux-engineer (implementation + evaluation).

---

## Pipelines

Pipelines define which roles participate in a task and in what order. Each pipeline is a named sequence. The dispatch script reads the pipeline type from a label on the GitHub Issue and invokes the corresponding role sequence.

### Pipeline Definitions

**`pipeline:backend-feature`**
`architect → implementer → test-writer → reviewer → security-reviewer`

**`pipeline:frontend-feature`**
`architect → implementer → ux-engineer (build) → test-writer → ux-engineer (review) → reviewer`

**`pipeline:fullstack-feature`**
`architect → implementer (backend) → implementer (frontend) → ux-engineer (build) → test-writer → reviewer → security-reviewer`

**`pipeline:bug-fix`**
`implementer → test-writer → reviewer`

**`pipeline:refactor`**
`architect → implementer → test-writer → reviewer`

**`pipeline:architecture-decision`**
`architect (instance A: argue for simplicity) → architect (instance B: argue for extensibility) → [up to 3 rounds] → pm (judge and synthesize) → user approval`

**`pipeline:chore`**
`implementer → reviewer`

**`pipeline:planning`**
`pm (reads backlog, decision log, architecture state, recent completions) → produces prioritized task proposals → user approval → approved tasks created as GitHub Issues in status:ready`

**`pipeline:retrospective`**
`pm (reads quantitative project metrics: blocked rates, review round counts, merge conflict frequency, rework rates, pipeline usage) → produces data-driven observations and questions for the user → NOT soft process reflections`

### Pipeline Assignment
Each GitHub Issue gets a `pipeline:*` label. The dispatch script reads this label to determine the role sequence. If no pipeline label is present, the task is not dispatched.

---

## Adversarial Review

Used in the `architecture-decision` pipeline and optionally invokable in other contexts.

### Structure
- Two architect instances with opposing directive prompts (e.g., "argue for the simplest viable solution" vs. "argue for the most extensible solution").
- Maximum 3 rounds of debate. No early exit on convergence — silent agreement is a known failure mode where agents can talk each other into the same wrong answer (wrong-consensus convergence occurs in ~24% of initially-disputed questions per research).
- PM agent acts as judge: reads the full debate, synthesizes a summary with tradeoffs and a proposed decision.
- The synthesis is posted to the GitHub Issue. User makes the final call.
- Once approved, the decision is logged in `DECISIONS.md` and dependent tasks unblock.

### Directive Prompts
Stored in `office.config.yml` under `adversarial.architect_directives` as an array. Default pair:
```yaml
adversarial:
  max_rounds: 3
  architect_directives:
    - "Argue for the simplest viable solution. Minimize abstraction layers, moving parts, and future flexibility that isn't needed today. Challenge any complexity that cannot be justified by a current, concrete requirement."
    - "Argue for the most extensible solution. Prioritize clean interfaces, separation of concerns, and the ability to evolve without rewrites. Challenge any shortcut that creates future technical debt."
```

---

## Branch Strategy

Togglable in `office.config.yml`.

### Tiered Mode (default): `branch_strategy: tiered`
```
feature branches → dev → staging → main
```
- Agent worktrees branch from `dev`.
- PRs target `dev`.
- Separate promotion workflows handle `dev → staging` and `staging → main`.
- Safer, more ceremony. Good for projects with deployment concerns.

### Simple Mode: `branch_strategy: simple`
```
feature branches → main
```
- Agent worktrees branch from `main`.
- PRs target `main`.
- Less ceremony. Good for early-stage projects or solo work.

### Worktree Isolation
Every dispatched agent works in its own git worktree:
```
project-root/
  .worktrees/
    feat-auth/        (branch: feat/auth)
    feat-search/      (branch: feat/search)
    fix-perf/         (branch: fix/perf)
```
- Worktrees are created by the dispatch script and cleaned up after merge.
- Agents are scoped to their worktree — CLAUDE.md rules forbid editing files outside the task's specified directories.
- Conflicts are deferred to merge time and resolved by standard git merge, in dependency order.
- `.worktrees/` is in `.gitignore`.

---

## Quality Gates

CI runs on every PR. All gates must pass before merge is allowed.

### Named Commands
Quality gates are defined as named commands mapped to shell invocations in `office.config.yml`. The CI workflow and dispatch script reference the names, not the raw commands. This makes the template stack-agnostic — swap the invocations when you fork.

```yaml
quality_gates:
  test:
    description: "Run the test suite"
    command: ""  # filled per-project
  lint:
    description: "Run the linter"
    command: ""
  typecheck:
    description: "Run type checking"
    command: ""
  format_check:
    description: "Verify code formatting"
    command: ""
```

### Stack Presets
Preset files in `presets/` that populate the quality gate commands:

**`presets/typescript-node.yml`**
```yaml
quality_gates:
  test:
    command: "npm test"
  lint:
    command: "npx eslint . --max-warnings 0"
  typecheck:
    command: "npx tsc --noEmit"
  format_check:
    command: "npx prettier --check ."
```

**`presets/python.yml`**
```yaml
quality_gates:
  test:
    command: "pytest"
  lint:
    command: "ruff check ."
  typecheck:
    command: "mypy ."
  format_check:
    command: "ruff format --check ."
```

A setup script or first-fork instruction applies a preset to `office.config.yml`.

---

## Dispatch System

### Language: Node.js (TypeScript)

### Two Phases of Development

**Phase 1: Manual CLI (built first)**
A command-line tool the user runs to dispatch work:
- `office dispatch` — reads the next `status:ready` issue, assembles context, creates a worktree, invokes Claude Code with the appropriate agent role and pipeline.
- `office status` — prints current state of all issues (what's in progress, blocked, ready, done).
- `office standup` — generates the standup report (see Standup section).
- `office standup --interactive` — opens a PM agent session for conversational standup.
- `office pause` / `office resume` — toggles the daemon state.

**Phase 2: Autonomous Daemon (built using Phase 1)**
A background process that:
- Watches for tasks in `status:ready`.
- Dispatches them automatically using the same logic as the manual CLI.
- Respects the pause/resume toggle.
- Stops on `blocked-human` and notifies.
- Resumes on dependency resolution (triggered by GitHub Actions webhooks).
- Runs until the queue is empty or paused.

Phase 2 is developed as a project managed through the Phase 1 manual dispatch — the template dogfoods itself.

### Context Assembly
When dispatching a task, the dispatch script assembles a context bundle for the agent:
1. The GitHub Issue body (task description, acceptance criteria).
2. `ARCHITECTURE.md` — current system architecture.
3. `DECISIONS.md` — log of architecture decisions.
4. Relevant source files (specified in the issue or inferred from the pipeline).
5. The agent role definition from `.claude/agents/`.
6. The `CLAUDE.md` project rules.
7. The pipeline definition (which step this agent is in, what came before, what comes after).

---

## Standup

### Report Mode (`office standup`)
A script that aggregates and formats:
- Tasks completed since last standup.
- Tasks currently in progress (and which agent/pipeline step).
- Tasks blocked (with the blocking question or dependency).
- Recent commits and PRs.
- Anything the PM agent flags as needing attention.

Output: formatted markdown printed to terminal.

### Interactive Mode (`office standup --interactive`)
Opens a Claude Code session with the PM agent, pre-loaded with the same data as the report. The user can have a conversation:
- "What's the status of the auth refactor?"
- "What decisions did the architect make on the data model?"
- "Pull in the security reviewer to explain the findings on the API endpoint."

The PM spawns relevant role agents as subagents within the session to provide detailed answers.

---

## Planning Pipeline

The PM agent:
1. Reads current backlog (all GitHub Issues).
2. Reads `DECISIONS.md` for recent architecture decisions.
3. Reads `ARCHITECTURE.md` for current system state.
4. Reads recent completion history (closed issues, merged PRs).
5. Produces a prioritized list of proposed next tasks with:
   - Task title and description.
   - Suggested pipeline type.
   - Dependencies on other tasks.
   - Rationale for prioritization.
6. User reviews, edits, approves, or rejects proposals.
7. Approved tasks are created as GitHub Issues with appropriate labels (`status:ready`, `pipeline:*`).

---

## Retrospective Pipeline

The PM agent reads quantitative signals only:
- How many tasks were blocked and in which category (human, dependency, unclassified).
- How many review rounds tasks required before passing.
- Which pipelines produced merge conflicts.
- Which agent roles generated the most rework (measured by review rejection count).
- Average time from `ready` to `done` per pipeline type.
- Token cost per pipeline type (if tracked).

Outputs **questions for the user**, not conclusions:
- "Three of the last five backend tasks were blocked on architecture decisions. Should we run the architecture-decision pipeline before dispatching backend features?"
- "The security-reviewer rejected 4 of 6 PRs on first pass. Are the implementer agent's security constraints in CLAUDE.md specific enough?"

Does NOT output soft process reflections like "the team should improve communication."

---

## Context Documents

These are markdown files committed to the repo that agents read for context and update as output.

### `ARCHITECTURE.md`
- System overview and component descriptions.
- Tech stack and key dependencies.
- Directory structure and ownership boundaries.
- Integration points and external services.
- Updated by the architect role when design decisions change the system.

### `DECISIONS.md`
Architecture Decision Log. Each entry:
```markdown
## ADR-{number}: {title}

**Date:** {date}
**Status:** accepted | superseded | deprecated
**Context:** What prompted this decision.
**Decision:** What was decided and why.
**Consequences:** Known tradeoffs and implications.
**Supersedes:** {ADR-number, if applicable}
```
- Updated by the architect role (or PM after adversarial debate resolution).
- Agents read this before making implementation choices to ensure consistency.

### `CLAUDE.md`
Project-level rules for all Claude Code agents:
- Build, test, lint, and format commands.
- Code conventions and style rules.
- File ownership boundaries (which directories each task may modify).
- Commit message format.
- What not to do (e.g., don't modify shared config files, don't install new dependencies without approval).

### `AGENTS.md`
Cross-tool agent instructions (for non-Claude-Code tools). Imported by `CLAUDE.md` via `@AGENTS.md` on the first line so both files are loaded.

---

## File Structure

```
agent-office/                          # template repo root
├── office.config.yml                  # all toggleable settings
├── .env.example                       # template for secrets
├── .gitignore
├── CLAUDE.md                          # project rules for Claude Code
├── AGENTS.md                          # cross-tool agent instructions
├── ARCHITECTURE.md                    # system architecture (starts as template)
├── DECISIONS.md                       # architecture decision log (starts empty)
├── README.md                          # onboarding guide
│
├── .claude/
│   └── agents/
│       ├── pm.md
│       ├── architect.md
│       ├── implementer.md
│       ├── test-writer.md
│       ├── reviewer.md
│       ├── ux-engineer.md
│       └── security-reviewer.md
│
├── .github/
│   ├── ISSUE_TEMPLATE/
│   │   ├── backend-feature.md
│   │   ├── frontend-feature.md
│   │   ├── fullstack-feature.md
│   │   ├── bug-fix.md
│   │   ├── refactor.md
│   │   ├── architecture-decision.md
│   │   └── chore.md
│   └── workflows/
│       ├── quality-gates.yml          # CI: runs tests, lint, typecheck, format on PR
│       ├── dependency-unblock.yml     # on PR merge: unblock dependent issues
│       ├── human-unblock.yml          # on issue_comment: unblock human-blocked issues
│       └── promote.yml                # tiered mode: dev → staging → main promotion
│
├── presets/
│   ├── typescript-node.yml
│   └── python.yml
│
├── pipelines/
│   ├── backend-feature.yml
│   ├── frontend-feature.yml
│   ├── fullstack-feature.yml
│   ├── bug-fix.yml
│   ├── refactor.yml
│   ├── architecture-decision.yml
│   ├── chore.yml
│   ├── planning.yml
│   └── retrospective.yml
│
├── src/                               # dispatch system source
│   ├── cli.ts                         # CLI entry point (office command)
│   ├── dispatch.ts                    # context assembly and agent invocation
│   ├── status.ts                      # issue state aggregation
│   ├── standup.ts                     # standup report generation
│   ├── config.ts                      # reads office.config.yml
│   ├── github.ts                      # GitHub API interactions (Octokit)
│   ├── worktree.ts                    # git worktree creation/cleanup
│   ├── notify.ts                      # notification routing (terminal/slack/sms)
│   └── daemon.ts                      # Phase 2: autonomous dispatch loop
│
├── package.json
└── tsconfig.json
```

---

## Configuration File: `office.config.yml`

```yaml
# Agent Office Configuration
# This file controls all toggleable settings for the dispatch system.

# --- Project Identity ---
project_name: ""  # filled at fork time

# --- Branch Strategy ---
# "tiered" (feature → dev → staging → main) or "simple" (feature → main)
branch_strategy: tiered

# --- Notification Mode ---
# "watch" (terminal output, blocking) or "afk" (slack/sms webhook)
notification_mode: watch

# AFK notification settings (secrets in .env)
afk:
  slack_webhook_url: "${SLACK_WEBHOOK_URL}"
  twilio_sid: "${TWILIO_SID}"
  twilio_token: "${TWILIO_TOKEN}"
  twilio_from: "${TWILIO_FROM}"
  twilio_to: "${TWILIO_TO}"

# --- Dispatch ---
# "manual" (CLI-triggered) or "daemon" (background auto-dispatch)
dispatch_mode: manual

# --- Model Routing ---
models:
  opus: "claude-opus-4-6"      # PM, architect, security-reviewer
  sonnet: "claude-sonnet-4-6"  # implementer, test-writer, reviewer, ux-engineer

# --- Quality Gates ---
# Named commands mapped to shell invocations. CI and dispatch reference the names.
# Apply a preset or fill manually at fork time.
quality_gates:
  test:
    description: "Run the test suite"
    command: ""
  lint:
    description: "Run the linter"
    command: ""
  typecheck:
    description: "Run type checking"
    command: ""
  format_check:
    description: "Verify code formatting"
    command: ""

# --- Adversarial Review ---
adversarial:
  max_rounds: 3
  architect_directives:
    - "Argue for the simplest viable solution. Minimize abstraction layers, moving parts, and future flexibility that isn't needed today. Challenge any complexity that cannot be justified by a current, concrete requirement."
    - "Argue for the most extensible solution. Prioritize clean interfaces, separation of concerns, and the ability to evolve without rewrites. Challenge any shortcut that creates future technical debt."

# --- Standup ---
standup:
  # What to include in the standup report
  include_completed: true
  include_in_progress: true
  include_blocked: true
  include_recent_commits: true
  include_pm_flags: true
```

---

## GitHub Issue Templates

Each template pre-applies the correct pipeline label and includes structured fields.

Example template (`backend-feature.md`):
```markdown
---
name: Backend Feature
about: A new backend feature or capability
labels: ["status:backlog", "pipeline:backend-feature"]
---

## Description
<!-- What this feature does and why it's needed -->

## Acceptance Criteria
<!-- Specific, testable conditions that must be true when this is done -->
- [ ] ...

## Scope
<!-- Which files/directories this task may modify -->
- `src/...`

## Dependencies
<!-- Other issues that must be completed first -->
- Blocked by #...

## Architecture Decisions Required
<!-- List any decisions that must be in DECISIONS.md before implementation -->
- ...

## Additional Context
<!-- Anything else the implementing agent needs to know -->
```

---

## Onboarding (README.md Content)

The README covers:

1. **What this is** — one paragraph explaining the office metaphor and what you get.
2. **Prerequisites** — Claude Code installed and authenticated, GitHub CLI, Node.js.
3. **Fork and configure:**
   - Fork the repo.
   - Copy `.env.example` to `.env` and fill in secrets.
   - Apply a stack preset: `office preset typescript-node` (or `python`).
   - Set `project_name` in `office.config.yml`.
   - Fill in `ARCHITECTURE.md` with your project's initial design.
4. **First run:**
   - Create your first issue using a template.
   - Run `office dispatch` to send it to an agent.
   - Run `office status` to watch progress.
   - Run `office standup` for a summary.
5. **Daily workflow:**
   - Morning: `office standup` or `office standup --interactive`.
   - Dispatch: `office dispatch` (manual) or `office resume` (daemon).
   - Review: check PRs, approve or request changes.
   - Plan: run the planning pipeline when the backlog gets thin.
   - Retro: run the retrospective pipeline periodically.
6. **Reference:** links to `ARCHITECTURE.md`, `DECISIONS.md`, config options, pipeline definitions.

---

## Implementation Task Breakdown

These are the tasks to scaffold the template repo, in recommended implementation order. Each is scoped to be a single work unit.

### Phase 0: Foundation
1. Initialize the repo with `package.json`, `tsconfig.json`, `.gitignore`, `.env.example`.
2. Create `office.config.yml` with all settings and defaults.
3. Create `CLAUDE.md` with project rules for the template repo itself.
4. Create `AGENTS.md` with cross-tool instructions.
5. Create `ARCHITECTURE.md` describing the template's own architecture (this document, condensed).
6. Create `DECISIONS.md` with ADR-001 documenting the key design decisions from this spec.
7. Create `README.md` with onboarding instructions.

### Phase 1: Agent Definitions
8. Create `.claude/agents/pm.md`.
9. Create `.claude/agents/architect.md`.
10. Create `.claude/agents/implementer.md`.
11. Create `.claude/agents/test-writer.md`.
12. Create `.claude/agents/reviewer.md`.
13. Create `.claude/agents/ux-engineer.md`.
14. Create `.claude/agents/security-reviewer.md`.

### Phase 2: Pipeline Definitions
15. Create `pipelines/backend-feature.yml`.
16. Create `pipelines/frontend-feature.yml`.
17. Create `pipelines/fullstack-feature.yml`.
18. Create `pipelines/bug-fix.yml`.
19. Create `pipelines/refactor.yml`.
20. Create `pipelines/architecture-decision.yml`.
21. Create `pipelines/chore.yml`.
22. Create `pipelines/planning.yml`.
23. Create `pipelines/retrospective.yml`.

### Phase 3: GitHub Integration
24. Create all GitHub Issue templates in `.github/ISSUE_TEMPLATE/`.
25. Create `.github/workflows/quality-gates.yml`.
26. Create `.github/workflows/dependency-unblock.yml`.
27. Create `.github/workflows/human-unblock.yml`.
28. Create `.github/workflows/promote.yml` (tiered branch promotion).

### Phase 4: Stack Presets
29. Create `presets/typescript-node.yml`.
30. Create `presets/python.yml`.
31. Create the `office preset` CLI command that applies a preset to `office.config.yml`.

### Phase 5: Core Dispatch System
32. `src/config.ts` — reads and validates `office.config.yml`.
33. `src/github.ts` — GitHub API wrapper (list issues by label, create/update issues, read comments, manage labels).
34. `src/worktree.ts` — create/cleanup git worktrees, branch naming.
35. `src/notify.ts` — notification routing (terminal print, Slack webhook, Twilio SMS).
36. `src/dispatch.ts` — context assembly, agent invocation via Claude Code CLI, pipeline step management.
37. `src/status.ts` — aggregate issue states, format status output.
38. `src/standup.ts` — standup report generation, interactive mode launch.
39. `src/cli.ts` — CLI entry point, command routing (`dispatch`, `status`, `standup`, `pause`, `resume`, `preset`).

### Phase 6: Daemon (built using Phase 5)
40. `src/daemon.ts` — background dispatch loop, pause/resume state, queue watching, graceful shutdown.
41. Add `office start` and `office stop` commands to CLI.

### Phase 7: Validation
42. Use the template to manage a small real project (the daemon development itself qualifies).
43. Run a full planning pipeline.
44. Run a retrospective pipeline and verify it produces quantitative observations.
