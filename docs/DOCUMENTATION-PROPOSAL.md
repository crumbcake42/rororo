# Documentation Proposal — Agent Office Template

## Problem

Agent Office is a forkable template with several interacting subsystems — dispatch orchestration, agent roles, pipeline definitions, adversarial debate, worktree isolation, daemon lifecycle, revision loops, and signal-based control flow. The existing documentation (`README.md`, `ARCHITECTURE.md`, `PITFALLS.md`, `AGENTS.md`) serves the people who built it, but leaves significant gaps for two audiences:

1. **Adopters** who need to understand what this thing does, how its pieces fit together, and how to bring it into their project.
2. **Contributors and operators** who need to understand non-obvious behaviors, failure modes, and the lessons learned building it.

The template's agentic nature compounds the problem: most of the interesting behavior is emergent from the interaction of pipelines, timeouts, signals, and revision loops — things that are hard to understand from reading source files individually.

## Proposed Document Set

Following the Diataxis framework (tutorials, how-to guides, reference, explanation), the documentation divides into four deliverables, each serving a distinct purpose.

---

### 1. System Overview — `docs/OVERVIEW.md`

**Purpose**: Explanation. Give a reader the complete mental model in one sitting.

**Audience**: Anyone evaluating or adopting the template.

**Structure**:

1. **What Agent Office is** — 2-3 paragraph summary of the concept (agentic development as a managed virtual office)
2. **System context diagram** — the template in its ecosystem (operator, GitHub, notification targets)
3. **How work flows through the system** — the happy-path data flow with a diagram:
   - Issue created → labeled with pipeline → dispatched → worktree created → agent pipeline executes → PR opened → CI quality gates → merge
4. **Agent roles and model routing** — the role table with a short explanation of the Opus/Sonnet split rationale
5. **Pipeline patterns** — what pipelines are, the 9 built-in definitions, and the 4 orchestration patterns the template uses:
   - **Sequential** (standard pipelines: architect → implementer → test-writer → reviewer)
   - **Concurrent** (parallel research forks, future parallel steps)
   - **Group Chat** (adversarial debate: architect A ↔ architect B → PM judge)
   - **Handoff** (dispatch routing: issue labels → pipeline selection → agent assignment)
6. **The dispatch loop** — a diagram showing the daemon's autonomous cycle: poll for ready tasks → dispatch → signal check → next task, with pause/resume/cancel/wind-down branches
7. **The agent process lifecycle** — a state diagram: idle → invoked → producing output → stdout closed → grace period → success/failure, with the three timeout defenses
8. **The revision loop** — a diagram showing: reviewer findings → implementer revision → confirmation review → follow-up issues
9. **Where things live** — annotated directory tree

**Diagrams** (Mermaid, inline):

| Diagram | Type | Shows |
|---|---|---|
| System context | flowchart | Template ↔ operator ↔ GitHub ↔ notifications |
| Data flow | flowchart | Issue → dispatch → worktree → agent → PR → CI → merge |
| Backend-feature pipeline | sequence | architect → implementer → test-writer → reviewer → security-reviewer handoffs |
| Adversarial debate | sequence | architect A ↔ architect B rounds → PM synthesis → user decision |
| Daemon dispatch loop | state | poll → dispatch → signal check → next task, with pause/resume/cancel/wind-down |
| Agent process lifecycle | state | idle → running → stdout closed → grace period, with timeout branches |
| Revision flow | flowchart | review findings → triage → revise / follow-up → confirmation review |

**Target length**: ~200 lines of prose + 7 diagrams.

---

### 2. Deep Dives — `docs/deep-dives/`

**Purpose**: Reference + explanation for complex subsystems that the overview can only summarize.

**Audience**: Adopters who need to customize, contributors, and operators debugging failures.

Each deep dive is a self-contained document covering one subsystem. Based on the template's current complexity, these are the subsystems that warrant dedicated treatment:

#### `docs/deep-dives/dispatch-and-pipelines.md`

The dispatch system is the template's core. Covers:
- How `dispatch.ts` assembles context for each agent (issue body, architecture docs, specs, prior step outputs)
- Pipeline step management: how steps are sequenced, how outputs chain
- The step-resume mechanism: how re-dispatch detects completed steps from commit history
- Incremental commits: `step N/M: role` format, why adversarial pipelines are excluded
- Branch push on failure: preserving completed work
- Signal checking: how pause/cancel/priority signals are consumed between steps

#### `docs/deep-dives/daemon-lifecycle.md`

The autonomous dispatch loop. Covers:
- Daemon startup, hibernation polling, and active dispatch mode
- Usage-aware wind-down: `session_budget_minutes`, `usage_threshold_pct`, `UsageBudget` interface
- Pause/resume semantics: how the daemon responds to signals
- The interaction between daemon-level control and dispatch-level control (daemon decides *which* task; dispatch manages *how* the pipeline runs)

