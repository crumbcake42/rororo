---
name: debate
description: Run an adversarial architecture debate on a specific issue — two architect agents argue opposing positions, PM synthesizes, user decides.
allowed-tools:
  - Agent
  - Bash
  - Read
  - Grep
  - Glob
---

# Debate

You are running an interactive adversarial architecture debate.

## Input

The user provides an issue number via `$ARGUMENTS` (e.g., `/debate 42`). If no issue number is given, ask for one.

## Process

1. **Load context.** Read:
   - The issue: `gh issue view <number> --json number,title,body,labels`
   - `ARCHITECTURE.md` — current system design
   - `DECISIONS.md` — existing ADRs and constraints
   - `office.config.yml` — adversarial config (directives, max rounds)

2. **Read the adversarial config.** From `office.config.yml`, get:
   - `adversarial.max_rounds` — how many rounds to run
   - `adversarial.architect_directives` — the two opposing positions

3. **Run the debate.** For each round (1 to max_rounds):

   a. **Architect A** argues their position. Spawn a sub-agent:
   - Give them the issue context, `ARCHITECTURE.md`, `DECISIONS.md`
   - Give them their directive (first entry in `architect_directives`)
   - Give them any prior round transcripts
   - Ask for their argument for this round

   b. **Architect B** responds. Spawn a sub-agent:
   - Same context as A, plus A's argument from this round
   - Give them their directive (second entry in `architect_directives`)
   - Ask for their counter-argument

   c. **Present the round** to the user. Show both arguments clearly. The user can interject, ask questions, or redirect before the next round.

4. **PM synthesis.** After all rounds, synthesize:
   - Spawn a sub-agent as the PM judge
   - Give them the full debate transcript
   - Ask for a synthesis: best path forward given both perspectives, with tradeoffs clearly stated
   - Present the synthesis to the user

5. **User decision.** Ask the user for their decision. When they decide:

```bash
node office/dist/scripts/log-decision.js "<adr-number>" "<title>" "<context>" "<decision>" "<consequences>" "<issue-number>"
```

To determine the next ADR number, read `DECISIONS.md` and find the highest existing ADR number, then increment.

## Key Difference from Autonomous Debate

The autonomous debate in `dispatch.ts` runs as a batch process — all rounds execute, transcript is posted to the issue, and it blocks on human decision. This skill is the interactive complement: the user watches each round unfold, can ask questions mid-debate, and makes their decision in real time.

The underlying mechanics (opposing directives, PM synthesis, decision logging) are the same. The interface is different.

## Notes

- Present each round's arguments clearly and separately. Don't summarize mid-debate.
- If the user wants to interject between rounds (ask a clarifying question, redirect a line of argument), pause the debate and address their input before continuing.
- The debate always runs to the configured max rounds. No early exit on apparent convergence — wrong-consensus convergence is the failure mode this process guards against.
- After the decision is logged, report the ADR number and confirm the issue was updated.
