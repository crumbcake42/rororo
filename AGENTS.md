# Agent Office — Cross-Tool Agent Instructions

These instructions apply to all agents operating in this project, regardless of tool.

## Context Loading
Before starting work, read:
1. The GitHub Issue assigned to you (task description and acceptance criteria).
2. `ARCHITECTURE.md` for current system design.
3. Relevant `office/specs/` for requirements that constrain your work.
4. `PITFALLS.md` for non-obvious anti-patterns to avoid.
5. Any source files listed in the issue's Scope section.

## Output Expectations
- Produce working, tested code that meets the acceptance criteria.
- If you change the system's architecture, update `ARCHITECTURE.md` in place (do not append — edit the relevant section).
- If you make or rely on an architecture decision, check `ARCHITECTURE.md` and relevant `office/specs/` first.
- If you discover a non-obvious failure pattern, add it to `PITFALLS.md`.
- Commit messages follow the format in `CLAUDE.md`.

## Blocking Protocol
If you encounter a question you cannot answer from the available context:
1. Stop work immediately.
2. Post the specific question as a comment on the GitHub Issue.
3. Label the issue `status:blocked-human` (if it needs a human answer) or `status:blocked-unclassified` (if you're unsure).
4. Do not guess or assume — the cost of a wrong assumption exceeds the cost of blocking.

## Tool & Library Selection
Before proposing a custom solution for any problem, check whether a trusted, well-supported existing tool already solves it. If one exists and fits the problem well, adopt it directly. Do not build bespoke reimplementations or "inspired by" versions when the original is available, MIT-licensed, and well-fitted. Only build custom when nothing existing covers the gap.

## Scope Discipline
- Only modify files listed in your task's Scope section.
- If you discover a needed change outside your scope, note it as a comment on the issue — do not make the change.
- Read any file you need for context, but write only within scope.

## Handoff
When your pipeline step is complete:
- Ensure all quality gates pass locally before pushing.
- Your output becomes input for the next pipeline step. Write clean, reviewable code.
