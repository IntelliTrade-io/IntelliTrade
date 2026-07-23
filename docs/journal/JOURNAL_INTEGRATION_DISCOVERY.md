# IntelliJournal Integration Discovery (Corrected)

## Status and correction scope

This report supersedes the discovery performed against `C:\IntelliTrade\DashboardV2`. That folder is not the SourceTree working copy and its architecture is not authoritative.

- Authoritative IntelliTrade working copy: `repository root`
- Canonical Journal source: `Canonical standalone Journal source (read-only reference; not required at runtime)`
- Discovery date: 2026-07-22
- Scope: discovery and planning only; no integration code or production configuration changes

## 1. Repository synchronization

| Check | Result |
| --- | --- |
| `git rev-parse --show-toplevel` | `C:/IntelliTrade_Git` |
| Branch | `main` |
| Upstream | `origin/main` |
| Remote | `https://github.com/IntelliTrade-io/IntelliTrade.git` |
| Local HEAD before fetch/pull | `f327cd1cbed06cc04ecd12e2cca62e449e107cff` |
| Fetched `origin/main` | `f327cd1cbed06cc04ecd12e2cca62e449e107cff` |
| Fetch | Succeeded with prune |
| Pull | `git pull --ff-only origin main` succeeded; already up to date |
| Worktree before synchronization | Clean; no staged, modified, deleted, or untracked files |
| Pull blockers | None |

No `AGENTS.md` exists inside `repository root`. The workspace rules in `C:\IntelliTrade\AGENTS.md` remain applicable to work performed in that workspace, including test coverage, credential isolation, provider boundaries, and canonical asset IDs.

## 2. Current IntelliTrade architecture

The production source is a single-package Next.js application, not the previously analyzed Vite SPA and not a package-workspace monorepo.

- Next.js `15.3.8`, React/React DOM `19`, TypeScript `5.8.3` with strict checks.
- App Router under `app/`; shared UI and feature code under `components/` and `lib/`.
- Tailwind CSS 3, Radix/shadcn-style primitives, Framer Motion, Recharts, and Lightweight Charts.
- Root middleware delegates to `lib/supabase/middleware.ts` for session refresh and page entitlement checks.
- Server boundaries already exist as Next route handlers under `app/api/` and `app/data/`.
- A separate Python research/runtime package exists under `backend/support_resistance` and writes normalized results to Supabase.
- Database history is tracked in `supabase/migrations/001...009`.
- Vercel is the declared web deployment target. Sanity powers content surfaces and requires environment configuration during builds.

The paid dashboard is `app/dashboardv2/page.tsx`, rendering the client workspace in `components/dashboardv2/Dashboard.tsx`. `/dashboard` redirects to `/dashboardv2`. Dashboard modules are selected by internal tabs and deep-linked with `?panel=<id>`; `/support-resistance` demonstrates this by redirecting to `/dashboardv2?panel=supportResistance`.

### Existing Journal overlap

Journal is already registered as a `comingSoon` dashboard tab and widget. `JournalPanel` renders `IntelliJournalModule`, but that module reads generated demo fixtures and is not connected to persistent Journal tables or APIs. It is an accurate placeholder/visual preview, not an implementation of user Journal data.

The production app has no active Journal CRUD routes or Journal database migration. The preview copy references the standalone MVP's capabilities in its text, but those capabilities currently live only in the standalone Journal source.

## 3. Authentication and paid entitlement

### Authentication

IntelliTrade already has complete Supabase authentication infrastructure:

- `lib/supabase/client.ts`: browser client.
- `lib/supabase/server.ts`: cookie-scoped SSR server client.
- `lib/supabase/admin.ts`: service-role server client, isolated from browser code.
- `lib/auth/client.ts`: sign-in, sign-up, sign-out, forgot/reset password, and password update operations.
- `app/auth/*` and `components/auth/*`: login and account flows.
- `lib/supabase/middleware.ts`: cookie/session refresh using `auth.getUser()`.

The standalone Journal login page, sign-out route, root layout, middleware, and Supabase client wrappers must not be copied. Journal handlers and pages must use IntelliTrade's existing session.

### Entitlement

Stripe is the billing source and Supabase is the application-readable entitlement projection:

- Checkout, billing portal, and signed webhook handlers live under `app/api/stripe/`.
- Webhooks upsert the user's `subscriptions` row.
- `active` and `trialing` are accepted paid statuses.
- Middleware protects `/dashboardv2`, `/support-resistance`, `/conflict-map`, and `/currency-strength-meter`.
- Signed-out premium requests go to `/pro`; authenticated but inactive users go to `/upgrade`.
- Premium data APIs call `lib/auth/requireSubscription.ts`, returning 401 or 403 as appropriate.
- The `subscriptions` table has user-scoped SELECT RLS.

Any route below `/dashboardv2` automatically fits the page gate. Every Journal data route must also call `requireSubscription`; page middleware alone is not an API security boundary.

