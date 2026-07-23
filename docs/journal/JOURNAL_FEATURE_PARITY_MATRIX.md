# IntelliJournal Feature Parity Matrix (Corrected)

## Scope

Source application: `Canonical standalone Journal source (read-only reference; not required at runtime)`  
Integration target: `repository root` at `f327cd1cbed06cc04ecd12e2cca62e449e107cff`

This matrix is the acceptance ledger for integration. A row is not complete until its verification method passes against IntelliTrade. "Reusable" means behavior and tests are reusable; it does not authorize copying the standalone app shell, auth, middleware, or configuration.

| Feature | Current Journal implementation | IntelliTrade integration target | Required adaptation / status | Risk | Verification method |
| --- | --- | --- | --- | --- | --- |
| Dashboard entry | Standalone `/journal` overview | `/dashboardv2?panel=journal` | Requires UI-shell adaptation; keep `comingSoon` until real data is ready | Medium | Paid user opens deep link; correct tab selected; no fixture data |
| Durable Journal routes | `/journal/trades/*`, `/journal/reviews`, `/journal/exports` | `/dashboardv2/journal/*` | Reusable with path/import changes | Medium | Route tests plus direct navigation/browser checks |
| Trade list | Authenticated, paginated server-backed list | Native Journal panel/page | Requires auth, API, and UI adaptation | High | User-owned rows only; pagination and empty states tested |
| Trade creation | Validated trade plus one or more legs | `/dashboardv2/journal/trades/new` | Requires database/API/UI adaptation | High | Route tests, validation tests, RLS test, browser happy/error paths |
| Account lookup | User-owned `accounts` query | Journal account model in production Supabase | Requires database decision | High | Two-user RLS test and missing-account UI test |
| Instrument lookup | User-owned `instruments` query | Canonical IntelliTrade asset IDs and provider aliases | Requires database adaptation; do not embed symbols | High | Canonical mapping contract tests and invalid-reference rejection |
| Strategy lookup | Optional user-owned `strategies` query | Namespaced Journal strategies | Requires database/API adaptation | Medium | No-strategy flow remains usable; foreign-user strategy rejected |
| Missing prerequisites | Accounts/instruments block honestly; strategies optional | Native add-trade screen | Reusable with UI adaptation | Medium | Unit and browser tests for every prerequisite combination |
| Execution legs on create | One-or-more typed legs inserted after trade | Journal trade API | Requires API/database adaptation | High | Multi-leg create tests; rollback/failure behavior documented |
| Trade detail | Trade, legs, derived values, screenshots | `/dashboardv2/journal/trades/[id]` | Reusable with shell/import changes | Medium | Owner success, non-owner not-found, loading/error tests |
| Top-level trade editing | PATCH excludes legs/screenshots | Journal item API | Reusable with auth/database adaptation | Medium | Allowed-field and forbidden-field route tests |
| Full leg replacement | Delete-all then insert; best-effort restore | Dedicated Journal legs API | Requires API adaptation; transactional RPC is preferred | High | Success, delete failure, insert failure, restore failure tests |
| Trade deletion | DB delete then best-effort screenshot cleanup | Journal item API | Requires API/storage adaptation | High | No-media, cleanup success, cleanup warning, non-owner tests |
| Request validation | Zod schemas for mutations and export queries | Shared Journal domain module | Directly reusable with import/test changes | Low | Port all schema tests; malformed payload route tests |
| API error handling | Typed helpers and explicit status/error payloads | Next 15 route handlers | Requires API adaptation | Medium | 400/401/403/404/409/500 response contract tests |
| Journal overview | KPI cards, recent trades, equity chart | Real dashboard Journal panel | Requires UI-shell and data adaptation | Medium | Snapshot/DOM tests with populated and empty data |
| Realized statistics | Server computes realized net metrics from all user trades | `/api/journal/stats` | Reusable with auth/API adaptation | High | Port math/server tests and verify user isolation |
| Equity progression | Derived realized equity series | Dashboard chart using existing chart stack | Reusable logic; replace Chart.js if existing stack suffices | Medium | Deterministic fixture tests and visual/browser check |
| Empty states | No-trade/review/export states | Shared dashboard states | Reusable with design-system adaptation | Low | Component tests and manual responsive QA |
| Loading states | App Router loading files and client pending states | Dashboard panel and nested routes | Requires route/shell adaptation | Low | Suspense/navigation browser checks |
| Not-found behavior | Trade detail `not-found.tsx` | Nested dashboard trade route | Reusable with shell adaptation | Low | Missing and foreign-owned IDs return safe not-found |
| Review load/history | User-owned reviews sorted by period | `/dashboardv2/journal/reviews` | Requires database/API/UI adaptation | Medium | Empty/history tests and two-user isolation |
| Review save/update | Upsert-like period key behavior | `/api/journal/reviews` | Requires API/database adaptation | High | Create and update tests; uniqueness conflict test |
| Saved stats snapshots | Normalized realized snapshot persisted with review | Namespaced review table | Reusable with schema adaptation | Medium | Round-trip and legacy/unknown-key normalization tests |
| Screenshot upload | Private bucket, validated file, stable path stored | `/api/journal/[id]/screenshots` | Requires storage and entitlement setup | High | MIME/size/path/owner tests plus deployed bucket QA |
| Screenshot paths | `journal/{userId}/trades/{tradeId}/...` | Private `journal-screenshots` bucket | Reusable subject to policy approval | High | Assert path prefix; cross-user policy denial |
| Signed screenshot display | Signed URL generated at read time | Trade detail data boundary | Reusable with IntelliTrade server client | High | No public URL persisted; expiry/display tests |
| Screenshot cleanup | Best-effort remove after DB delete | Journal delete API | Requires explicit MVP acceptance or transactional redesign | High | Simulated storage failure returns warning without false success |
| Trade CSV export | Authenticated date-scoped trade-level CSV | `/api/journal/exports` | Requires auth/API adaptation | Medium | Header/order/escaping/date/empty tests |
| Trade JSON export | Typed document; media and separate legs excluded | `/api/journal/exports` | Reusable with path/auth changes | Low | Contract snapshot and exclusion tests |
| Review CSV/JSON export | Persisted snapshots with period/date filters | `/api/journal/exports` | Reusable with database/auth changes | Medium | Format/filter/empty/invalid-query tests |
| Export validation | Format/resource/date/period validation | Journal export route | Directly reusable with test adaptation | Low | Port all export validation tests |
| Authentication | Standalone Supabase login/session | Existing IntelliTrade Supabase auth | Requires auth adaptation; do not copy login/logout | High | Existing auth tests plus Journal 401 tests |
| Session refresh | Standalone middleware | Existing `lib/supabase/middleware.ts` | Use existing implementation unchanged where possible | High | Session refresh regression tests |
| Page protection | Standalone `/journal` auth gate | Existing premium `/dashboardv2` middleware prefix | Requires route placement only | Medium | Signed-out -> `/pro`; inactive -> `/upgrade`; paid -> Journal |
| API entitlement | Standalone checks authentication only | `requireSubscription()` on every mutation/read API | New paid adaptation required | Critical | 401/403/allowed matrix for every Journal handler |
| Row ownership | `user_id`, cookie client, RLS | Existing cookie-scoped client plus new RLS | Reusable principle; migration-specific policies required | Critical | Two-user SQL/API test; no service-role CRUD path |
| Service role | Only admin demo seeding | Existing server-only admin client | Keep out of user Journal CRUD | Critical | Static import review and tests proving cookie client usage |
| Database tables | Generic standalone table names | Additive, namespaced production migrations | Requires database adaptation and human approval | Critical | Migration review, clean apply, idempotency/rollback rehearsal |
| Subscription-aware RLS | Not present in standalone Journal | Match calculator-template defense-in-depth pattern | New entitlement adaptation required | Critical | Active/trialing mutation allowed; inactive denied |
| Screenshot bucket/policies | Documented but not created by Journal SQL | Production Supabase storage migration/runbook | Blocked pending human environment setup | Critical | Deployed two-user upload/sign/remove policy checks |
| Environment access | Centralized Journal env helper | Existing IntelliTrade env/client modules | Use current variables; do not add duplicate wrappers | Medium | Missing-env tests; no secrets in client bundle |
| Standalone shell/theme | Root layout, custom global CSS, sticky Journal nav | Existing dashboard chrome and design tokens | Requires UI-shell adaptation; do not copy globally | Medium | Header/nav duplication absent; responsive visual QA |
| Responsive behavior | Journal desktop/mobile layouts | Dashboard panel plus nested routes | Requires UI adaptation | Medium | Browser tests at mobile/tablet/desktop breakpoints |
| Unit tests | 12 files, 60 tests | IntelliTrade Vitest suite | Requires path/auth/mock adaptation; preserve all behavior coverage | High | 60 mapped tests plus existing 406 tests pass |
| Browser tests | `test:ui` script declared; no config/specs found | New IntelliTrade Playwright coverage if adopted | Requires new test infrastructure or approved manual equivalent | Medium | Paid-user CRUD/review/upload/export end-to-end suite |
| QA documentation | Eight QA checklists plus launch/readiness docs | IntelliTrade deployment runbook | Reusable with route/auth/environment updates | Low | Checklist review and staging sign-off |
| Rollback safety | Best-effort notes documented | Additive migration and feature flag/`comingSoon` gate | Requires implementation discipline | High | Rollback rehearsal; disabling panel does not destroy data |

