# Documentation Roadmap

Tracking file for the docs branch. Delete when all steps are complete.

Reference: `docs/DOCUMENTATION-PROPOSAL.md`

---

## Step 1: System Overview

**Output**: `docs/OVERVIEW.md`

**Context to load**: `ARCHITECTURE.md`, `README.md`, `office.config.yml`, `pipelines/*.yml`, `office/src/dispatch.ts`, `office/src/daemon.ts`

**What to do**:
- Write the full system overview with all 7 Mermaid diagrams
- System context, data flow, pipeline sequence, adversarial debate, daemon loop, agent lifecycle, revision flow
- This is the foundation every other doc references — get the mental model right first
- Target ~200 lines of prose + diagrams

**Done**: [ ]

---

## Step 2: Deep Dive — Dispatch & Pipelines

**Output**: `docs/deep-dives/dispatch-and-pipelines.md`

**Context to load**: `docs/OVERVIEW.md` (for consistency), `office/src/dispatch.ts`, `office/src/worktree.ts`, `pipelines/*.yml`

**What to do**:
- Context assembly for agents (issue body, arch docs, specs, prior step outputs)
- Pipeline step management and output chaining
- Step-resume mechanism (detecting completed steps from commit history)
- Incremental commits (`step N/M: role`), adversarial exclusion
- Branch push on failure
- Signal checking between steps
- Target ~80-120 lines

**Done**: [ ]

---

## Step 3: Deep Dive — Daemon & Agent Process Model

**Output**: `docs/deep-dives/daemon-lifecycle.md` + `docs/deep-dives/agent-process-model.md`

**Context to load**: `docs/OVERVIEW.md`, `office/src/daemon.ts`, `office/src/dispatch.ts` (specifically `invokeAgent`), `office.config.yml`

**What to do**:
- **daemon-lifecycle.md**: startup, hibernation polling, active dispatch, usage-aware wind-down, pause/resume semantics, daemon vs. dispatch control boundary
- **agent-process-model.md**: `invokeAgent` function, two-phase timeout, stdout-close detection, grace period, work-detection on timeout (HEAD comparison + `git status --porcelain`), the `claude --print` hang pattern
- These share source context so they pair well in one session
- Target ~80-120 lines each

**Done**: [ ]

---

## Step 4: Deep Dive — Adversarial Review

**Output**: `docs/deep-dives/adversarial-review.md`

**Context to load**: `docs/OVERVIEW.md`, `office/src/dispatch.ts` (revision logic), `office/src/review.ts`, `pipelines/architecture-decision.yml`, `office/specs/adversarial-review/`

**What to do**:
- Adversarial debate mechanics: directives, round cap, no early exit rationale
- Structured findings format: `<!-- FINDINGS_START -->` markers, disposition field
- Revision flow: revise → implementer fix → confirmation review → follow-up issues
- Loop prevention: `max_revision_rounds`, confirmation findings → follow-up only
- Revision commit format (`revision {round}: {role}`) vs. pipeline commits
- Target ~80-120 lines

**Done**: [ ]

---

## Step 5: Onboarding Guide

**Output**: `docs/ONBOARDING.md`

**Context to load**: `docs/OVERVIEW.md`, `ADOPTION-NOTES.md`, `README.md`, `office.config.yml`, `.env.example`

**What to do**:
- **Part A (new projects)**: sequential tutorial from zero to first dispatch — fork, configure, labels, branch protection, first issue, first dispatch, troubleshooting
- **Part B (existing projects)**: how-to guides — what to bring in, reconciling CI, branch strategy decisions, customizing roles/directives/pipelines
- Cross-check every item in ADOPTION-NOTES.md is covered
- Target ~150 lines (Part A) + ~100 lines (Part B)

**Done**: [ ]

---

## Step 6: Lessons Learned

**Output**: `docs/LESSONS-LEARNED.md`

**Context to load**: `PITFALLS.md`, `ARCHITECTURE.md`, `git log --oneline -50`, PR history (`gh pr list --state merged --limit 20`)

**What to do**:
- Expand each PITFALLS.md entry into the full narrative format (what happened, why it's non-obvious, the fix, broader implication)
- Mine git history and PR discussions for additional lessons not yet in PITFALLS.md
- Structured entries per the proposal format
- Target ~150 lines

**Done**: [ ]

---

## Final Pass

After all docs are written:
- [ ] Read through all docs end-to-end for consistency
- [ ] Verify all Mermaid diagrams render correctly on GitHub
- [ ] Confirm cross-references between docs are accurate
- [ ] Remove `ADOPTION-NOTES.md` (superseded by `ONBOARDING.md`) or keep as planning artifact
- [ ] Delete this file
