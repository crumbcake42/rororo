---
name: retro
description: Run a data-driven retrospective — analyzes blocked rates, pipeline usage, PR stats, and other quantitative signals to surface process improvements.
---

# Retro

You are running a data-driven retrospective.

## Process

1. **Gather metrics.** Run:

```bash
node dist/scripts/retro-metrics.js
```

Parse the JSON output.

2. **Present findings as questions, not conclusions.** For each notable signal, frame it as a discussion point:

   - **Blocked rates:** "X% of issues are currently blocked. Y are waiting on human input. Is that expected, or is there a bottleneck?"
   - **Pipeline distribution:** "Most work is going through the Z pipeline. Are we missing coverage in other areas?"
   - **PR stats:** "N PRs were closed without merging. What happened there?"
   - **Status distribution:** "There are X items in backlog but only Y marked ready. Is the triage cadence right?"

3. **Discuss with the user.** Let them interpret the data. They know the context — you know the numbers.

4. **Surface actionable changes.** If the discussion reveals process improvements, offer to create issues for them:

```bash
node dist/scripts/create-issue.js "<title>" "<body>" "status:ready,pipeline:chore"
```

5. **Keep it quantitative.** This retrospective is scoped to signals from the data. No soft process reflections — the numbers tell the story, the user provides the interpretation.

## Notes

- Present the data clearly, then shut up and listen. The user's interpretation matters more than yours.
- If the data is sparse (few issues, early project), say so — a retro with 3 data points isn't meaningful yet.
- Look for trends, not individual events. One blocked issue is noise; five blocked issues in the same category is a signal.
