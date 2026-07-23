# IntelliJournal Native Integration Plan (Corrected)

## Planning basis

Integrate from `Canonical standalone Journal source (read-only reference; not required at runtime)` into `repository root`. Do not use `C:\IntelliTrade\DashboardV2` as architectural evidence and do not copy the standalone app wholesale.

Target entry is `/dashboardv2?panel=journal`; durable task routes should live below `/dashboardv2/journal/*`. Existing IntelliTrade auth, Supabase clients, Stripe entitlement, middleware, dashboard shell, environment configuration, and test tooling remain authoritative.

## Guardrails for every phase

- Keep `components/dashboardv2/constants.ts` Journal `comingSoon: true` until a real user-data read path is production-ready.
- Use the cookie-scoped Supabase server client for user CRUD; never use the service-role client as an RLS substitute.
- Call `requireSubscription()` in every premium Journal API handler.
- Add only forward, additive migrations; include rollback/disable notes and never mutate production Supabase from local code.
- Use canonical internal asset identifiers and existing provider alias mappings.
- Preserve all behavior represented by the parity matrix and add tests with every non-trivial change.
- Never expose storage objects publicly or put service credentials in client code.

## Phase A: Pure domain foundation

**Objective:** Port framework-independent Journal contracts before touching routes, database, or UI.

**Likely files:** new `lib/journal/types.ts`, `lib/journal/validation.ts`, `lib/journal/math.ts`, and colocated Vitest tests. Source references are `lib/types/journal.ts`, `lib/validation/schemas.ts`, and `lib/trades/math.ts` in the canonical Journal.

**Dependencies/migrations:** Use IntelliTrade's existing TypeScript, Vitest, and Zod setup. No package changes and no migration.

**Risks:** Accidental contract drift or hardcoded symbols. Keep inputs asset-ID based where the production model is not yet decided.

**Tests and acceptance:** Port all applicable schema/math cases; `npm test`, lint, and typecheck pass without increasing existing warnings. No routes, UI, auth, or fixture behavior changes.

**Rollback:** Delete the isolated new module and tests; no user or database state exists.

## Phase B: Data model and migration

**Objective:** Define additive Journal persistence compatible with the production Supabase project.

**Likely files:** next numbered file under `supabase/migrations/`, Journal row mappers/types, migration test/runbook documentation.

**Dependencies/migrations:** Human approval of namespaced table names, account model, canonical asset relationship, lapsed-user read policy, and existing-data migration needs. Recommended names are `journal_accounts`, `journal_strategies`, `journal_trades`, `journal_trade_legs`, `journal_risk_markers`, and `journal_reviews`; avoid a generic `sessions` table unless its product meaning is approved.

**Risks:** Table collision, orphaned data, broken RLS, and embedding provider symbols. Mutations should require owner identity plus `active`/`trialing`, matching the calculator-template defense-in-depth precedent.

**Tests and acceptance:** Migration applies cleanly to an empty/test database; constraints and cascades are verified; two-user RLS tests prove isolation; inactive users cannot mutate. Rollback SQL or a disable strategy is documented.

**Rollback:** Disable feature entry first. Because migrations are additive, preserve tables/data until an explicit, separately approved removal migration.

## Phase C: Authenticated and entitled API core

**Objective:** Implement trade list/create/detail/edit/delete and leg replacement through the existing server boundary.

**Likely files:** `app/api/journal/route.ts`, `app/api/journal/[id]/route.ts`, `app/api/journal/[id]/legs/route.ts`, `lib/journal/server.ts`, route tests.

**Dependencies/migrations:** Phase B schema. Existing `lib/supabase/server.ts` and `lib/auth/requireSubscription.ts` only; do not port standalone auth helpers.

**Risks:** 401/403 leakage, foreign-user row access, partial trade/leg writes, and best-effort replacement restore. Prefer a transactional database RPC if approved; otherwise preserve and document standalone failure behavior exactly.

**Tests and acceptance:** Every handler covers unauthenticated, inactive, active, malformed, not-found/foreign-owned, success, and database-failure cases. Existing 406 tests and mapped Journal tests remain green.

