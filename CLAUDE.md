@AGENTS.md

# Agent Office — Project Rules

## Build & Run (Office)
- `cd office && npm run build` — compile office TypeScript
- `cd office && npm run typecheck` — type check without emitting
- `cd office && npm run lint` — run ESLint with zero warnings tolerance
- `cd office && npm run format:check` — verify formatting
- `cd office && npm run format` — auto-format office source files

## Directory Layout
- `office/` — the dispatch system, CLI, and agent orchestration (self-contained)
- `src/` — the adopting project's source code (your code goes here)
- `scripts/` — bash wrappers that call compiled office scripts
- `.claude/agents/` — agent role definitions
- `.claude/skills/` — interactive skill definitions

## Code Conventions
- TypeScript strict mode. No `any` without justification.
- ES modules (`import`/`export`), not CommonJS.
- Async/await over raw promises.
- Errors: throw typed errors, never strings.
- Naming: camelCase for variables/functions, PascalCase for types/interfaces, kebab-case for filenames.

## File Ownership
- Agents may only modify files within the scope specified in their dispatched task.
- Shared config files (`office.config.yml`, `CLAUDE.md`, `AGENTS.md`) require PM or user approval to modify.
- `ARCHITECTURE.md` is updated by the architect role only.
- `DECISIONS.md` is updated by the architect or PM role only.

## Commit Messages
Format: `<type>(<scope>): <description>`

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `ci`

Examples:
- `feat(dispatch): add context assembly for pipeline steps`
- `fix(worktree): handle branch name collisions`
- `docs(architecture): update component diagram after auth refactor`

## What Not To Do
- Do not install new dependencies without user approval.
- Do not modify CI workflow files without reviewer sign-off.
- Do not commit `.env` or any file containing secrets.
- Do not modify files outside your task's declared scope.
- Do not merge your own PR — another role or the user merges.
