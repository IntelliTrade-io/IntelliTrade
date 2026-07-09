# IntelliConflict-Map (nested app)

**Status: separate application — NOT part of the root IntelliTrade build.**

This is a standalone Next.js app (note the double nesting: the actual app lives in
`IntelliConflict-Map/IntelliConflict-Map/`). It has its own `package.json`,
tooling, and 9 tests that run via its own runner — none of it is compiled,
linted, or tested by the root project:

- root `tsconfig.json` excludes it
- root `vitest.config.ts` excludes it
- root `eslint.config.mjs` + `.prettierignore` ignore it
- its `node_modules` is gitignored (root `.gitignore` ignores `node_modules/` at any depth)

## Known duplication (deliberate, for now)

Its conflict logic overlaps root `lib/conflicts/*`, and its tests duplicate root
`__tests__/conflicts-route.test.ts` + `scoring.test.ts`. The copies may have
drifted — do not assume either side is canonical.

## Decision

Owner decision (2026-07-04, refactor kickoff): **keep separate for now, revisit
later** — reconcile-or-retire is tracked in `REFACTOR_PLAN.md` §8 (backlog).
Don't merge, delete, or "fix" duplication here without going through that plan.