**Rollback:** API routes can be removed/disabled while additive tables remain intact.

## Phase D: Read-only native dashboard surface

**Objective:** Replace the generated fixture overview with the authenticated user's real summary and list data.

**Likely files:** `components/dashboardv2/panels/journal-panel.tsx`, Journal components under `components/dashboardv2/journal/`, `components/dashboardv2/Dashboard.tsx`, `components/dashboardv2/constants.ts`, tests.

**Dependencies/migrations:** Phase C GET APIs and stats contract. Continue using the existing dashboard shell and chart stack.

**Risks:** Showing fixture data as real data, client waterfall/performance issues, and breaking dashboard workspace persistence.

**Tests and acceptance:** Empty, populated, loading, expired-session, 403, and API-failure states are explicit. `/dashboardv2?panel=journal` selects the real panel. Only now remove `comingSoon` and generated Journal fixture imports.

**Rollback:** Restore the disabled/coming-soon entry without deleting user data or reverting migrations.

## Phase E: Core Journal task routes

**Objective:** Add dashboard-native create and detail/edit experiences without duplicating global navigation.

**Likely files:** `app/dashboardv2/journal/layout.tsx`, `app/dashboardv2/journal/trades/new/page.tsx`, `app/dashboardv2/journal/trades/[id]/page.tsx`, feature components and loading/error/not-found files.

**Dependencies/migrations:** Phase C mutations and Phase D navigation conventions. No standalone root layout, login route, middleware, providers, or global CSS should move.

**Risks:** Route context divergence from the panel, React 18-to-19 behavior changes, and visual regressions while replacing standalone custom CSS.

**Tests and acceptance:** Create, detail, top-level edit, leg replacement, and delete flows retain validation/failure semantics at mobile and desktop sizes. Successful actions return to the native Journal entry.

**Rollback:** Remove child-route links and disable mutations; the read-only panel and data remain safe.

## Phase F: Stats, reviews, and exports

**Objective:** Complete server-backed analytics, saved reviews, and CSV/JSON export parity.

**Likely files:** `app/api/journal/stats/route.ts`, `app/api/journal/reviews/route.ts`, `app/api/journal/exports/route.ts`, nested dashboard routes/components, domain tests.

**Dependencies/migrations:** Review table and core trade data. Reuse pure calculations from Phase A.

**Risks:** Loading all trades without bounds, snapshot contract drift, CSV injection/escaping, and paid-read policy ambiguity.

**Tests and acceptance:** Realized calculations match canonical fixtures; review create/update/history and normalized snapshots pass; invalid/empty/date-scoped exports behave identically; exported data is owner-only and excludes media paths.

**Rollback:** Hide affected navigation and disable routes; persisted reviews remain intact.

## Phase G: Private screenshot storage

**Objective:** Add upload, signed display, and delete cleanup with production-reviewed storage controls.

**Likely files:** screenshot API route, upload helpers/components, storage policy migration or reviewed operations runbook, tests.

**Dependencies/migrations:** Human approval of bucket provisioning, MIME/size limits, object retention, and ownership policies.

**Risks:** Public data exposure, cross-user paths, orphaned objects, and DB/storage non-atomicity. This is the highest-risk runtime feature.

**Tests and acceptance:** Two users cannot upload/sign/remove each other's paths; only stable object paths are persisted; signed URLs expire; cleanup warnings are truthful. Deployed staging policy checks are mandatory.

**Rollback:** Disable upload UI/API first; keep the private bucket and existing objects readable to owners until an approved retention action.

## Phase H: Full parity and release validation

**Objective:** Close every row in `JOURNAL_FEATURE_PARITY_MATRIX.md` and perform staging verification.

**Likely files:** route/component/integration tests, optional Playwright configuration, QA/runbook updates, monitoring/analytics hooks following existing conventions.

**Dependencies/migrations:** All prior phases and configured Sanity, Supabase, Stripe test mode, and storage environments.

**Risks:** False parity from unit tests alone and environment-only failures missed locally.

