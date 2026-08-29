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

### Scenario: Agent blocks during pipeline
- GIVEN an agent is executing a pipeline step
- WHEN it encounters a question it cannot answer
- THEN the pipeline pauses, the issue is labeled `status:blocked-human`, and the user is notified per the configured notification mode
