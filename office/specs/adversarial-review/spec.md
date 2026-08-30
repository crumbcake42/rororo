# Adversarial Architecture Review

Two architect instances debate with opposing directives. PM judges and synthesizes. User makes the final call.

## Debate Structure

### Scenario: Architecture decision requires debate
- GIVEN a task requires an architecture decision
- WHEN the architecture-decision pipeline is invoked
- THEN two architect instances are created with opposing directives from `office.config.yml`

### Scenario: Debate runs to completion
- GIVEN two architect instances are debating
- WHEN the configured maximum rounds are reached (default: 3)
- THEN the debate ends and the PM agent receives the full transcript

### Scenario: PM synthesizes the debate
- GIVEN a debate has completed all rounds
- WHEN the PM agent reads the transcript
- THEN it posts a synthesis to the GitHub Issue with each position's strongest arguments, key tradeoffs, and a proposed decision

### Scenario: User approves decision
- GIVEN the PM has posted a synthesis
- WHEN the user approves (or modifies and approves) the proposed decision
- THEN the architect updates ARCHITECTURE.md and/or the relevant OpenSpec spec to reflect the decision

## Default Directives
Configurable in `office.config.yml` under `adversarial.architect_directives`:
1. Argue for the simplest viable solution
2. Argue for the most extensible solution