#### `docs/deep-dives/agent-process-model.md`

How agents are invoked and managed. Covers:
- The `invokeAgent` function: spawning `claude --print` with system prompts
- Two-phase timeout: idle timer (resets on output) vs. max timer (absolute ceiling)
- The stdout-close detection and 30s grace period
- Work-detection on timeout: HEAD comparison and `git status --porcelain`
- Why the grace period kill resolves as success (the `claude --print` hang pattern)

#### `docs/deep-dives/adversarial-review.md`

The architecture-decision pipeline and revision loop. Covers:
- Adversarial debate mechanics: directives, round cap, why no early exit
- Structured findings format: `<!-- FINDINGS_START -->` markers, disposition field
- Revision flow: `revise` → implementer fix → confirmation review → `follow-up` issues
- Loop prevention: `max_revision_rounds`, why confirmation findings never trigger another revision
- Revision sub-step commit format (`revision {round}: {role}`) and why it differs from pipeline commits

**Target length**: Each deep dive ~80-120 lines. Diagrams where they clarify, not for decoration.

---

### 3. Onboarding Guide — `docs/ONBOARDING.md`

**Purpose**: Tutorial (new projects) + how-to guide (existing projects). Two separate paths in one document.

**Audience**: Developers adopting the template.

**Structure** (derived from ADOPTION-NOTES.md checklist + research findings):

#### Part A: New Project (Tutorial)

A sequential walkthrough from zero to first dispatched task. Each step includes expected output so the reader knows it worked.

1. **Prerequisites** — Claude Code, GitHub CLI, Node.js >= 20, a GitHub repo
2. **Fork and clone** — `git clone`, `npm install`, `npm run build`, `npm link`
3. **Configure secrets** — `cp .env.example .env`, which secrets are needed and when (GitHub token always; Slack/Twilio only for AFK mode)
4. **Apply a stack preset** — `office preset typescript-node`, what it populates
5. **Configure your project** — `office.config.yml` walkthrough:
   - `project_name` — set it
   - `branch_strategy` — tiered vs. simple, when to use each
   - `notification_mode` — watch vs. AFK
   - `dispatch_mode` — manual vs. daemon
6. **Create GitHub labels** — the label set the system depends on (`status:ready`, `status:blocked-human`, `pipeline:backend-feature`, etc.)
7. **Set up branch protection** — required PR reviews, required status checks, block direct pushes to main/dev/staging
8. **Describe your architecture** — fill in `ARCHITECTURE.md` with initial design
9. **First dispatch walkthrough** — create an issue, label it, mark ready, dispatch, watch it run
10. **Troubleshooting: common first-run failures** — missing token, no labels created, no dev branch, preset not applied

#### Part B: Existing Project (How-To Guide)

Task-oriented guides for people who already have a codebase. Decision-tree format: "Do you have X? → Do Y."

1. **What to bring in** — the template infrastructure vs. your code (`office/`, `.claude/`, `pipelines/`, config files → your repo; your code → `src/`)
2. **Reconciling existing CI** — how to wire template quality gates into existing CI workflows
3. **Branch strategy decisions** — if you already have branches, how to map to tiered or simple
4. **Reconciling existing tooling** — if you already have lint/test/typecheck commands, how to update `quality_gates` in config
5. **Customizing agent roles** — which roles to keep, which to skip, how to adjust model routing
6. **Customizing adversarial directives** — replacing the default simplicity-vs-extensibility tension with project-specific tensions
7. **Custom pipelines** — how to create pipeline definitions for project-specific workflows

**Target length**: Part A ~150 lines, Part B ~100 lines.

---

### 4. Lessons Learned — `docs/LESSONS-LEARNED.md`

**Purpose**: Explanation. Document the non-obvious problems and anti-patterns discovered building this template, so adopters and contributors don't repeat them.

**Audience**: Adopters, contributors, and anyone building similar agentic systems.

**How this differs from `PITFALLS.md`**: PITFALLS.md is a living operational document — terse entries of current anti-patterns, edited in place, entries removed when resolved. LESSONS-LEARNED.md is a narrative companion: fuller context, the story of discovery, and broader implications. PITFALLS.md tells you *what not to do right now*. LESSONS-LEARNED.md tells you *why we know that*.

**Entry format** (per Google SRE and anti-pattern literature):

```
## [Lesson Title]

**Discovered**: [date]  **Status**: [active / resolved / mitigated]

**What happened**: [2-3 sentences describing the failure or discovery]

**Why it's non-obvious**: [Why a reasonable person would make this mistake]

**The fix**: [What we did, or what the refactored solution looks like]

**Broader implication**: [What this means for agentic systems in general, if applicable]
```

