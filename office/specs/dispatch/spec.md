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

### Scenario: Agent output completes (exit or linger)
- GIVEN an agent is invoked with `--print`
- WHEN stdout closes (output complete)
- THEN both idle and max timers are cancelled. If the process exits within 30s, success. If it lingers past 30s, it's killed with success disposition — the work product is complete.

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

### Scenario: Cancel or pause signal received
- GIVEN `office cancel <issue>` or `office pause <issue>` was invoked during pipeline execution
- WHEN the dispatch loop checks for signals after a step completes
- THEN it reads and deletes the signal file, pushes the branch, labels the issue (`status:blocked-unclassified` for cancel, `status:paused` for pause), adds a comment noting the stop point, notifies the user, and exits

### Scenario: Usage budget wind-down
- GIVEN a `UsageBudget` is provided and `shouldWindDown()` returns true after a step
- THEN the pipeline behaves like a pause: push, label `status:paused`, comment with wind-down reason, notify, exit

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

## Post-Review Revision

### Scenario: Reviewer step captures output in pipeline
- GIVEN a pipeline step has `role: "reviewer"`
- WHEN the step is invoked during pipeline execution
- THEN `invokeAgent` is called with `captureOutput: true`, the output is printed to terminal for visibility, and the raw output string is retained for findings parsing

### Scenario: Revise findings trigger implementer re-invocation
- GIVEN a reviewer pipeline step completes with structured findings
- WHEN any finding has `disposition: "revise"` AND `dispatch.max_revision_rounds` is greater than 0
- THEN the dispatch system re-invokes the implementer role with the revise findings as context, in the same worktree on the same branch

### Scenario: Revision context assembly
- GIVEN revise findings exist from a reviewer step
- WHEN the implementer is re-invoked for revision
- THEN the context includes: the original issue title and number, the specific revise findings (file, line, severity, description, recommendation), and a directive to address only these findings without introducing unrelated changes

### Scenario: Revision changes committed
- GIVEN the implementer completes a revision step
- WHEN file changes exist in the worktree
- THEN changes are committed with message `revision {round}: implementer` — this format is distinct from `step N/M:` so it does not interfere with the step-resume mechanism

### Scenario: Confirmation review after revision
- GIVEN a revision step produces committed changes
- WHEN the revision commit is complete
- THEN the reviewer is re-invoked with a scoped prompt to check only whether the specific revision findings were addressed, not a full re-review

### Scenario: Confirmation review findings become follow-ups only
- GIVEN a confirmation review completes
- WHEN the reviewer outputs new findings
- THEN all findings regardless of their `disposition` field are treated as follow-up — no further revision rounds occur after a confirmation review

### Scenario: Max revision rounds reached
- GIVEN `dispatch.max_revision_rounds` revision rounds have already executed
- WHEN the reviewer produces additional `revise` findings
- THEN all remaining revise findings are promoted to `follow-up` and create child issues

### Scenario: Follow-up issue creation from findings
- GIVEN a reviewer finding has `disposition: "follow-up"` (or is promoted from `revise` due to round cap or confirmation review)
- WHEN the dispatch system processes it
- THEN a GitHub issue is created with: title derived from the finding description, body referencing the parent issue number and including the reviewer's recommendation, and labels `status:backlog` and the parent issue's `pipeline:*` label

### Scenario: Auto-revision disabled
- GIVEN `dispatch.max_revision_rounds` is 0 in the config
- WHEN a reviewer step produces structured findings with `revise` dispositions
- THEN no revision is performed — findings are logged to terminal but not acted on, and the pipeline proceeds to the next step normally

### Scenario: No structured findings in reviewer output
- GIVEN a reviewer pipeline step completes
- WHEN the output contains no `<!-- FINDINGS_START -->` / `<!-- FINDINGS_END -->` markers or the JSON is malformed
- THEN the dispatch system logs a warning, treats it as zero findings, and proceeds to the next pipeline step without revision

### Scenario: Signals and budget checked between revision sub-steps
- GIVEN revision or confirmation review is in progress
- WHEN a revision sub-step completes (implementer revision or confirmation review)
- THEN the dispatch loop checks for pause/cancel signals and usage budget wind-down, applying the same handling as between regular pipeline steps