## 4. Supabase, database, and storage

IntelliTrade uses one Supabase project through browser, SSR, and service-role clients. Existing product data includes subscription, calculator-template, market-data, support/resistance, and review-lineage tables. Most market data is server-read through `supabaseAdmin`; user-owned calculator templates use the cookie-scoped client and RLS.

The strongest Journal precedent is `calculator_account_templates`:

- migrations are explicit and reviewable;
- rows carry `user_id`;
- owner reads are protected by RLS;
- mutations require both ownership and an active subscription at RLS and API layers;
- expired-user read semantics are documented rather than accidental.

The standalone Journal schema defines `accounts`, `instruments`, `strategies`, `sessions`, `trades`, `trade_legs`, `risk_markers`, and `reviews`, all with RLS. It assumes a private `journal-screenshots` bucket, stable object paths, and signed URLs. Its SQL does not create the bucket or storage-object policies; those remain environment work.

Do not apply the standalone SQL unchanged. Generic table names and the per-user `instruments` model must be reconciled with IntelliTrade's existing `symbol_mapping` and canonical-symbol conventions. The recommended safe default is namespaced Journal tables and canonical internal asset references, with provider aliases kept in existing mapping/config boundaries.

## 5. Canonical Journal source

Two plausible copies were inspected without modifying source:

1. `historical standalone Journal copy (read-only reference)`
2. `Canonical standalone Journal source (read-only reference; not required at runtime)`

Both contain the same functional Journal implementation and both pass 12 Vitest files / 60 tests. The nested copy is canonical because it contains later source changes dated March 14-18, 2026, including:

- an added `app/page.tsx` redirect to `/journal`;
- later purple brand-token alignment in `app/globals.css`;
- corresponding dashboard chart, page copy, and background-particle updates.

The top-level copy has earlier March 12 teal/violet styling. Neither folder has Git metadata, so file history and content comparison are the available provenance. Neither contains a file named `JOURNAL_TESTING_HANDOFF.md`; testing/launch material is instead in `IntelliJournal_Dev_Handoff_UPDATED.md`, `JOURNAL_PRODUCTION_READINESS.md`, `JOURNAL_LAUNCH_CHECKLIST.md`, and `docs/qa/*`.

Canonical Journal baseline:

- Next.js `14.2.6`, React `18.3.1`, App Router.
- Vitest: 60/60 passing.
- ESLint: passing with no warnings.
- Production build: passing; all expected page and API routes emitted.

## 6. Confirmed Journal feature inventory

The canonical source implements:

- authenticated trade list, pagination, create, detail, top-level edit, and delete;
- account and instrument prerequisites, with optional strategies;
- one-or-more execution legs at creation and full-set leg replacement;
- Zod request validation and typed response/domain helpers;
- realized net statistics, performance summaries, and equity progression from server data;
- reviews with create/update behavior and normalized saved statistics snapshots;
- private screenshot upload, stable storage-path persistence, signed display URLs, and best-effort object cleanup after DB deletion;
- trade CSV/JSON export and review CSV/JSON export with validated date/period parameters;
- loading, not-found, empty, validation, and API error states;
- cookie-backed Supabase auth refresh and user-owned RLS assumptions;
- QA checklists and launch/readiness documentation.

Known behavior that must remain explicit:

- Trade deletion is DB-first and screenshot cleanup is best-effort, not transactional.
- Leg replacement clears then inserts and only attempts a best-effort restore on failure.
- Screenshot deletion/reordering/captions are not implemented.
- Stats are realized-only; no mark-to-market analytics.
- Exports omit screenshot paths/media and do not emit separate leg rows.
- A real account and instrument are required before trade creation; strategy is optional.

## 7. Compatibility assessment

| Area | Finding | Required adaptation |
| --- | --- | --- |
| Framework | Both are Next App Router, but Journal is Next 14/React 18 and IntelliTrade is Next 15/React 19 | Port source patterns, not its package or root configuration; validate React 19 behavior |
| Routing | Dashboard uses `?panel=` tabs; Journal uses standalone `/journal/*` pages | Use `/dashboardv2?panel=journal` as entry and `/dashboardv2/journal/*` for durable complex flows |
| Shell | Journal owns a root shell/login/nav | Render inside IntelliTrade dashboard chrome; do not copy standalone root/auth shell |
| Auth | Both use Supabase SSR | Replace Journal wrappers with IntelliTrade clients and `requireSubscription` |
| Entitlement | Standalone Journal checks auth only | Add paid API checks and rely on existing dashboard middleware for pages |
| Database | Journal SQL uses generic tables and user-owned instruments | Add reviewed, namespaced migrations and canonical asset references |
| Storage | Journal expects a private bucket and policies | Add explicit migration/runbook decisions; never make bucket public |
| API | Both use App Router route handlers | Port handlers into IntelliTrade conventions; retain validation/ownership behavior |
| UI | Standalone custom CSS/React Query/Table/Chart.js; dashboard uses Tailwind/shared components | Rebuild/adapt screens with existing dashboard components; avoid importing a second shell/theme |
| Tests | Both use Vitest; Journal also declares Playwright but no Playwright config/specs were found | Port 60 unit tests, then add route/auth/entitlement and browser integration coverage |

