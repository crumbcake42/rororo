# Agent Office — Architecture

## Overview
Agent Office is a template repository that sets up agent-driven software development as a managed virtual office. A human user operates as lead project manager. AI agents fill distinct team roles and execute work semi-independently under mechanical process controls.

## System Components

### Dispatch System (`office/src/`)
Node.js CLI application written in TypeScript. Entry point: `office/src/cli.ts`.

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
| `create.ts` | Interactive issue creation sessions |

### Script Layer (`office/src/scripts/` → `scripts/`)
Thin TypeScript entry points compiled to `office/dist/scripts/`, invoked via bash wrappers in `scripts/`. Both the skills layer and the CLI/daemon call the same underlying modules through these scripts.

### Agent Definitions (`.claude/agents/`)
Seven role-specific agent prompts with frontmatter specifying model routing and tool access:
- **pm** (Opus) — coordination, synthesis, dispatch
- **architect** (Opus) — design decisions, adversarial debate
- **implementer** (Sonnet) — code writing
- **test-writer** (Sonnet) — test authoring against code they didn't write
- **reviewer** (Sonnet) — read-only code review
- **ux-engineer** (Sonnet) — frontend implementation and UI/UX review
- **security-reviewer** (Opus) — vulnerability and auth auditing

### Skills Layer (`.claude/skills/`)
Seven interactive skills invoked via slash commands in Claude Code sessions. Each skill calls the same scripts as the CLI/daemon — two interfaces to the same mechanical substrate.

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
- The office orchestration is isolated in `office/` — `src/` is reserved for the adopting project's code.

## Directory Structure
```
agent-office/
├── office.config.yml          # toggleable settings
├── .env.example               # secrets template
├── CLAUDE.md                  # project rules for agents
├── AGENTS.md                  # cross-tool agent instructions
├── ARCHITECTURE.md            # this file
├── DECISIONS.md               # architecture decision log
├── office/                    # dispatch system (self-contained)
│   ├── src/                   # TypeScript source
│   ├── dist/                  # compiled output (gitignored)
│   ├── package.json           # office dependencies
│   └── tsconfig.json          # TypeScript config
├── src/                       # adopting project's source code
├── scripts/                   # bash wrappers → office/dist/scripts/
├── .claude/agents/            # agent role definitions
├── .claude/skills/            # interactive skill definitions
├── .github/                   # issue templates + CI workflows
├── pipelines/                 # pipeline sequence definitions
└── presets/                   # stack-specific quality gate presets
```