## Baseline gates

Before a parity row can be marked complete:

1. Existing IntelliTrade checks remain at least 406 Vitest tests, passing typecheck, and 69 Python tests.
2. The five existing lint warnings are not increased.
3. All 60 standalone Journal test behaviors are mapped to production tests; test filenames need not remain identical.
4. The production build is rerun with required Sanity and Supabase environment variables configured.
5. RLS and private-storage verification is performed with at least two real test users.
6. Fixture-backed Journal data is never presented as the signed-in user's real data.

## Non-features that must not be invented during parity work

The standalone Journal does not provide unrealized mark-to-market analytics, screenshot gallery management, separate leg-row exports, transactional leg replacement, or transactional DB/storage deletion. Those are backlog or explicit pre-launch decisions, not silent parity requirements.

## Exhaustive-discovery addendum (2026-07-22)

`JOURNAL_EXHAUSTIVE_FEATURE_INVENTORY.md` and its 123 Feature IDs now supersede this higher-level matrix as the complete behavior ledger. `JOURNAL_FEATURE_PRESERVATION_CONTRACT.md` is the authoritative row-by-row completion gate; no row in this summary can close a more granular contract item by implication.

The exhaustive trace adds these mandatory parity decisions and checks:

1. Runtime PnL currently calls `aggregateTrade` with contract size `1`; stored `instruments.contract_size` is not used. Changing that during the port is a behavior change, not a transparent fix.
2. The list API supports inclusive `from`/`to` filters that the standalone UI does not expose. Preserve the API contract independently from the visible list controls.
3. Direct create-API callers can submit schema-valid `screenshot_urls`, although the create form always sends none. Decide whether to preserve or close this input before freezing the native API.
4. The unused materialized SQL stats view does not match runtime calculations: it omits slippage and does not use the runtime matched-quantity algorithm. It must not become the production calculation source without reconciliation and fixtures.
5. React Query retry suppression inspects error-message text for `401`/`403`, while the browser API wrapper converts those statuses to prose. Native error types must retain status codes so auth failures are not retried accidentally.
6. The 60 passing standalone tests are helper/schema units, not 60 full workflow guarantees. Route handlers, rendered components, browser flows, SQL/RLS, real Storage, accessibility, and visual parity have no standalone automated coverage and require new tests.
