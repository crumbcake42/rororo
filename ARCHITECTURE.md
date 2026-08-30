# Architecture

## Stack & Dependencies
Node.js 22, TypeScript 5.5 strict, ES modules.
GitHub API via Octokit. No database.
OpenSpec for specification management.

## Module Map

### Dispatch System (`office/src/`)

| Module | Responsibility |
|---|---|
| `cli.ts` | Command routing — `dispatch`, `status`, `standup`, `pause`, `resume`, `preset`, `review` |
| `config.ts` | Reads and validates `office.config.yml` |
| `github.ts` | GitHub API wrapper — issues, labels, comments |
| `worktree.ts` | Git worktree creation, cleanup, branch naming |
| `dispatch.ts` | Context assembly, agent invocation, pipeline step management |
| `status.ts` | Issue state aggregation and formatting |
| `standup.ts` | Standup report generation and interactive mode |
| `notify.ts` | Notification routing — terminal, Slack webhook, Twilio SMS |
| `daemon.ts` | Autonomous dispatch loop with pause/resume and lifecycle notifications |
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
