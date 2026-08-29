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
