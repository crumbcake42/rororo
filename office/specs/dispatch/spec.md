# Dispatch

The dispatch system reads ready tasks, assembles context, and invokes agents through pipeline sequences.

## Manual Dispatch

### Scenario: Dispatch a ready task
- GIVEN a GitHub issue labeled `status:ready` with a `pipeline:*` label
- WHEN `office dispatch` is invoked
- THEN the system creates a git worktree, assembles a context bundle, and invokes Claude Code with the pipeline's first role

### Scenario: Context assembly
- GIVEN a task is being dispatched
- WHEN the dispatch system assembles the context bundle
- THEN it includes: the issue body, ARCHITECTURE.md, relevant OpenSpec specs, PITFALLS.md, the agent role definition, CLAUDE.md, and the pipeline definition

## Pipeline Execution

### Scenario: Pipeline step completes
- GIVEN an agent completes its pipeline step
- WHEN the step's outputs are produced
- THEN the next role in the pipeline sequence is invoked with the accumulated context

### Scenario: Step changes are committed
- GIVEN an agent completes a pipeline step
- WHEN the step produced file changes in the worktree
- THEN the dispatch system stages all changes and commits with message `step {N}/{total}: {role}`

### Scenario: Step produces no changes
- GIVEN an agent completes a pipeline step
- WHEN no files were modified in the worktree
- THEN no commit is created and the pipeline proceeds to the next step

### Scenario: Pipeline fails mid-execution
- GIVEN a pipeline step throws an error
- WHEN the error is caught
- THEN the branch is pushed to the remote before worktree cleanup, preserving completed steps' commits

### Scenario: Re-dispatch resumes from last completed step
- GIVEN a previously failed pipeline is re-dispatched for the same issue
- WHEN the branch already exists on the remote
- THEN the system creates the worktree from the existing remote branch, parses commit messages on the branch (not the full history) for `step N/M: role` markers, validates that each marker's step index AND role name match the current pipeline definition, and resumes from the first incomplete step

### Scenario: Pipeline definition changed between re-dispatches
- GIVEN a resumed pipeline's commit history contains step markers
- WHEN a marker's role name does not match the current pipeline's role at that index
- THEN the marker is not counted as completed and the pipeline re-runs from that step

### Scenario: Agent output completes and process exits
- GIVEN an agent is invoked with `--print`
- WHEN the agent finishes producing output and the process exits with code 0
- THEN the step completes successfully and the pipeline proceeds normally

### Scenario: Agent output completes but process lingers
- GIVEN an agent is invoked with `--print`
- WHEN stdout closes (output complete) but the process does not exit within 30 seconds
- THEN the process is killed and the step is treated as a **successful** completion — both the idle timer and the max timer are cancelled after output is complete

### Scenario: Agent hangs mid-output without producing work
- GIVEN an agent is invoked with `--print`
- WHEN the agent produces no stdout or stderr data for `agent_idle_timeout` seconds while stdout is still open AND HEAD has not moved forward AND the working tree is clean
- THEN the process is killed and the step fails with an idle timeout error

### Scenario: Agent completes work but process lingers with stdout open (idle)
- GIVEN an agent is invoked with `--print`
- WHEN the agent produces no stdout or stderr data for `agent_idle_timeout` seconds while stdout is still open BUT HEAD has moved forward (agent committed work)
- THEN the process is killed and the step is treated as a **successful** completion — the committed work is preserved

### Scenario: Agent writes files without committing and process lingers (idle)
- GIVEN an agent is invoked with `--print`
- WHEN the agent produces no stdout or stderr data for `agent_idle_timeout` seconds while stdout is still open AND HEAD has not moved BUT `git status --porcelain` shows uncommitted changes
- THEN the process is killed and the step is treated as a **successful** completion — the dispatch loop will commit the changes

### Scenario: Agent exceeds max timeout after committing work
- GIVEN an agent is invoked with `--print`
- WHEN the agent exceeds `agent_max_timeout` seconds total runtime BUT HEAD has moved forward (agent committed work)
- THEN the process is killed and the step is treated as a **successful** completion — the committed work is preserved

### Scenario: Agent blocks during pipeline
- GIVEN an agent is executing a pipeline step
- WHEN it encounters a question it cannot answer
- THEN the pipeline pauses, the issue is labeled `status:blocked-human`, and the user is notified per the configured notification mode

## Pipeline Signals

Signal files (`.office-signal-<issue>.json`) are checked between pipeline steps — after the current step's commit and before the next agent invocation.

### Scenario: Cancel signal received
- GIVEN a pipeline is executing and `office cancel <issue>` was invoked
- WHEN the dispatch loop checks for signals after a step completes
- THEN it reads and deletes the signal file, pushes the branch to preserve completed work, labels the issue `status:blocked-unclassified`, adds a comment noting the cancellation and which step was last completed, notifies the user, and exits the pipeline

### Scenario: Pause signal received
- GIVEN a pipeline is executing and `office pause <issue>` was invoked
- WHEN the dispatch loop checks for signals after a step completes
- THEN it reads and deletes the signal file, pushes the branch, labels the issue `status:paused`, adds a comment noting the pause point (step N of M), notifies the user, and exits the pipeline

### Scenario: Usage budget wind-down
- GIVEN a pipeline is executing with a `UsageBudget` provided by the daemon
- WHEN the budget's `shouldWindDown()` returns true after a step completes
- THEN the pipeline treats it like a pause: pushes the branch, labels the issue `status:paused`, adds a comment noting the wind-down reason and pause point, notifies the user, and exits

### Scenario: Signal arrives with no running pipeline
- GIVEN `office cancel <issue>` or `office pause <issue>` is invoked
- WHEN the issue is not labeled `status:in-progress`
- THEN the CLI prints a warning and exits without writing a signal file

## Priority Dispatch

### Scenario: Dispatch next with priority sorting
- GIVEN the daemon or manual dispatch calls `dispatchNext` without specifying an issue
- WHEN multiple `status:ready` issues exist
- THEN issues are sorted by priority label (`priority:high` first, no priority label second, `priority:low` last), then by issue number ascending within each tier, and the first issue is dispatched

### Scenario: Dispatch with priority flag
- GIVEN `office dispatch <issue> --priority high` is invoked
- WHEN the issue is labeled `status:ready`
- THEN the system adds the `priority:high` label to the issue before dispatching it
