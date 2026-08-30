# Daemon

The dispatch daemon is a background process that continuously dispatches ready tasks until the queue is empty or the user pauses it.

## Daemon States

| State | Behavior |
|---|---|
| Active | Dispatching tasks. Re-checks immediately after each dispatch completes. |
| Hibernation | Queue empty. Polls at a slow interval (default 5 min) to catch label changes from GitHub Actions. |
| Paused | User explicitly paused. No polling. Only `office resume` wakes it. |

## Core Loop

### Scenario: Daemon starts
- GIVEN `office start` is invoked
- WHEN the daemon initializes
- THEN it resets the state file, enters active state, begins checking for ready tasks, and notifies via the configured channel

### Scenario: Ready task exists
- GIVEN the daemon is in active state
- WHEN the poll cycle finds a `status:ready` issue
- THEN it dispatches the task using the same logic as `office dispatch` (context assembly, pipeline execution, PR creation)

### Scenario: Dispatch completes
- GIVEN a task's pipeline finishes (success or task-level block)
- WHEN the daemon returns to the poll loop
- THEN it immediately checks for the next ready task without waiting for the poll interval

### Scenario: Queue empty
- GIVEN the daemon is active and the last dispatch completed
- WHEN the next check finds no `status:ready` issues
- THEN the daemon transitions to hibernation, notifies once that the queue is empty, and polls at the hibernation interval

### Scenario: Task becomes ready during hibernation
- GIVEN the daemon is in hibernation
- WHEN a poll finds a newly-ready task
- THEN the daemon transitions to active state and dispatches the task

## Pause / Resume

### Scenario: User pauses the daemon (no args)
- GIVEN the daemon is in active or hibernation state
- WHEN `office pause` is invoked without an issue number
- THEN the state file is updated, the daemon enters paused state, and notifies that it was paused

### Scenario: User pauses a specific pipeline
- GIVEN a pipeline is running for an issue
- WHEN `office pause <issue>` is invoked with an issue number
- THEN a signal file (`.office-signal-<issue>.json`) is written with `{ "action": "pause" }`, and the dispatch loop handles it at the next step boundary (see dispatch spec)

### Scenario: User resumes the daemon (no args)
- GIVEN the daemon is paused
- WHEN `office resume` is invoked without an issue number
- THEN the daemon enters active state, performs an immediate check for ready tasks, and notifies that it was resumed

### Scenario: User resumes a paused pipeline
- GIVEN an issue is labeled `status:paused`
- WHEN `office resume <issue>` is invoked with an issue number
- THEN the system re-labels the issue `status:ready` (removing `status:paused`) so it becomes eligible for the next dispatch cycle, which will use the existing step-resume mechanism

## Cancel

### Scenario: User cancels a running pipeline
- GIVEN a pipeline is running for an issue
- WHEN `office cancel <issue>` is invoked
- THEN a signal file (`.office-signal-<issue>.json`) is written with `{ "action": "cancel" }`, and the dispatch loop handles it at the next step boundary (see dispatch spec)

## Notifications

### Scenario: Queue drains
- GIVEN the daemon transitions from active to hibernation
- WHEN no `status:ready` issues remain
- THEN the daemon sends a one-time "queue empty — hibernating" notification via the configured channel

### Scenario: Dispatch error
- GIVEN a pipeline fails with an unrecoverable error
- WHEN the daemon catches the error
- THEN it notifies with the error details, labels the issue `status:blocked-unclassified`, and continues checking for other ready tasks

## Status

### Scenario: Status check
- GIVEN the daemon is running (or was recently running)
- WHEN `office daemon-status` is invoked
- THEN it reads the state file and reports: current state (active/hibernation/paused), uptime, tasks dispatched this session, last dispatch timestamp, and current ready-queue depth

## Shutdown

### Scenario: Graceful shutdown
- GIVEN the daemon receives SIGINT or SIGTERM
- WHEN no dispatch is in progress
- THEN it persists final state and exits

### Scenario: Shutdown during dispatch
- GIVEN the daemon receives SIGINT while a pipeline is running
- WHEN the signal propagates to the child process
- THEN the child process terminates, the daemon logs that the dispatch was interrupted, and exits (the interrupted task remains `status:in-progress` for manual triage)

## Usage-Aware Wind-Down

### Scenario: Budget configured
- GIVEN `daemon.session_budget_minutes` is set in `office.config.yml`
- WHEN the daemon starts
- THEN it creates a `UsageBudget` object tracking cumulative wall-clock agent time, passed to each `dispatchIssue` call

### Scenario: Approaching usage threshold
- GIVEN the daemon is tracking agent time against a session budget
- WHEN cumulative agent time reaches `usage_threshold_pct` percent of `session_budget_minutes` (checked between pipeline steps and between dispatches)
- THEN the current pipeline is paused (commit, push, label `status:paused`), the daemon notifies with the reason ("Usage budget: X of Y minutes consumed, threshold Z% reached"), and the daemon transitions to paused state

### Scenario: No budget configured
- GIVEN `daemon.session_budget_minutes` is not set or is 0
- WHEN the daemon runs
- THEN no usage tracking occurs and `UsageBudget.shouldWindDown()` always returns false

### Scenario: Wind-down mid-pipeline
- GIVEN the daemon's budget threshold is reached while a pipeline step is executing
- WHEN the step completes and the dispatch loop checks the budget
- THEN the pipeline exits gracefully: pushes the branch, labels the issue `status:paused`, comments that wind-down was triggered, and returns control to the daemon which then pauses

## Priority Dispatch

### Scenario: Ready queue with mixed priorities
- GIVEN multiple `status:ready` issues exist
- WHEN the daemon calls `dispatchNext`
- THEN issues with `priority:high` are dispatched before unlabeled issues, which are dispatched before `priority:low` issues. Within a tier, issues are ordered by number ascending.

## Constraints
- Serial execution only — one task pipeline at a time. Concurrent dispatch is out of scope.
- The daemon uses the same `dispatchNext` / `dispatchIssue` code path as manual dispatch. No forked logic.
- State file (`.office-daemon-state.json`) is gitignored.
- Signal files (`.office-signal-*.json`) are gitignored.
- `UsageBudget` is an interface passed from daemon to dispatch. Manual dispatch (no daemon) passes no budget, so wind-down is daemon-only.
