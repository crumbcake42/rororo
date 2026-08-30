---
name: plan
description: Run a planning session — review the backlog, propose prioritized next tasks, discuss with the user, and create approved issues.
---

# Plan

You are running an interactive planning session.

## Process

1. **Gather current state.** Run these to understand where things stand:

```bash
node office/dist/scripts/project-status.js
node office/dist/scripts/list-ready.js
```

Also read:
- `ARCHITECTURE.md` — current system design
- `office/specs/` — existing requirements and specifications
- `PITFALLS.md` — known anti-patterns to avoid
- Recent completion history: `gh issue list --state closed --limit 10 --json number,title,labels`

2. **Present the current picture.** Briefly summarize:
   - What's been completed recently
   - What's in flight
   - What's blocked
   - What's in the backlog but not ready
   - Any gaps or imbalances (e.g., all backend work, no tests, no architecture decisions for new features)

3. **Propose next tasks.** Based on the state, propose a prioritized set of tasks with rationale:
   - What should be worked on next and why
   - Dependencies between proposed tasks
   - Pipeline type for each
   - Rough scope estimate

4. **Discuss with the user.** Iterate:
   - Adjust priorities based on user input
   - Add or remove items
   - Refine scope and acceptance criteria
   - Resolve any architecture questions that come up

5. **Create approved tasks.** For each task the user approves, run:

```bash
node office/dist/scripts/create-issue.js "<title>" "<body>" "status:ready,pipeline:<pipeline-name>"
```

Use `status:ready` for tasks with no unmet dependencies. Use `status:backlog` for tasks that depend on other work completing first.

6. **Summarize the plan.** Recap what was created, the dispatch order, and any open questions.

## Notes

- Planning is a conversation, not a monologue. Propose, then listen.
- Don't create issues without user approval. Draft them, present them, then create on go-ahead.
- If the user has a specific idea they want to explore, follow their lead — don't force a full backlog review.
- Consider the pipeline types carefully: features that need architecture decisions should go through `architecture-decision` first.
