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

### Scenario: Agent blocks during pipeline
- GIVEN an agent is executing a pipeline step
- WHEN it encounters a question it cannot answer
- THEN the pipeline pauses, the issue is labeled `status:blocked-human`, and the user is notified per the configured notification mode
