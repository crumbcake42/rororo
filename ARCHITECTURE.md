# Agent Office — Architecture

## Overview
Agent Office is a template repository that sets up agent-driven software development as a managed virtual office. A human user operates as lead project manager. AI agents fill distinct team roles and execute work semi-independently under mechanical process controls.

## System Components

### Dispatch System (`src/`)
Node.js CLI application written in TypeScript. Entry point: `src/cli.ts`.

| Module | Responsibility |
|---|---|
| `cli.ts` | Command routing — `dispatch`, `status`, `standup`, `pause`, `resume`, `preset` |
| `config.ts` | Reads and validates `office.config.yml` |
| `github.ts` | GitHub API wrapper via Octokit — issues, labels, comments |
| `worktree.ts` | Git worktree creation, cleanup, branch naming |
| `dispatch.ts` | Context assembly, agent invocation, pipeline step management |
| `status.ts` | Issue state aggregation and formatting |
| `standup.ts` | Standup report generation and interactive mode |
| `notify.ts` | Notification routing — terminal, Slack webhook, Twilio SMS |
| `daemon.ts` | Phase 2: autonomous dispatch loop with pause/resume |

### Agent Definitions (`.claude/agents/`)
Seven role-specific agent prompts with frontmatter specifying model routing and tool access:
- **pm** (Opus) — coordination, synthesis, dispatch
- **architect** (Opus) — design decisions, adversarial debate
- **implementer** (Sonnet) — code writing
- **test-writer** (Sonnet) — test authoring against code they didn't write
- **reviewer** (Sonnet) — read-only code review
- **ux-engineer** (Sonnet) — frontend implementation and UI/UX review
- **security-reviewer** (Opus) — vulnerability and auth auditing

### Pipeline Definitions (`pipelines/`)
YAML files defining role sequences for each task type. The dispatch system reads the pipeline label from a GitHub Issue and executes the corresponding role sequence.

### GitHub Integration (`.github/`)
- **Issue Templates** — structured task creation with pre-applied labels
- **Workflows** — CI quality gates, dependency unblocking, human-decision unblocking, branch promotion

### Configuration
- `office.config.yml` — all toggleable settings (branch strategy, notification mode, model routing, quality gates, adversarial review config)
- `.env` — secrets (gitignored)
- `presets/` — stack-specific quality gate commands

## Key Design Decisions
See `DECISIONS.md` for the full log. Core choices:
- Process infrastructure is mechanical (scripts, CI). Intelligence goes into agents.
- Each agent invocation is stateless and scoped. No persistent agent memory.
- Context is files, not memory. Shared knowledge lives in committed markdown.
- Quality gates are CI-enforced, not agent-judged.
- Human decision points are explicit and blocking.

## Directory Structure
```
agent-office/
├── office.config.yml          # toggleable settings
├── .env.example               # secrets template
├── CLAUDE.md                  # project rules for agents
├── AGENTS.md                  # cross-tool agent instructions
├── ARCHITECTURE.md            # this file
├── DECISIONS.md               # architecture decision log
├── .claude/agents/            # agent role definitions
├── .github/                   # issue templates + CI workflows
├── pipelines/                 # pipeline sequence definitions
├── presets/                   # stack-specific quality gate presets
└── src/                       # dispatch system source (TypeScript)
```