**Tests and acceptance:** Existing 406 web and 69 Python tests remain green; all 60 Journal behaviors are represented; lint warnings do not increase; typecheck/build pass with required environment values; paid/auth/RLS/storage browser matrix passes; manual QA is signed off.

**Rollback:** Keep the Journal entry independently disableable. Roll back UI/API exposure before considering any data migration reversal.

## Exact first implementation slice

Implement **Phase A only: pure Journal domain contracts and tests**.

This comes first because it is reviewable, has no deployment or data-state effect, establishes the compatibility contract under Next 15/React 19/strict TypeScript, and does not pre-empt unresolved schema, route-detail, or storage decisions.

Likely files:

- `repository root\lib\journal\types.ts`
- `repository root\lib\journal\validation.ts`
- `repository root\lib\journal\math.ts`
- corresponding `*.test.ts` files

Must remain untouched in this slice:

- dashboard tab/panel and its `comingSoon` status;
- middleware, auth, Stripe, and Supabase client helpers;
- production migrations and Supabase state;
- both standalone Journal folders;
- deployment and environment configuration.

Acceptance criteria:

1. Canonical trade/review/export input contracts needed by later phases are represented without route/UI code.
2. Math and validation behavior is covered by the canonical cases.
3. No provider symbol is hardcoded into the domain contract; asset identity remains canonical/configurable.
4. Existing tests pass, lint warnings do not increase, and typecheck passes.
5. Git diff contains only the isolated Journal domain module and tests.

## Proposed next Codex prompt

```text
Work only in repository root on the current main-based branch. Read C:\IntelliTrade\AGENTS.md and verify Git status before editing. Use Canonical standalone Journal source (read-only reference; not required at runtime) only as read-only behavioral reference.

Implement Phase A from C:\IntelliTrade\JOURNAL_INTEGRATION_PLAN.md: add a framework-independent IntelliJournal domain foundation under lib/journal with strict TypeScript types, Zod validation, and deterministic realized-trade math, plus Vitest tests porting the applicable canonical Journal cases. Adapt to the authoritative repo's existing dependencies and conventions; do not copy standalone app configuration.

Do not add routes, components, migrations, API handlers, auth code, Supabase helpers, dependencies, environment variables, or integration UI. Do not change the Journal comingSoon state or fixture preview. Do not modify either standalone Journal folder. Do not hardcode provider symbols; keep asset identity canonical and externally resolved.

Before finishing, run the relevant new tests, the full npm test suite, npm run lint, and npm run typecheck. Report changed files, mapped canonical behaviors, verification results, and any contract decisions deferred to the schema phase. Do not commit or deploy.
```

## Exhaustive preservation gate (2026-07-22)

Before implementation starts, use the three exhaustive discovery artifacts as required inputs:

1. `JOURNAL_EXHAUSTIVE_FEATURE_INVENTORY.md` defines the complete confirmed baseline and separates eight document/reference-only ideas from production behavior.
2. `JOURNAL_FEATURE_PRESERVATION_CONTRACT.md` is the acceptance ledger. Every implementation change must name the Feature IDs it addresses and update their automated/manual evidence only after verification.
3. `JOURNAL_DEPENDENCY_MAP.md` identifies cross-surface calculations, ownership boundaries, private media, persistence compensation, and test gaps.

Additional phase constraints:

- Phase A must lock current arithmetic with fixtures before deciding whether native IntelliTrade should apply `instrument.contract_size`; silently changing historical PnL is prohibited.
- The schema phase must not reuse the standalone materialized stats view as a canonical source until its slippage and matched-quantity differences are reconciled.
- API design must explicitly resolve create-time `screenshot_urls`, typed HTTP errors, malformed request responses, and list date-filter compatibility.
- Review migration must preserve stored snapshot normalization and stored-versus-current semantics, including legacy keys and unsupported-key reporting.
- Screenshot work requires real two-user private-bucket tests and injected partial-failure tests; helper-unit coverage alone is insufficient.
- A feature is not complete from unit-test mapping alone. Its contract row requires the specified route, component/browser, DB/RLS/Storage, accessibility, or visual evidence where applicable.
