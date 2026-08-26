# Agent Office — Architecture Decision Log

## ADR-001: Core Design Principles

**Date:** 2026-08-25
**Status:** accepted
**Context:** Designing the foundational architecture for an agent-driven development workflow. Key tension: how much control to give agents vs. how much to enforce mechanically.
**Decision:** Five core principles adopted:
1. Process infrastructure is dumb and mechanical. Intelligence goes into work units. The orchestration layer is scripts, config, and CI — not an LLM.
2. Each agent invocation is stateless and scoped. Cold agents receive a context bundle and produce output. No persistent agent memory across tasks.
3. Context is files, not memory. Shared project knowledge lives in markdown docs committed to the repo.
4. Quality gates are mechanical. Tests, linters, type checks, diff size — all enforced by CI, not agent judgment.
5. Human decision points are explicit and blocking. A task missing a required decision is mechanically blocked.
**Consequences:** Agents cannot self-organize or evolve their own process. All process changes require human modification of config/scripts. This is intentional — it prevents agent-driven process drift.

## ADR-002: GitHub Issues for Task Management

**Date:** 2026-08-25
**Status:** accepted
**Context:** Need a task management system accessible to both human users and automated dispatch scripts.
**Decision:** Use GitHub Issues with labels for state management. States: backlog, ready, in-progress, review, done, blocked-human, blocked-dependency, blocked-unclassified.
**Consequences:** Tied to GitHub ecosystem. Benefits: web UI, API access, labels/milestones, webhook support for automation, familiarity for human contributors.

## ADR-003: Seven Agent Roles with Model Routing

**Date:** 2026-08-25
**Status:** accepted
**Context:** Need to define agent specializations and which model runs each.
**Decision:** Seven roles: pm, architect, implementer, test-writer, reviewer, ux-engineer, security-reviewer. Opus for judgment-heavy roles (pm, architect, security-reviewer). Sonnet for throughput-heavy roles (implementer, test-writer, reviewer, ux-engineer).
**Consequences:** Model routing is a config-level decision, not an agent-level one. Can be overridden in office.config.yml.

## ADR-004: Adversarial Architecture Review

**Date:** 2026-08-25
**Status:** accepted
**Context:** Single-agent architecture decisions risk bias toward whatever the model's default preferences are.
**Decision:** Architecture-decision pipeline runs two architect instances with opposing directives (simplicity vs. extensibility), maximum 3 rounds, no early exit. PM judges and synthesizes. User makes final call.
**Consequences:** Slower than single-agent decisions. Forces explicit consideration of tradeoffs. Prevents wrong-consensus convergence (measured at ~24% in research).

## ADR-005: Tiered Branch Strategy as Default

**Date:** 2026-08-25
**Status:** accepted
**Context:** Need a branching model that supports both complex deployment pipelines and simple solo projects.
**Decision:** Default to tiered (feature → dev → staging → main) with a simple mode toggle (feature → main). All agent work happens in isolated git worktrees.
**Consequences:** Tiered mode adds ceremony but enables deployment gates. Simple mode available for early-stage projects. Worktree isolation prevents agents from interfering with each other.

## ADR-006: Node.js TypeScript for Dispatch System

**Date:** 2026-08-25
**Status:** accepted
**Context:** Need a language for the CLI dispatch system.
**Decision:** Node.js with TypeScript. Strict mode, ES modules.
**Consequences:** Aligns with the ecosystem most likely to be used by template forkers. TypeScript provides type safety for config parsing and API interactions.
