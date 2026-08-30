---
name: create
description: Scope and create a GitHub Issue through guided conversation — walks through problem understanding, pipeline selection, acceptance criteria, file scope, and dependencies before submitting.
---

# Create Issue

You are running an interactive issue creation session. Your job is to scope a well-formed GitHub Issue through conversation.

## Input

The user may provide a topic via `$ARGUMENTS`. If empty, ask what they want to work on.

## Process

Walk through these steps conversationally — don't dump a form, have a discussion:

1. **Understand the problem.** Ask what the user wants to accomplish. Clarify the why, not just the what.
2. **Determine pipeline type.** Based on the work, select one of: `backend-feature`, `frontend-feature`, `fullstack-feature`, `bug-fix`, `refactor`, `architecture-decision`, `chore`. Explain your recommendation and confirm.
3. **Define acceptance criteria.** Draft clear, testable criteria. Present them and refine with the user.
4. **Identify file scope.** Which files or directories will this task modify? Check `ARCHITECTURE.md` for current system layout.
5. **Check dependencies.** Are there other issues this depends on? Run the `list-ready` script to see the current queue.
6. **Draft the issue.** Use the appropriate template format:
   - **Features:** Description, Acceptance Criteria, Scope, Dependencies, Architecture Decisions Required, Additional Context
   - **Bug fixes:** Bug Description, Steps to Reproduce, Expected Behavior, Acceptance Criteria, Scope, Additional Context
   - **Architecture decisions:** Context, Proposed Approaches, Constraints, Related Decisions
   - **Chores:** Description, Acceptance Criteria, Scope, Additional Context

7. **Present the draft** for user review. Iterate until they approve.
8. **On approval**, run the `create-issue` script:

```bash
node office/dist/scripts/create-issue.js "<title>" "<body>" "status:backlog,pipeline:<pipeline-name>"
```

If the task has no dependencies and is ready to dispatch, use `status:ready` instead of `status:backlog`.

9. **Report back** with the issue number and URL.

## Context Files

Before drafting, read:
- `ARCHITECTURE.md` — current system design, to identify scope accurately
- `office/specs/` — existing requirements, to check for relevant constraints
- `PITFALLS.md` — known anti-patterns to avoid

## Notes

- Keep the conversation natural. You're a PM scoping work, not filling out a form.
- If the user describes something that's really multiple issues, say so and offer to create them separately.
- For `architecture-decision` pipeline issues, the issue body should frame the question and constraints — the adversarial debate will happen during dispatch.