**Initial entries** (sourced from PITFALLS.md, ARCHITECTURE.md, and project history):

1. **Wrong-consensus convergence in adversarial debate** — Two architect instances can agree on the same wrong answer. ~24% of disputed questions in research. The fix: always run to the round cap; no early exit on consensus.

2. **Append-only architecture decision logs** — ADR files grow unbounded with supersession chains. Agents must trace chains to find current truth. Stale context is actively counterproductive. The fix: living documents edited in place; decision history lives in git.

3. **Idle timeout treats completed agents as failures** — `claude --print` stays alive with stdout open after finishing work. The idle timer fires and kills the process as a failure, even when work is committed. The fix: three-tier defense (stdout-close detection, HEAD comparison, working-tree check).

4. **Step-resume and revision commit format conflict** — Revision sub-steps initially used the same `step N/M: role` commit format, which confused the resume mechanism on re-dispatch. The fix: separate format (`revision {round}: {role}`).

5. **Pipeline branch preservation on failure** — Early versions cleaned up worktrees on failure, losing all completed work. The fix: push the branch to remote before cleanup.

Additional entries should be gathered from git history and PR discussions during authoring.

**Target length**: ~150 lines, growing as new lessons are discovered.

---

## Diagram Approach

All diagrams use **Mermaid** for these reasons:
- GitHub renders Mermaid natively in markdown — no build step, no image files to maintain
- Version-controllable alongside documentation source
- Sufficient diagram types for all needs: `flowchart`, `sequenceDiagram`, `stateDiagram-v2`
- Low learning curve for contributors maintaining docs

Following the **C4 model** for structural diagrams:
- Level 1 (System Context): the template in its ecosystem
- Level 2 (Container): the dispatch system, agent pool, worktree layer, GitHub API, CLI, notifications
- Level 3 (Component): internal modules of the dispatch system (used in deep dives only)
- Level 4 (Code): not used — readers can read the source

**Diagram guidelines**:
- One concept per diagram — no "everything" diagrams
- Max ~15 nodes per diagram; split if larger
- Every diagram has a title
- Store Mermaid source inline in the markdown files, not as separate files

## Execution Approach

### Authoring sequence

1. **OVERVIEW.md first** — this establishes the mental model that all other docs reference. The diagrams created here are reused in deep dives.
2. **Deep dives second** — these expand on the overview. Writing them may surface gaps in the overview that need backfilling.
3. **ONBOARDING.md third** — this requires a stable understanding of the system (from 1 and 2) and the ADOPTION-NOTES.md checklist.
4. **LESSONS-LEARNED.md last** — this requires mining git history and PR discussions, which can happen in parallel but benefits from the context built up writing 1-3.

### Authoring method

Each document can be authored as a dispatched task (an issue with scope and acceptance criteria) using the existing template infrastructure. The `chore` pipeline (implementer → reviewer) is appropriate since these are documentation files, not feature code.

Alternatively, the overview and deep dives could be authored interactively using Claude Code with access to the full codebase and `ARCHITECTURE.md` for source-of-truth verification.

### Maintenance

Following Google's documentation best practices:
- Update docs in the same PR as code changes that affect documented behavior
- Delete outdated content rather than marking it deprecated
- Treat diagrams like code: update when the system changes
- PITFALLS.md remains the living operational doc; LESSONS-LEARNED.md is updated less frequently (when a new significant lesson is discovered)

## File Layout

```
docs/
  OVERVIEW.md                         # System overview with diagrams
  ONBOARDING.md                       # Adoption guide (new + existing projects)
  LESSONS-LEARNED.md                  # Non-obvious problems and anti-patterns
  deep-dives/
    dispatch-and-pipelines.md         # Dispatch system internals
    daemon-lifecycle.md               # Autonomous loop
    agent-process-model.md            # Agent invocation and timeout handling
    adversarial-review.md             # Debate + revision loop
```

## Sources

This proposal is informed by research into documentation best practices from:
- **Diataxis framework** (Daniele Procida) — the four documentation types and how to separate them
- **C4 model** (Simon Brown) — hierarchical architecture diagramming
- **arc42** (Starke & Hruschka) — architecture documentation structure
- **Microsoft Azure Architecture Center** — multi-agent orchestration patterns (Sequential, Concurrent, Group Chat, Handoff, Magentic)
- **Anthropic** — agent architecture taxonomy and CLAUDE.md best practices
- **Google SRE** — postmortem culture and lessons-learned documentation
- **Google Developer Documentation Style Guide** — documentation maintenance practices
- **Next.js documentation** — progressive onboarding structure
