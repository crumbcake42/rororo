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

### Scenario: User pauses the daemon
- GIVEN the daemon is in active or hibernation state
- WHEN `office pause` is invoked
- THEN the state file is updated, the daemon enters paused state, and notifies that it was paused

### Scenario: User resumes the daemon
- GIVEN the daemon is paused
- WHEN `office resume` is invoked
- THEN the daemon enters active state, performs an immediate check for ready tasks, and notifies that it was resumed

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

## Constraints
- Serial execution only — one task pipeline at a time. Concurrent dispatch is out of scope.
- The daemon uses the same `dispatchNext` / `dispatchIssue` code path as manual dispatch. No forked logic.
- State file (`.office-daemon-state.json`) is gitignored.
