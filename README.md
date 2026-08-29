# Agent Office

A forkable template repository that sets up agent-driven software development as a managed virtual office. You operate as lead project manager. AI agents fill distinct team roles — architect, implementer, reviewer, and more — executing work semi-independently under mechanical process controls.

You guide key decisions (architecture, domain definitions, real-world context) and review output. Agents run autonomously until they hit an information gap or reach a preset endpoint.

## Prerequisites

- [Claude Code](https://docs.anthropic.com/en/docs/claude-code) installed and authenticated
- [GitHub CLI](https://cli.github.com/) (`gh`) installed and authenticated
- [Node.js](https://nodejs.org/) >= 20.0.0
- A GitHub repository for your project

## Setup

### 1. Fork and clone

Fork this template repo, then clone your fork:

```bash
git clone https://github.com/YOUR_USERNAME/YOUR_PROJECT.git
cd YOUR_PROJECT
npm install
npm run build
npm link  # makes the `office` command available globally
```

### 2. Configure secrets

```bash
cp .env.example .env
# Edit .env with your GitHub token and optional notification credentials
```

### 3. Apply a stack preset

```bash
office preset typescript-node  # or: office preset python
```

This populates the quality gate commands in `office.config.yml` for your tech stack.

### 4. Configure your project

Edit `office.config.yml`:
- Set `project_name`
- Choose `branch_strategy`: `tiered` (feature → dev → staging → main) or `simple` (feature → main)
- Choose `notification_mode`: `watch` (terminal) or `afk` (Slack/SMS)

### 5. Describe your architecture

Fill in `ARCHITECTURE.md` with your project's initial design — components, tech stack, directory structure, integration points.

## Daily Workflow

### Morning: Check in

```bash
office standup                  # formatted status report
office standup --interactive    # conversational standup with the PM agent
```

### Dispatch work

```bash
office dispatch    # send the next ready task to an agent
office status      # see what's in progress, blocked, or ready
```

### Review output

Agents create PRs. Review them, approve or request changes. Quality gates (tests, lint, typecheck, format) run automatically in CI.

### Plan ahead

When the backlog gets thin, run the planning pipeline — the PM agent reads your architecture, decisions, and recent work to propose prioritized next tasks.

### Retrospective

Periodically run the retrospective pipeline for quantitative observations about blocked rates, review round counts, and pipeline performance.

## Agent Roles

| Role | Model | Purpose |
|---|---|---|
| PM | Opus | Dispatches work, synthesizes results, runs standups, judges debates |
| Architect | Opus | Makes and documents design decisions |
| Implementer | Sonnet | Writes code within scoped files/directories |
| Test Writer | Sonnet | Writes tests against code they did not write |
| Reviewer | Sonnet | Read-only code review |
| UX Engineer | Sonnet | Frontend implementation and UI/UX review |
| Security Reviewer | Opus | Vulnerability and auth auditing |

## Pipelines

Tasks are assigned a pipeline via GitHub Issue labels. Each pipeline defines the sequence of agent roles:

- **backend-feature**: architect → implementer → test-writer → reviewer → security-reviewer
- **frontend-feature**: architect → implementer → ux-engineer (build) → test-writer → ux-engineer (review) → reviewer
- **fullstack-feature**: architect → implementer (backend) → implementer (frontend) → ux-engineer (build) → test-writer → reviewer → security-reviewer
- **bug-fix**: implementer → test-writer → reviewer
- **refactor**: architect → implementer → test-writer → reviewer
- **architecture-decision**: architect (debate) → pm (judge) → user approval
- **chore**: implementer → reviewer
- **planning**: pm → user approval
- **retrospective**: pm → quantitative report

## Configuration

All settings live in `office.config.yml`. Secrets live in `.env` (gitignored).

See `ARCHITECTURE.md` for system design, `office/specs/` for harness specifications, `src/openspec/` for project specifications, and `PITFALLS.md` for known anti-patterns.
