# IntelliJournal Feature Preservation Contract

## Contract

> IntelliJournal integration is not feature-complete until every confirmed feature ID is either preserved and verified, or explicitly changed with written human approval.

No feature may disappear merely because it is difficult to integrate.

- Canonical standalone baseline: `Canonical standalone Journal source (read-only reference; not required at runtime)` at the source manifest recorded in `JOURNAL_EXHAUSTIVE_FEATURE_INVENTORY.md`.
- A confirmed feature may be marked **Ported into IntelliTrade = Yes** only after equivalent native IntelliTrade behavior exists and its automated parity test passes.
- **Manual parity verified = Yes** additionally requires the relevant manual workflow, security, responsive, or visual check against the standalone baseline.
- `DOC-REF-*` entries are explicitly unconfirmed prototype/document ideas. They are tracked to prevent accidental scope creep, not promised for preservation.
- Statuses are updated as preservation phases establish parity. A partial foundation status does not claim API, persistence, UI, or manual parity.

## Status legend

- **Yes - source/build**: confirmed in canonical source and the clean lint/build baseline.
- **Yes - direct unit**: confirmed in source and exercised directly by a passing standalone unit test.
- **Yes - related unit**: confirmed in source; a passing unit test covers a helper/schema underneath it, but not the complete user workflow.
- **Partial - Phase A foundation**: canonical domain types, schemas, calculations, or normalization have native parity tests; higher application layers remain deferred.
- **No direct test**: confirmed in source but lacks standalone automated coverage at that boundary.
- **N/A - unconfirmed**: documented or visual-reference behavior not implemented in canonical production source.

## Preservation matrix

