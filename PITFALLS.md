# Pitfalls

Non-obvious reasons to avoid specific seemingly-appealing patterns.
Only observed failures belong here — not speculative risks or things enforceable by CI.
Remove entries when the underlying cause is resolved.

## Early exit on adversarial convergence
Two architect instances can agree on the same wrong answer.
Wrong-consensus convergence occurs in ~24% of initially-disputed questions (research-validated).
Silent agreement is the failure mode, not extended debate.
→ Always run to the round cap. No early exit on consensus.
Discovered: 2026-08-25

## Append-only architecture decision logs
ADR files grow unbounded with every revision added as a new entry superseding previous ones.
Within weeks, files reach thousands of lines of supersession chains that agents must trace to find current truth.
Stale/contradictory information in agent context is actively counterproductive (ETH Zurich research).
→ Use living documents edited in place. Decision history lives in git, not in the document.
Discovered: 2026-08-29

## Idle timeout treats completed agents as failures
The `claude --print` process stays alive with stdout open after finishing work — it does not close stdout.
The idle timer fires on no-output silence and kills the process as a failure, even when the agent has committed its work.
Pipelines with 3+ steps rarely complete because later steps never get reached.
→ Three defenses: (1) if stdout closes, cancel timers and use a 30s grace period (treats kills as success). (2) If stdout stays open but the agent committed work (HEAD moved forward), treat the idle kill as success. (3) If HEAD hasn't moved but the working tree is dirty (`git status --porcelain`), treat as success — covers agents that write files without committing (the dispatch loop commits after the agent returns).
Discovered: 2026-08-30, updated: 2026-08-31