Packages used by the standalone app but not required as a bulk dependency transfer include React Query, TanStack Table, Chart.js wrappers, Day.js, and its older Supabase SSR version. Existing IntelliTrade dependencies should be preferred unless a feature demonstrably requires an additional package.

## 8. Recommended target architecture

- Dashboard entry: `/dashboardv2?panel=journal`.
- Durable child routes: `/dashboardv2/journal/trades/new`, `/dashboardv2/journal/trades/[id]`, `/dashboardv2/journal/reviews`, and `/dashboardv2/journal/exports`.
- Data APIs: `/api/journal/*`, each authenticated through the existing server client and paid-gated through `requireSubscription`.
- Data: additive Supabase migrations under `supabase/migrations`, namespaced tables, owner RLS, and subscription-aware mutation policies.
- Assets: canonical IntelliTrade asset IDs/symbols; provider aliases remain outside the Journal domain schema.
- Storage: private `journal-screenshots`, owner-prefixed object paths, signed URLs, and explicit limits/policies.
- UI: existing dashboard shell, typography, Tailwind tokens, loading/error conventions, and analytics. Preserve the Macro Mastery visual direction without copying standalone global CSS.
- Preview removal: fixture-backed Journal content is removed only when the real read path is ready; `comingSoon` stays true until then.

## 9. Risks and human decisions

Highest risks are schema collision/data migration, RLS or paid-gate regressions, non-transactional leg replacement, screenshot cleanup/privacy, and feature loss while adapting the UI.

Human approval is still required for:

1. Final table names and whether any existing deployed standalone Journal data must migrate.
2. Canonical instrument/asset foreign-key design and account ownership model.
3. Whether lapsed subscribers retain read/export access or lose all Journal access with the dashboard gate.
4. Final child-route UX versus modal/in-panel detail experiences.
5. Screenshot bucket creation, file limits, MIME limits, retention, and storage policies.
6. Whether to preserve the current best-effort mutations for MVP or require transactional RPCs before launch.

## 10. Verification evidence

- IntelliTrade: 406/406 Vitest tests pass; TypeScript passes; Python backend 69/69 tests pass.
- IntelliTrade lint completes with five existing warnings.
- IntelliTrade production build compiles and type-checks, then stops during page-data collection because local `NEXT_PUBLIC_SANITY_PROJECT_ID` is not configured.
- Locked dependency install reports 29 audit findings (3 low, 8 moderate, 18 high); remediation was not attempted in discovery.
- Canonical Journal: 60/60 tests, lint, and production build pass.
- Final Git status must remain clean apart from ignored build/dependency output.

## 11. Exhaustive source trace addendum

The follow-up exhaustive pass enumerated all 104 non-generated files in the canonical Journal and established these verified totals:

| Surface | Verified total |
| --- | ---: |
| User-facing pages, including root and login | 7 |
| HTTP method/path endpoints, including sign-out | 11 |
| User-submittable forms | 9 |
| Production Journal feature components plus shared UI primitives | 14 |
| SQL tables | 8 |
| SQL enums / materialized views / refresh functions / indexes | 4 / 1 / 1 / 15 |
| Calculation and normalization helpers traced | 17 |
| Test files / passing tests | 12 / 60 |
| Exhaustive Feature IDs | 123, including 8 unconfirmed document/reference-only items |

New source-backed findings that affect integration:

- Runtime calculation ignores stored instrument contract size and defaults to `1`.
- Open trades can contribute negative costs to equity; partial trades include matched gross and all costs; over-exited trades classify closed.
- Review snapshots are persisted and intentionally remain distinct from current recomputation until the same period key is saved again.
- The list API has date filters absent from its UI, and the create API accepts screenshot paths absent from its form.
- Screenshot paths are private object keys; signed URL creation is per-path and expires after 3600 seconds.
- The SQL materialized view is unused and formula-incompatible with runtime PnL.
- Several request parsing paths occur outside explicit error handling, so malformed JSON/query behavior needs route-level characterization rather than assumption.
- React Query auth-error retry suppression is unreliable because numeric statuses are lost in browser-facing error messages.
- No route, rendered-component, browser, SQL/RLS, real-Storage, accessibility, or visual automated tests exist in the standalone source.

The authoritative detailed evidence is now split across:

- `JOURNAL_EXHAUSTIVE_FEATURE_INVENTORY.md`: source behavior, states, formulas, failures, limitations, and evidence.
- `JOURNAL_FEATURE_PRESERVATION_CONTRACT.md`: one completion row for every Feature ID.
- `JOURNAL_DEPENDENCY_MAP.md`: page/component/API/helper/data/security/test coupling.
