@AGENTS.md

# Agent Office — Project Rules

## Build & Run
- `npm run build` — compile TypeScript
- `npm run typecheck` — type check without emitting
- `npm run lint` — run ESLint with zero warnings tolerance
- `npm run format:check` — verify formatting
- `npm run format` — auto-format source files

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