| Feature ID | Standalone baseline verified | Ported into IntelliTrade | Automated test passes | Manual parity verified | Notes / exact future-proof test |
|---|---|---|---|---|---|
| AUTH-001 | Yes - source/build | Yes - reused native IntelliTrade auth/entitlement | No direct test | No | Add route test asserting `/` redirects to the chosen native Journal entry. |
| AUTH-002 | Yes - source/build | Yes - reused native IntelliTrade auth/entitlement | No direct test | No | Add unauthenticated layout integration test for sanitized `/login?next=` redirect. |
| AUTH-003 | Yes - source/build | Yes - reused native IntelliTrade auth/entitlement | No direct test | No | Add signed-in login-page redirect integration test. |
| AUTH-004 | Yes - source/build | Yes - reused native IntelliTrade auth/entitlement | No direct test | No | Add server-action tests for trim, required fields, provider error, revalidation, and redirect. |
| AUTH-005 | Yes - direct unit | Yes - reused native IntelliTrade auth/entitlement | Yes - direct unit | No | Port redirect sanitizer tests, including `//`, absolute, relative, empty, and internal paths. |
| AUTH-006 | Yes - source/build | Yes - reused native IntelliTrade auth/entitlement | No direct test | No | Add POST sign-out test for provider call and 303 `/login` response. |
| AUTH-007 | Yes - source/build | Yes - reused native IntelliTrade auth/entitlement | No direct test | No | Add middleware tests for matched routes, cookie refresh, and pass-through. |
| AUTH-008 | Yes - source/build | Yes - reused native IntelliTrade auth/entitlement | No direct test | No | Add every-method unauthenticated API tests and cross-user isolation integration tests. |
| AUTH-009 | Yes - direct unit | Yes - reused native IntelliTrade auth/entitlement | Yes - direct unit | No | Port fail-fast tests for URL, anon key, and service-role configuration. |
| NAV-001 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add authenticated shell render test for title, user identity, navigation, and sign-out. |
| NAV-002 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add browser test that overview anchors scroll to existing section IDs. |
| NAV-003 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add route-link test for create, reviews, exports, and trade detail navigation. |
| NAV-004 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add desktop/mobile browser snapshots at both responsive breakpoints. |
| NAV-005 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add browser test for bounded scroll-progress updates and cleanup. |
| NAV-006 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add route-level loading, not-found, and retryable error-boundary tests. |
| DATA-001 | Yes - source/build | Yes - integrated code | No direct test | No | Add QueryClient configuration test for stale time, focus behavior, and retry policy. |
| DATA-002 | Yes - source/build | Yes - integrated code | No direct test | No | Add query integration test for page-key changes, no-store fetch, and error rendering. |
| DATA-003 | Yes - source/build | Yes - integrated code | No direct test | No | Add query integration test for stats key, no-store fetch, and all result states. |
| TRADE-LIST-001 | Yes - source/build | Yes - integrated code | No direct test | No | Add API tests for defaults, page-size clamp, offset/range, count, and response shape. |
| TRADE-LIST-002 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add API integration tests proving inclusive UTC date filters and malformed-query response. |
| TRADE-LIST-003 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical `lib/journal/server.ts` mapping helpers ported to `lib/journal/calculations.ts`; parity covered by `lib/journal/__tests__/calculations.test.ts`. API and UI remain deferred. |
| TRADE-LIST-004 | Yes - source/build | Yes - integrated code | No direct test | No | Add component test for loading, error, empty, and formatted populated rows. |
| TRADE-LIST-005 | Yes - source/build | Yes - integrated code | No direct test | No | Add browser test for disabled bounds and page transitions. |
| TRADE-CREATE-001 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add page integration test for parallel lookup loading and lookup failure. |
| TRADE-CREATE-002 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port missing-account, missing-instrument, and optional-strategy behavior tests. |
| TRADE-CREATE-003 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical create-form defaults ported to `lib/journal/normalization.ts`; parity covered by `lib/journal/__tests__/normalization.test.ts`. Form UI remains deferred. |
| TRADE-CREATE-004 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical create and leg Zod contracts ported to `lib/journal/validation.ts`; parity covered by `lib/journal/__tests__/validation.test.ts`. API enforcement remains deferred. |
| TRADE-CREATE-005 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical create payload normalization ported to `lib/journal/normalization.ts`; trim, null, tag, date, and screenshot behavior have parity tests. Submission workflow remains deferred. |
| TRADE-CREATE-006 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Add component test for add/remove leg behavior and one-leg floor. |
| TRADE-CREATE-007 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add browser/API test for pending lock, errors, success redirect, and query invalidation. |
| TRADE-CREATE-008 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add DB integration test for owner injection, child failure rollback, and rollback failure observability. |
| TRADE-DETAIL-001 | Yes - source/build | Yes - integrated code | No direct test | No | Add route integration test for trade and lookup parallel loading. |
| TRADE-DETAIL-002 | Yes - source/build | Yes - integrated code | No direct test | No | Add component test for all context values and explicit fallbacks. |
| TRADE-DETAIL-003 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add component formatting test for precision, signs, dates, and null placeholders. |
| TRADE-DETAIL-004 | Yes - source/build | Yes - integrated code | No direct test | No | Add component test for chronological legs and empty-leg state. |
| TRADE-DETAIL-005 | Yes - source/build | Yes - integrated code | No direct test | No | Add integrated detail-page upload, gallery, and unavailable-media test. |
| TRADE-DETAIL-006 | Yes - source/build | Yes - integrated code | No direct test | No | Add cross-user test proving missing and inaccessible IDs share the same 404 surface. |
| TRADE-DETAIL-007 | Yes - source/build | Yes - integrated code | No direct test | No | Add error-boundary retry test proving reset reloads the route. |
| TRADE-EDIT-001 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical loaded-trade mapping and local datetime conversion ported to `lib/journal/normalization.ts`; parity covered by `lib/journal/__tests__/normalization.test.ts`. Edit UI remains deferred. |
| TRADE-EDIT-002 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port missing lookup and missing selected-record edit-disable tests. |
| TRADE-EDIT-003 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical strict update schema and payload normalization ported to `lib/journal/validation.ts` and `normalization.ts`; parity tests reject unsupported keys. PATCH route remains deferred. |
| TRADE-EDIT-004 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Add component test for reset, pending lock, validation, and save feedback. |
| TRADE-EDIT-005 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add API tests for empty body, unknown keys, normalization, ownership, 404, and result shape. |
| TRADE-LEGS-001 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical chronological leg-form mapping and fallbacks ported to `lib/journal/normalization.ts`; parity covered by `lib/journal/__tests__/normalization.test.ts`. Leg UI remains deferred. |
| TRADE-LEGS-002 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Add component tests for add/remove controls, one-leg floor, reset, and pending lock. |
| TRADE-LEGS-003 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical replacement schema and leg payload normalization ported to `lib/journal/validation.ts` and `normalization.ts`; boundary parity tests pass. Replacement API remains deferred. |
| TRADE-LEGS-004 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add DB integration test proving replacement is full-set and ownership-scoped. |
| TRADE-LEGS-005 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add forced insert/restore failure tests and verify distinct response paths. |
| TRADE-LEGS-006 | Yes - source/build | Yes - integrated code | No direct test | No | Add API contract test asserting individual leg PATCH/DELETE routes remain absent unless designed. |
| TRADE-DELETE-001 | Yes - source/build | Yes - integrated code | No direct test | No | Add component test requiring explicit checkbox confirmation before delete. |
| TRADE-DELETE-002 | Yes - source/build | Yes - integrated code | No direct test | No | Add DB integration test for owner-scoped delete and child cascades. |
| TRADE-DELETE-003 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add route test for best-effort Storage removal and warning on cleanup failure. |
| TRADE-DELETE-004 | Yes - source/build | Yes - integrated code | No direct test | No | Add browser test for success and storage-warning redirect banners. |
| STATS-001 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add endpoint test proving unpaginated owner-only source selection and no-store response. |
| STATS-002 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical trade aggregation ported to `lib/journal/calculations.ts`; exact weighted average, quantity, cost, partial, open, closed, and over-exit fixtures pass. API remains deferred. |
| STATS-003 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical side/display helpers and deliberately bias-independent arithmetic ported to `lib/journal/calculations.ts`; parity tests pass. Display UI remains deferred. |
| STATS-004 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical open/partial/closed resolution helper ported to `lib/journal/calculations.ts`; boundary and over-exit parity tests pass. API/UI remain deferred. |
| STATS-005 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical dashboard count and closed-net aggregation ported to `lib/journal/calculations.ts`; exact fixture parity tests pass. Dashboard API/UI remain deferred. |
| STATS-006 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical R-multiple and average-R behavior ported to `lib/journal/calculations.ts`; null, zero, negative-risk, partial, and closed parity tests pass. API/UI remain deferred. |
| STATS-007 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical equity timing, ordering, open-cost inclusion, and cumulative calculations ported to `lib/journal/calculations.ts`; parity tests pass. Chart/API remain deferred. |
| STATS-008 | Yes - source/build | Yes - integrated code | No direct test | No | Add component and visual tests for six cards plus chart loading/error/empty/populated states. |
| STATS-009 | Yes - source/build | Yes - integrated code | No direct test | No | Add contract test fixing the deliberate absence of advanced metrics/groupings until specified. |
| REVIEW-001 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add endpoint/page tests for descending start/created sort and no-trades-on-empty optimization. |
| REVIEW-002 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port local Monday-through-Sunday default boundary tests. |
| REVIEW-003 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Add component test for selection population and blank-selection reset. |
| REVIEW-004 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical review-save schema and payload normalization ported to `lib/journal/validation.ts` and `normalization.ts`; schema/payload parity tests pass. Save API/UI remain deferred. |
| REVIEW-005 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add DB integration test for `(user, period, period_start)` update semantics and changed end date. |
| REVIEW-006 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical inclusive UTC filtering and six-field snapshot builder ported to `lib/journal/calculations.ts` and `normalization.ts`; parity tests pass. Review API/UI remain deferred. |
| REVIEW-007 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical stored review-stat normalization ported to `lib/journal/normalization.ts`; object/string, finite numeric string, legacy, unsupported-key, and completeness parity tests pass. Persistence/UI remain deferred. |
| REVIEW-008 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add component test differentiating immutable stored snapshot from recomputed current metrics. |
| REVIEW-009 | Yes - source/build | Yes - integrated code | No direct test | No | Add loading, empty, error, and route-boundary browser tests. |
| SCREENSHOT-001 | Yes - source/build | Yes - integrated code | No direct test | No | Add component test for multi-file picker, selected names, pending lock, and no-file submit. |
| SCREENSHOT-002 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port MIME, zero-byte, 8 MiB inclusive boundary, and oversize tests. |
| SCREENSHOT-003 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port sanitization, fallback, user/trade prefix, and collision-format tests. |
| SCREENSHOT-004 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add auth and cross-user ownership tests before any Storage mutation. |
| SCREENSHOT-005 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add route test for sequential partial upload rollback and rollback-failure observability. |
| SCREENSHOT-006 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add DB failure cleanup plus stable merge/de-duplication integration test. |
| SCREENSHOT-007 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add Storage integration test for private 3600-second signed reads and per-path failure. |
| SCREENSHOT-008 | Yes - source/build | Yes - integrated code | No direct test | No | Add component test for signed image alt text and unavailable fallback. |
| SCREENSHOT-009 | Yes - source/build | Yes - integrated code | No direct test | No | Add contract test for current absence of delete, reorder, captions, count cap, and gallery controls. |
| EXPORT-001 | Yes - source/build | Yes - integrated code | No direct test | No | Add component test for trades/reviews scope and CSV/JSON choices. |
| EXPORT-002 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical local-month defaults and scope-dependent query normalization ported to `lib/journal/normalization.ts`; parity tests pass. Export form/UI remain deferred. |
| EXPORT-003 | Yes - direct unit | Yes - integrated code | Yes - Phase A unit | No | Canonical export query schema and search-parameter mapping ported to `lib/journal/validation.ts` and `normalization.ts`; date, format, and period parity tests pass. Export API remains deferred. |
| EXPORT-004 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add API integration test for inclusive UTC opened filter and ascending order. |
| EXPORT-005 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port exact 22-field trade row/header order and null/array behavior tests. |
| EXPORT-006 | Yes - direct unit | Yes - integrated code | Yes - related unit | No | Add API tests for fully-contained ranges, optional period, and stable two-key ascending sort. |
| EXPORT-007 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port exact 15-field review row/header, normalized snapshot, and unsupported-key tests. |
| EXPORT-008 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port comma/quote/newline escaping, doubled quotes, header-only empty output, and formula-risk test. |
| EXPORT-009 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port two-space JSON, metadata, notes, rows, and empty-result tests. |
| EXPORT-010 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add route/browser test for MIME, no-store, attachment filename, Blob click, and URL revocation. |
| DB-001 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add migration test for all four enum value sets. |
| DB-002 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add schema/RLS tests for account fields, defaults, owner policy, and trade cascade. |
| DB-003 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add schema tests for instrument uniqueness, contract size, metadata, and trade cascade. |
| DB-004 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add schema/RLS tests for strategy ownership and trade `SET NULL`. |
| DB-005 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add schema/RLS tests and explicitly decide whether session workflows are ported. |
| DB-006 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add migration tests for trade fields, defaults, checks, references, and ownership. |
| DB-007 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add migration tests for leg constraints/cascade and decide DB-level nonnegative slippage. |
| DB-008 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add schema/RLS tests and explicitly decide whether risk-marker workflows are ported. |
| DB-009 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add migration tests for review uniqueness, snapshot JSON, fields, defaults, and ownership. |
| DB-010 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add SQL test documenting refresh behavior and reconcile view/runtime PnL formulas before reuse. |
| DB-011 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add migration introspection test for all 15 indexes. |
| DB-012 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add authenticated two-user CRUD tests for all eight tables and child `EXISTS` policies. |
| DB-013 | Yes - source/build | Yes - migration; hosted verification required | No direct test | No | Add injected-failure tests for create, leg replacement, screenshot persistence, and delete cleanup. |
| UI-001 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add computed-style/visual test for font loading and purple dark-theme tokens. |
| UI-002 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add visual snapshots for gradient, glow, grid, and decorative background layers. |
| UI-003 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add visual snapshots for glass cards, borders, shadows, spacing, and hierarchy. |
| UI-004 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add interaction and accessibility tests for 44px controls, focus, hover, pending, and disabled states. |
| UI-005 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add responsive visual tests for table overflow, chart, and 220px screenshot grid. |
| UI-006 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add browser matrix at above/below 1180px and 880px. |
| UI-007 | Yes - source/build | Yes - integrated code; browser/manual verification required | No direct test | No | Add axe, keyboard, focus-order, landmark, table, label, button-type, and image-alt tests. |
| ADMIN-001 | Yes - related unit | Yes - integrated code | Yes - related unit | No | Add command test for env validation, deterministic upsert, idempotent rerun, and failure exit. |
| ADMIN-002 | Yes - direct unit | Yes - integrated code | Yes - direct unit | No | Port fixture determinism, canonical IDs, aliases, and normalized record-shape tests. |
| TEST-001 | Yes - direct unit | Yes - integrated code | Yes - 20 tests | No | Recreate equivalent schema/form unit suite in native IntelliTrade test layers. |
| TEST-002 | Yes - direct unit | Yes - integrated code | Yes - 22 tests | No | Recreate equivalent math/server unit suite and add route/DB integration coverage. |
| TEST-003 | Yes - direct unit | Yes - integrated code | Yes - 18 tests | No | Recreate review/export/upload/auth/env coverage and add browser/security tests. |
| DOC-REF-001 | N/A - unconfirmed | N/A | N/A | N/A | Do not port rich filters/search/result tags without an approved product requirement and tests. |
| DOC-REF-002 | N/A - unconfirmed | N/A | N/A | N/A | Do not port R histograms or advanced analytics without formulas and acceptance fixtures. |
| DOC-REF-003 | N/A - unconfirmed | N/A | N/A | N/A | Do not add mindset, emotion, or rule-adherence data without an approved schema/workflow. |
| DOC-REF-004 | N/A - unconfirmed | N/A | N/A | N/A | Do not add a Rules screen without an approved source of truth and CRUD contract. |
| DOC-REF-005 | N/A - unconfirmed | N/A | N/A | N/A | Treat PDF, settings, and backups as future scope requiring separate security/design review. |
| DOC-REF-006 | N/A - unconfirmed | N/A | N/A | N/A | Existing SQL tables alone do not authorize session or risk-marker product workflows. |
| DOC-REF-007 | N/A - unconfirmed | N/A | N/A | N/A | Individual screenshot management requires a new API, ownership, cleanup, and UI contract. |
| DOC-REF-008 | N/A - unconfirmed | N/A | N/A | N/A | `test:ui` is only a script declaration; create and pass a real browser suite before claiming it. |

