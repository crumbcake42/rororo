# Documentation Handoff

Brief for each agent session working through the docs roadmap. Read your step, load its context, produce the output, and mark the step done in `docs/DOCS-ROADMAP.md`.

## Where to look

| File | Purpose |
|---|---|
| `docs/DOCS-ROADMAP.md` | Step checklist — find your step, check it off when done |
| `docs/DOCUMENTATION-PROPOSAL.md` | Full rationale, structure, diagram guidelines, entry formats |
| `ARCHITECTURE.md` | System design source of truth — verify all claims against this |
| `PITFALLS.md` | Anti-patterns to reference (especially Step 6) |
| `office.config.yml` | Configuration reference — daemon, dispatch, adversarial settings |
| `pipelines/*.yml` | All 9 pipeline definitions |
| `office/src/dispatch.ts` | Core dispatch logic, context assembly, agent invocation, revision flow |
| `office/src/daemon.ts` | Autonomous loop, usage budget, pause/resume |
| `office/src/worktree.ts` | Branch creation and cleanup |
| `office/src/review.ts` | PR review command |
| `office/specs/` | Harness specifications |
| `.claude/agents/` | Agent role definitions |

## Per-step instructions

### Step 1: System Overview (DONE)
**Output**: `docs/OVERVIEW.md` — already written. All 7 Mermaid diagrams included. Future steps should cross-reference this for consistency.

### Step 2: Dispatch & Pipelines deep dive
**Output**: `docs/deep-dives/dispatch-and-pipelines.md`
**Load**: `docs/OVERVIEW.md`, `office/src/dispatch.ts`, `office/src/worktree.ts`, `pipelines/*.yml`
**Key sections**: context assembly, pipeline step management, output chaining, step-resume from commit history, incremental commits (`step N/M: role`), adversarial exclusion, branch push on failure, signal checking between steps. Target 80-120 lines.

### Step 3: Daemon & Agent Process Model
**Output**: `docs/deep-dives/daemon-lifecycle.md` + `docs/deep-dives/agent-process-model.md`
**Load**: `docs/OVERVIEW.md`, `office/src/daemon.ts`, `office/src/dispatch.ts` (the `invokeAgent` function)
**Daemon doc**: startup, hibernation polling, active dispatch, usage-aware wind-down, pause/resume, daemon vs. dispatch control boundary.
**Agent doc**: `invokeAgent` internals, two-phase timeout (idle resets on output, max is absolute), stdout-close detection, 30s exit grace period, work-detection on timeout (HEAD comparison + porcelain check), the `claude --print` hang pattern. Target 80-120 lines each.

### Step 4: Adversarial Review deep dive
**Output**: `docs/deep-dives/adversarial-review.md`
**Load**: `docs/OVERVIEW.md`, `office/src/dispatch.ts` (revision logic + `runAdversarialDebate`), `office/src/review.ts`, `pipelines/architecture-decision.yml`, `office/specs/adversarial-review/`
**Key sections**: debate mechanics (directives, round cap, no early exit rationale), structured findings format (`<!-- FINDINGS_START -->`, disposition field), revision flow (revise → implementer fix → confirmation review → follow-up issues), loop prevention (`max_revision_rounds`, confirmation → follow-up only), commit format (`revision {round}: {role}`). Target 80-120 lines.

### Step 5: Onboarding Guide
**Output**: `docs/ONBOARDING.md`
**Load**: `docs/OVERVIEW.md`, `ADOPTION-NOTES.md`, `README.md`, `office.config.yml`, `.env.example`
**Part A (new projects)**: sequential tutorial — fork, configure, labels, branch protection, first dispatch, troubleshooting. ~150 lines.
**Part B (existing projects)**: how-to guides — what to bring in, reconciling CI, branch strategy, customizing roles/directives/pipelines. ~100 lines.
Cross-check every item in `ADOPTION-NOTES.md`.

### Step 6: Lessons Learned
**Output**: `docs/LESSONS-LEARNED.md`
**Load**: `PITFALLS.md`, `ARCHITECTURE.md`, `git log --oneline -50`, `gh pr list --state merged --limit 20`
**What to do**: expand each `PITFALLS.md` entry into narrative format (what happened, why non-obvious, the fix, broader implication). Mine git history and PR discussions for additional lessons. Use the entry format from `docs/DOCUMENTATION-PROPOSAL.md`. Target ~150 lines.

### Final Pass
After all steps complete, one session reads all docs end-to-end for consistency, verifies Mermaid rendering, confirms cross-references, and deletes this file and `DOCS-ROADMAP.md`.

## Conventions

- Diagrams: Mermaid, inline. One concept per diagram, max ~15 nodes. Every diagram has a title.
- Cross-references: link to other docs with relative paths (e.g., `[System Overview](OVERVIEW.md)`).
- Verify all technical claims against source code — don't trust prior docs blindly.
- If a step reveals gaps in an earlier doc, note them for the final pass rather than editing in-place (unless it's a factual error).
