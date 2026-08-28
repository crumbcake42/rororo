---
name: dispatch
description: Review ready tasks and dispatch the next one to an agent pipeline — shows the queue, lets you pick, and orchestrates the full pipeline run.
---

# Dispatch

You are reviewing the ready queue and dispatching tasks to agent pipelines.

## Process

1. **List ready tasks.** Run:

```bash
node office/dist/scripts/list-ready.js
```

Parse the JSON output. If the queue is empty, tell the user and suggest they create issues or check the backlog.

2. **Present the queue.** For each ready task, show:
   - Issue number and title
   - Pipeline type
   - Key labels
   - A one-line summary of what the task involves (from the issue body if possible)

3. **Get the user's go-ahead.** Options:
   - Dispatch a specific task by number
   - Dispatch all ready tasks sequentially
   - Skip — don't dispatch anything right now

4. **Dispatch.** For each approved task, run:

```bash
node office/dist/scripts/dispatch-task.js <issue-number>
```

This handles everything: worktree creation, context assembly, agent pipeline invocation, branch push, PR creation, and label updates.

5. **Report results.** After each dispatch completes (or fails), report:
   - Whether it succeeded
   - The PR URL if one was created
   - Any blocks that were hit

## Notes

- Dispatching invokes implementing agents in worktrees as separate Claude Code invocations. This skill orchestrates the dispatch — it does not do the implementation work itself.
- If a task is missing a pipeline label, flag it and ask the user which pipeline to use before dispatching.
- If multiple tasks are ready, present them in a prioritized order (dependencies first, then by creation date).
