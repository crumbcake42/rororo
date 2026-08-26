---
name: status
description: Quick project status overview — task counts by state, anything blocked, anything in review.
---

# Status

You are providing a quick project status check.

## Process

1. **Get the data.** Run:

```bash
node dist/scripts/project-status.js
```

Parse the JSON output.

2. **Present a concise summary.** This is a quick check, not a meeting. Show:
   - Task counts by state (ready, in-progress, review, blocked, done, backlog)
   - Call out anything blocked (with count and type)
   - Call out anything in review (waiting for merge)
   - Note the ready queue depth (tasks available for dispatch)

3. **Keep it short.** Two to five sentences. If the user wants details, they'll ask — or they can run `/standup` for a full report.

## Notes

- This is the quick-glance version of `/standup`. Don't duplicate standup's detail.
- If everything looks healthy (nothing blocked, work moving through), say so briefly.
- If something looks off (all tasks blocked, empty ready queue, large backlog with nothing ready), flag it.
