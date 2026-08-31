# Architecture

## Stack & Dependencies
Node.js 22, TypeScript 5.5 strict, ES modules.
GitHub API via Octokit. No database.
OpenSpec for specification management.

## Module Map

### Dispatch System (`office/src/`)

| Module | Responsibility |
|---|---|
| `cli.ts` | Command routing — `dispatch`, `status`, `standup`, `pause`, `resume`, `cancel`, `preset`, `review` |
| `config.ts` | Reads and validates `office.config.yml` |
| `github.ts` | GitHub API wrapper — issues, labels, comments |
| `worktree.ts` | Git worktree creation, cleanup, branch naming |
| `dispatch.ts` | Context assembly, agent invocation, pipeline step management, signal checking |
| `status.ts` | Issue state aggregation and formatting |
| `standup.ts` | Standup report generation and interactive mode |
| `notify.ts` | Notification routing — terminal, Slack webhook, Twilio SMS |
| `daemon.ts` | Autonomous dispatch loop with pause/resume, usage budget tracking, and lifecycle notifications |
| `create.ts` | Interactive issue creation sessions |
| `review.ts` | PR review — diff assembly, context building, reviewer agent invocation |

### Script Layer (`office/src/scripts/` → `scripts/`)
Thin TypeScript entry points compiled to `office/dist/scripts/`, invoked via bash wrappers in `scripts/`.

### Agent Roles (`.claude/agents/`)

| Role | Model | Purpose |
|---|---|---|
| pm | Opus | Coordination, synthesis, dispatch, debate judging |
| architect | Opus | Design decisions, adversarial debate |
| implementer | Sonnet | Code writing |
| test-writer | Sonnet | Test authoring against code they didn't write |
| reviewer | Sonnet | Read-only code review |
| ux-engineer | Sonnet | Frontend implementation and UI/UX review |
| security-reviewer | Opus | Vulnerability and auth auditing |

Model routing rationale: Opus for judgment-critical roles, Sonnet for throughput roles. Overridable in `office.config.yml`.

## Data Flow
Issue (GitHub) → dispatch → worktree + agent → PR → quality gates (CI) → merge
PR (GitHub) → review → diff + context assembly → reviewer agent → findings (terminal / PR comment)

## Pipeline Resilience
Each pipeline step's changes are committed to the worktree branch after the agent completes, using the message format `step N/M: role`. Steps that produce no file changes get no commit. On pipeline failure, the branch is pushed to the remote before worktree cleanup, preserving all completed work. On re-dispatch of a failed pipeline, the system detects completed steps from the commit history on the existing remote branch and resumes from the first incomplete step.

Adversarial pipelines are excluded from incremental commits — they produce debate transcripts posted to the issue, not code changes, so the resume mechanism doesn't apply.

## Pipeline Control
Pipelines can be paused, cancelled, or prioritized at the step boundary (between agent invocations).

**Signal mechanism.** CLI commands write JSON signal files (`.office-signal-<issue>.json`, gitignored) to the project root. The dispatch loop checks for signals after each step completes and before invoking the next agent. Signals are consumed (deleted) on read.

**Cancel** (`office cancel <issue>`): finishes current step, commits+pushes completed work, labels issue `status:blocked-unclassified`, comments with cancellation context, cleans up worktree.

**Pause** (`office pause <issue>`): finishes current step, commits+pushes completed work, labels issue `status:paused`, comments with pause point. Resume via `office resume <issue>` re-dispatches using the existing step-resume mechanism.

**Priority** (`office dispatch <issue> --priority high|low`): adds `priority:high` or `priority:low` label. The daemon sorts ready issues by priority (high → normal → low) before picking the next task. Issues without a priority label are treated as normal.

**Usage-aware wind-down.** The daemon tracks cumulative wall-clock agent time across the session. Between steps and between dispatches, it checks if `agentTimeElapsed / sessionBudget >= usageThresholdPct / 100`. On threshold breach: finish current step, commit+push, label issue `status:paused`, notify with wind-down reason, and pause the daemon. Config: `daemon.session_budget_minutes` (default: unlimited) and `daemon.usage_threshold_pct` (default: 80). The `UsageBudget` interface is passed from daemon to dispatch to keep budget tracking centralized.

## Branch Strategy
Configurable in `office.config.yml`:
- **Tiered** (default): feature → dev → staging → main. Agent worktrees branch from dev.
- **Simple**: feature → main. For early-stage projects.

All agent work happens in isolated git worktrees under `.worktrees/` (gitignored).

## Constraints
- Process infrastructure is mechanical (scripts, CI). Intelligence goes into agents.
- Each agent invocation is stateless and scoped. No persistent agent memory.
- Context is files, not memory. Shared knowledge lives in committed markdown (`office/specs/` for harness, `src/openspec/` for project).
- Quality gates are CI-enforced, not agent-judged.
- Human decision points are explicit and blocking.
- The office orchestration is isolated in `office/`; `src/` is reserved for the adopting project's code.

## Directory Structure
```
project-root/
├── office.config.yml          # toggleable settings
├── CLAUDE.md / AGENTS.md      # agent rules
├── ARCHITECTURE.md            # this file (living, edited in place)
├── PITFALLS.md                # non-obvious anti-patterns
├── office/specs/              # harness specs (task-mgmt, dispatch, adversarial review)
├── src/openspec/              # adopting project's OpenSpec specs
├── office/                    # dispatch system (self-contained)
├── src/                       # adopting project's source code
├── scripts/                   # bash wrappers
├── .claude/agents/            # agent role definitions
├── pipelines/                 # pipeline sequence definitions
└── presets/                   # stack-specific quality gate presets
```
