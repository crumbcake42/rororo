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
The `claude --print` process may linger after finishing output (holding connections, internal cleanup).
The idle timer fires on no-output and kills the process as a failure — even when the agent's work is fully committed.
Pipelines with 3+ steps rarely complete because later steps never get reached.
→ Detect stdout close as the completion signal. After stdout ends, replace the idle timer with a short grace period and treat kills as success.
Discovered: 2026-08-30