## Completion rule

## Integrated Status Summary

| Category | Code-side status | Remaining verification |
|---|---|---|
| Domain types, validation, calculations, normalization, exports, uploads, and repository mappings | Ported with native Vitest coverage | Review exact outputs when canonical behavior changes |
| Trade CRUD, full-set legs, reviews, statistics, lookups, screenshots, and export APIs | Ported behind native paid entitlement and RLS-compatible clients | Configured API/browser runs against local Supabase |
| Dashboard panel and full Journal workflows | Ported and enabled under `/dashboardv2/journal` | Responsive, accessibility, and end-to-end browser parity |
| Database, RLS, transaction RPCs, and private Storage policy definitions | Version-controlled in migration `010_intellijournal.sql` | Apply and verify against hosted Supabase with two users |
| Baseline quirks | Intentionally unchanged and documented | Human approval required before changing formulas/contracts |
| `DOC-REF-*` ideas | Not implemented | Separate product approval remains required |

The 115 confirmed Feature IDs remain individually listed above. `Ported into IntelliTrade`
describes code presence, while the automated and manual columns remain authoritative about the
verification level; a code status does not convert a missing browser or hosted check into a pass.

The Journal port is feature-complete only when every non-`DOC-REF` row is either:

1. `Ported into IntelliTrade = Yes`, with a passing automated parity test and required manual verification; or
2. explicitly waived in an approved architecture/product decision that names the behavior change, migration impact, rollback path, and replacement test.

Prototype/document-only `DOC-REF-*` rows must remain `N/A` unless separately promoted into approved scope.
