# Task Management

Tasks are managed as GitHub Issues with labels for state management.

## Task States

| Label | Meaning |
|---|---|
| `status:backlog` | Identified but not ready for work |
| `status:ready` | Context is sufficient, can be dispatched |
| `status:in-progress` | An agent has been dispatched and is working |
| `status:paused` | Pipeline paused by user or wind-down — resume with `office resume <issue>` |
| `status:review` | Work complete, awaiting review |
| `status:done` | Merged and verified |
| `status:blocked-human` | Waiting on a human decision or information |
| `status:blocked-dependency` | Waiting on another task to complete |
| `status:blocked-unclassified` | Blocked for a reason that needs triage |

## Priority Labels

| Label | Meaning |
|---|---|
| `priority:high` | Dispatched before normal and low priority tasks |
| *(no label)* | Normal priority (default) |
| `priority:low` | Dispatched after normal and high priority tasks |

## Blocking

### Scenario: Agent encounters unanswerable question
- GIVEN an agent is working on a dispatched task
- WHEN it encounters a question it cannot answer from the available context
- THEN it stops work, posts the question as a comment on the issue, and labels it `status:blocked-human`

### Scenario: Human responds to blocking question
- GIVEN an issue is labeled `status:blocked-human` with a blocking question
- WHEN the user responds as a comment on the issue
- THEN the issue moves to `status:ready` and is eligible for the next dispatch cycle

### Scenario: Dependency resolved
- GIVEN an issue is labeled `status:blocked-dependency` referencing another issue
- WHEN the blocking issue's PR is merged
- THEN the dependent issue moves to `status:ready`
