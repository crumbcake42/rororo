# Handoff to Claude Code

## What's in this directory

- **`SPEC.md`** — Complete specification for the Agent Office template repo. Every design decision has been made. Contains: architecture, task management, agent roles, pipeline definitions, adversarial review structure, branch strategy, quality gates, dispatch system design, standup/planning/retrospective workflows, full file structure, config schema, and a 43-task implementation breakdown.

- **`office.config.yml`** — The actual default config file, ready to be placed at the repo root. Fully commented.

## How to use this with Claude Code

1. Start a Claude Code session in an empty directory (or a fresh git repo).
2. Paste or reference `SPEC.md` as context. The key instruction:

   > "Scaffold the Agent Office template repo as specified in SPEC.md. Follow the implementation task breakdown in order, starting with Phase 0. Create every file listed in the File Structure section. Use office.config.yml as-is for the config file. Do not re-derive any design decisions — every choice has been made."

3. For Phase 5 (the dispatch system TypeScript code), the spec describes the interfaces and behaviors. The agent will need to make implementation choices within those constraints — that's expected and appropriate.

4. Phase 6 (daemon) should be built using the Phase 5 manual CLI — this is the template's first real dogfood test.

## What's NOT in this handoff

- Actual TypeScript source code — the spec describes what each module does, the agent writes the code.
- GitHub repo setup — you'll need to create the repo on GitHub, enable Actions, and configure branch protection rules manually (or via GitHub CLI).
- Secrets — `.env` values are yours to fill in.
- The first real project — that's the validation step. Fork the template, point it at something you want to build, and see if the workflow holds.
