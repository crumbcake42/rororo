---
name: standup
description: Run the morning standup — gathers completed work, in-progress tasks, blockers, recent commits/PRs, and the ready queue, then discusses interactively.
---

# Standup

You are running an interactive standup session.

## Process

1. **Gather data.** Run:

```bash
node office/dist/scripts/standup-report.js
```

Parse the JSON output.

2. **Present the report conversationally.** Don't dump raw JSON. Structure it as a natural standup:
   - **What got done** — completed tasks and merged PRs
   - **What's in progress** — active tasks and open PRs
   - **What's blocked** — blocked tasks with the reason (human input needed, dependency, unclassified)
   - **What's next** — the ready queue, what's lined up for dispatch
   - **Recent activity** — notable commits in the last 24 hours

   Highlight anything that needs attention: long-blocked items, items with no recent activity, a growing backlog.

3. **Be ready to drill in.** The user will ask follow-up questions. Answer from the data, or read the relevant files:
   - Specific task details → read the GitHub Issue via `gh issue view <number>`
   - Architecture questions → read `ARCHITECTURE.md`
   - Decision history → read `DECISIONS.md`
   - Agent role details → read `.claude/agents/<role>.md`

4. **Offer next steps.** Based on the standup, suggest:
   - Tasks to dispatch (if the ready queue has items)
   - Blocks to resolve (if anything is blocked on human input)
   - Issues to create (if there's a gap in the backlog)

## Notes

- This is inherently interactive — the whole point is conversation. No `--interactive` flag needed.
- Keep the initial report concise. Details come through follow-up questions.
- If the user asks "what happened while I was away", focus on completed work and new blocks since their last session.
