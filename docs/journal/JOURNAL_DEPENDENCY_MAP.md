# IntelliJournal Dependency Map

## Scope and legend

- Canonical source: `Canonical standalone Journal source (read-only reference; not required at runtime)`.
- This map describes the confirmed standalone implementation; it is not a proposed IntelliTrade architecture.
- Feature IDs refer to `JOURNAL_EXHAUSTIVE_FEATURE_INVENTORY.md` and preservation status is governed by `JOURNAL_FEATURE_PRESERVATION_CONTRACT.md`.
- `UI -> API -> helper -> table/service` denotes a runtime dependency. Test dependencies are listed separately.

## System boundary

```text
Browser
  -> Next App Router pages and client forms
     -> React Query/browser API wrapper OR server page helper
        -> authenticated cookie-scoped Supabase client
           -> PostgreSQL tables protected by RLS
           -> private Storage bucket for screenshots

Seed CLI
  -> service-role Supabase client
     -> deterministic demo fixtures
        -> PostgreSQL tables (bypasses normal cookie/RLS path)
```

Normal Journal runtime does not use the service-role client. `lib/supabase/client.ts` supplies a browser client but no production Journal component imports it. The private Storage bucket and policies are deployment prerequisites and are not created by `sql/journal_schema.sql`.

## Route-to-dependency map

| Route | Rendered component/action | Internal dependencies | External/data dependencies | Feature IDs |
|---|---|---|---|---|
| `/` | Server redirect | Next `redirect('/journal')` | None | AUTH-001 |
| `/login` | Login page and `login` server action | `normalizeAuthRedirectPath`; `requireAuthenticatedUser`; `createSupabaseServerClient` | Supabase Auth password sign-in | AUTH-003, AUTH-004, AUTH-005 |
| `/auth/signout` POST | Route handler | `createSupabaseServerClient` | Supabase Auth sign-out | AUTH-006 |
| `/journal/*` layout | Auth guard | `requireAuthenticatedUser`; `DEFAULT_AUTH_REDIRECT` | Supabase Auth `getUser` | AUTH-002, AUTH-008 |
| `/journal` | `JournalShell`, `Dashboard`, `TradesTable` | navigation config; UI primitives; `getJournalStats`; `getJournalList`; React Query | stats/list APIs | NAV-001..005, DATA-001..003, TRADE-LIST-001..005, STATS-001..009 |
| `/journal/trades/new` | `AddTradeForm` | `getTradeFormLookups`; create-form normalization; prerequisite helper; schemas; browser API | `accounts`, `instruments`, `strategies`; create API | TRADE-CREATE-001..008 |
| `/journal/trades/[id]` | Detail display plus edit, leg, screenshot, delete forms | `getTradeDetailById`; `getTradeFormLookups`; mapping/form/upload helpers; route boundaries | `trades`, references, legs, signed Storage URLs; detail/mutation APIs | TRADE-DETAIL-001..007, TRADE-EDIT-001..005, TRADE-LEGS-001..006, TRADE-DELETE-001..004, SCREENSHOT-001..009 |
| `/journal/reviews` | `ReviewSaveForm` plus stored/current snapshot display | `getJournalReviews`; review normalization/form helpers; browser API | `reviews`; trades only when needed; review API | REVIEW-001..009 |
| `/journal/exports` | `ExportRequestForm` | export form/query/file helpers; browser API | export API and browser Blob URL | EXPORT-001..010 |

## HTTP dependency map

| Endpoint | Validation/auth/helper chain | Reads | Writes / side effects | Principal feature IDs |
|---|---|---|---|---|
| `GET /api/journal` | `TradeQuerySchema` -> auth -> query filters -> `mapTradeList` | `trades`, `trade_legs`, account/instrument/strategy relations | None | AUTH-008, TRADE-LIST-001..003 |
| `POST /api/journal` | JSON -> `CreateTradeSchema` -> auth -> owned-reference assertion -> payload mappers | `accounts`, `instruments`, optional `strategies` | Insert `trades`, then `trade_legs`; best-effort trade rollback | AUTH-008, TRADE-CREATE-004, TRADE-CREATE-005, TRADE-CREATE-008, DB-013 |
| `GET /api/journal/[id]` | auth -> `getTradeDetailById` -> `mapTradeDetail` | trade, legs, references; Storage signed URL per screenshot path | Signed URL creation only | TRADE-DETAIL-001..006, SCREENSHOT-007..008 |
| `PATCH /api/journal/[id]` | JSON -> strict `UpdateTradeSchema` -> auth -> `getTradeUpdatePayload` | Owner-visible trade | Update supported `trades` columns | TRADE-EDIT-003..005 |
| `DELETE /api/journal/[id]` | auth -> `deleteTradeWithScreenshotCleanup` | Screenshot paths and owner-visible trade | Delete trade/children, then best-effort Storage removal | TRADE-DELETE-002..004, DB-013 |
| `PUT /api/journal/[id]/legs` | JSON -> `ReplaceTradeLegsSchema` -> auth -> `replaceTradeLegsForTrade` | Existing owner-visible legs | Delete all legs, insert replacement, best-effort restore | TRADE-LEGS-003..005, DB-013 |
| `POST /api/journal/[id]/screenshots` | multipart -> auth/ownership -> upload validators/path builders | Owner-visible trade and existing screenshot paths | Sequential Storage uploads, update trade paths, compensating cleanup | SCREENSHOT-001..007, DB-013 |
| `GET /api/journal/stats` | auth -> `getJournalDashboardStats` -> stats mapper/math | Full owner-visible trade set and legs | None | STATS-001..007 |
| `POST /api/journal/reviews` | JSON -> `ReviewSaveSchema` -> auth -> `saveJournalReview` | Owner trades in review range; existing review key | Insert or update `reviews` | REVIEW-004..007 |
| `GET /api/journal/exports` | query -> `JournalExportQuerySchema` -> auth -> scope-specific mapper/serializer | Owner trades or reviews | Attachment response only | EXPORT-003..010 |

## Component dependency map

| Component | Depends on | Calls/emits | Primary states and coupling |
|---|---|---|---|
| `JournalShell` | navigation items; `BackgroundParticles`; `GlassPanel`; `TopProgressBar` | links and sign-out form | Shared layout, sticky/responsive nav, authenticated identity |
| `Dashboard` | React Query; Chart.js; `getJournalStats`; UI primitives | `GET /api/journal/stats` | Six metric cards and equity chart share one stats response |
| `TradesTable` | React Query; TanStack Table; `getJournalList`; types | `GET /api/journal?page=`; detail links | Pagination state is the query key; table formatting depends on server-derived rows |
| `AddTradeForm` | create-form helper; prerequisite helper; types; `createTrade` | `POST /api/journal`; router refresh/navigation | Lookup availability gates submit; dynamic legs share top-level validation |
| `TradeEditForm` | update-form helper; prerequisite helper; `updateTrade` | `PATCH /api/journal/[id]`; router refresh | Reset is coupled to server-loaded trade and lookup state |
| `TradeLegEditForm` | leg-form helper; `replaceTradeLegs` | `PUT /api/journal/[id]/legs`; router refresh | Whole-list edit and one-leg minimum; no individual leg identity workflow |
| `TradeScreenshotUploadForm` | browser upload API | multipart `POST /screenshots`; router refresh | Selection/pending state; persistence completion depends on Storage plus DB |
| `TradeDeleteForm` | `deleteTrade`; UI primitives | `DELETE /api/journal/[id]`; redirect | Explicit confirmation; DB deletion precedes Storage cleanup |
| `ReviewSaveForm` | review helpers; types; `saveReview` | `POST /api/journal/reviews`; router refresh | Selected stored review, form values, and recalculated current snapshot are distinct |
| `ExportRequestForm` | export helpers; `downloadJournalExport` | `GET /api/journal/exports`; Blob download | Scope changes validation and period availability; filename also comes from response header |
| `JournalScaffoldPanel` | navigation; UI primitives | route links | Shared route framing only; no data access |
| `GlassPanel` | `clsx` | polymorphic styled surface | Shared visual hierarchy across every Journal page |
| `SectionHeader` | React types | headings/eyebrows/actions | Shared semantic and visual section labeling |
| `TopProgressBar` | browser scroll events | inline transform style | Client-only global scroll coupling |
| `BackgroundParticles` | CSS classes | decorative markup | Global atmospheric layer, hidden from assistive tech |

## Data and ownership map

| Entity/service | Upstream writers | Downstream readers | Ownership/security boundary | Feature IDs |
|---|---|---|---|---|
| `accounts` | seed/admin or external setup | create/edit lookups; list/detail/export relation | Direct `user_id = auth.uid()` RLS | DB-002, TRADE-CREATE-001..002 |
| `instruments` | seed/admin or external setup | create/edit lookups; trade math metadata/detail/export | Authenticated read policy; canonical asset identity is external to standalone app | DB-003 |
| `strategies` | seed/admin or external setup | optional create/edit lookup; detail/export relation | Direct owner RLS | DB-004 |
| `sessions` | seed/admin only in current app | No production UI/API consumer | Direct owner RLS | DB-005, DOC-REF-006 |
| `trades` | create/update/delete APIs; seed | all Journal workflows | Direct owner RLS; references account/instrument/strategy | DB-006 |
| `trade_legs` | create and full replacement APIs; seed | detail/list/stats/reviews/exports | Parent-owner `EXISTS` RLS; cascade on trade delete | DB-007 |
| `risk_markers` | seed/admin only in current app | No production UI/API consumer | Parent-account-owner `EXISTS` RLS | DB-008, DOC-REF-006 |
| `reviews` | review save API; seed | reviews page and exports | Direct owner RLS; unique period key | DB-009 |
| `journal_trade_stats` view | manual refresh function | No production runtime consumer | SQL has no explicit RLS/grant policy; formula differs from runtime | DB-010 |
| `journal-screenshots` bucket | screenshot upload route | detail signed reads; trade delete cleanup | Expected private bucket and owner-prefix Storage policies are deployment-only | SCREENSHOT-003..008 |

## Calculation-to-output map

| Calculation/helper | Inputs | Outputs / consumers | Important coupling and edge behavior | Feature IDs |
|---|---|---|---|---|
| `aggregateTrade` | legs, bias, optional contract size | quantity, weighted entries/exits, fees, slippage, gross/net, remaining position | Runtime callers use default contract size `1`; `instrument.contract_size` is not passed. Bias does not alter arithmetic. | STATS-002, STATS-003 |
| `rMultiple` | net PnL, risk amount | nullable R | Null/zero risk returns null; negative risk is currently accepted | STATS-006 |
| `normalizeLegs` and side/entry/exit helpers | nested legs | chronological/derived list fields | Buy/sell interpretation and missing-side fallbacks feed list/detail/export | TRADE-LIST-003, TRADE-DETAIL-003..004 |
| `getTradeResolution` | matched and remaining quantities | open/partial/closed | Over-exited positions are classified closed | STATS-004 |
| `mapTradeList` | trade records and relations | paginated table rows | Shares aggregate/resolution/R rules with stats | TRADE-LIST-003 |
| `buildJournalDashboardStats` | full trade records | six counts/metrics and equity curve | Closed-only net; average R includes partial and closed resolved trades | STATS-005..008 |
| `buildEquityCurve` | per-trade timestamp and net PnL | ascending cumulative points | Includes open-trade costs; no rounding; timestamp fallback is close, final exit, then open | STATS-007 |
| `filterTradeStatsRecordsByPeriod` | trade records and UTC date bounds | period subset | Filters by `opened_at`, inclusive | REVIEW-006 |
| `buildCurrentReviewStatsSnapshot` | period-filtered trades | six current snapshot fields | Uses dashboard stats semantics | REVIEW-006, REVIEW-008 |
| `normalizeStoredReviewStats` | object or JSON-string snapshot | supported values, unsupported keys, notes, completeness | Supports legacy `trades`; finite numeric strings are accepted | REVIEW-007 |
| `mapTradeExportRows` | trade records | exact 22-column row | Reuses resolution and PnL/R derivation | EXPORT-004..005 |
| `mapReviewExportRows` | review records | exact 15-column row | Reuses stored snapshot normalization | EXPORT-006..007 |
| `mapTradeDetail` | one nested trade record | detail API response | Creates per-path signed screenshot state separately | TRADE-DETAIL-001..005 |

## Validation and normalization dependencies

| Boundary | Schema/helper | Consumers | Preserved distinctions |
|---|---|---|---|
| Create trade | `CreateTradeSchema`; create-form helpers; insert payload mappers | Add form and `POST /api/journal` | Form normalizes trims/nulls/tags/local date; API accepts schema-valid direct callers independently |
| Update trade | strict `UpdateTradeSchema`; update-form and update-payload helpers | Edit form and PATCH route | Unknown keys including legs/screenshots are rejected; empty update is rejected |
| Replace legs | `ReplaceTradeLegsSchema`; leg-form mapper | Leg form and PUT route | At least one leg; positive quantity/price; nonnegative fee/slippage; offset datetime |
| Review save | `ReviewSaveSchema`; review form/persistence helpers | Review form and POST route | ISO date-only strings; end not before start; blank notes become null |
| Export | `JournalExportQuerySchema`; export query helpers | Export form and GET route | Trades ignore period; reviews may filter period; date range required and ordered |
| List query | `TradeQuerySchema`; `applyTradeListFilters` | GET list route | Page/limit and date filters; UI currently only emits page |
| Screenshot | upload validators/path/name helpers | Screenshot route and form | PNG/JPEG/WebP; nonempty; max 8 MiB each; no count cap |
| Auth redirect | `normalizeAuthRedirectPath` | login page/action and Journal guard | Internal absolute paths only; fallback `/journal` |

## Test-to-feature map

| Test file | Passing tests | Main feature coverage | Missing boundary coverage |
|---|---:|---|---|
| `lib/journal/createTradeForm.test.ts` | 3 | TRADE-CREATE-003..005 | Rendered form, route, DB transaction |
| `lib/journal/exports.test.ts` | 5 | EXPORT-002..009 | Route headers, browser download, DB selection |
| `lib/journal/lookupPrerequisites.test.ts` | 2 | TRADE-CREATE-001..002, TRADE-EDIT-002 | Page lookup query and rendered errors |
| `lib/journal/reviews.test.ts` | 7 | REVIEW-002..008 | Route, database, rendered page |
| `lib/journal/server.test.ts` | 16 | list/detail/stats/review/export/server mappings and compensation helpers | Real Supabase, route status/error handling, RLS |
| `lib/journal/tradeLegEditForm.test.ts` | 3 | TRADE-LEGS-001..003 | Rendered controls and replacement route |
| `lib/journal/updateTradeForm.test.ts` | 3 | TRADE-EDIT-001..005 | Rendered form and PATCH route |
| `lib/journal/uploads.test.ts` | 5 | SCREENSHOT-002..007 | Multipart route, real Storage, signed reads |
| `lib/supabase/auth.test.ts` | 2 | AUTH-005 | Login action, route guards, middleware, sign-out |
| `lib/supabase/env.test.ts` | 2 | AUTH-009 | Deployment wiring |
| `lib/trades/math.test.ts` | 3 | STATS-002, STATS-006 | Broader partial/open/short/contract-size matrix |
| `lib/validation/schemas.test.ts` | 9 | create/update/legs/review/export/list validation | HTTP malformed JSON/query behavior |

There are 60 passing tests across 12 files. There are no route-handler, rendered-component, browser/E2E, SQL migration, RLS, real Storage, accessibility, or visual-regression tests. `npm run test:ui` references Playwright, but no Playwright configuration or specs exist.

## High-coupling and migration-risk points

1. **Shared arithmetic:** list rows, dashboard stats, review snapshots, detail metrics, and exports converge on the same PnL/resolution/R helpers. A formula change can alter five user-visible surfaces and persisted review snapshots.
2. **Contract-size omission:** instrument data stores `contract_size`, but runtime aggregation defaults to `1`. Porting the database field into arithmetic without an explicit compatibility decision changes historical values.
3. **Persisted snapshots:** review auto-stats are stored JSON, normalized across current and legacy keys, and intentionally differ from newly recomputed current stats until resave.
4. **RLS as ownership enforcement:** handlers often rely on owner-scoped visibility instead of explicit authorization branches. A schema/client migration can turn privacy-safe 404 behavior into leakage or broad access.
5. **Non-atomic writes:** trade creation, leg replacement, screenshot upload/persistence, and delete/Storage cleanup use compensation rather than one cross-service transaction.
6. **Private media:** stored values are bucket paths, not public URLs. Detail rendering depends on short-lived signed URLs and deployment-managed bucket policies.
7. **Lookup prerequisites:** account and instrument records are mandatory before trade creation; strategy is optional. The app has no user-facing setup workflow for those mandatory records.
8. **API/UI capability mismatch:** the list API supports date filters the UI does not expose, while create API schema permits `screenshot_urls` even though the form sends none.
9. **Query retry mismatch:** client retry suppression checks error-message text for `401`/`403`, while the API wrapper converts those statuses into prose, so auth failures can be retried.
10. **SQL/runtime divergence:** the unused materialized view omits slippage and does not mirror matched-quantity runtime logic; it must not silently replace runtime calculations.
11. **Export compatibility:** exact field order, null representation, array joining, escaping, filename, MIME, and sort/filter semantics are externally observable contracts.
12. **Visual shell:** shared primitives and global CSS make theme/responsive changes cross-cutting. The reference JSX is not a runtime dependency and contains prototype-only imports and features.

## Recommended native integration seams

These are boundaries to preserve during later implementation, not authorization to begin the port:

- Keep provider/auth/storage adapters outside normalized Journal domain models.
- Establish one tested normalized trade/leg domain and one canonical calculation layer before wiring pages or endpoints.
- Preserve canonical internal IntelliTrade asset IDs; translate provider symbols only through existing alias/config infrastructure.
- Use transactional database operations where possible and explicit idempotent compensation where Storage crosses the DB boundary.
- Preserve route/API behavior through native IntelliTrade orchestration rather than embedding standalone Next/Supabase architecture wholesale.
- Gate each migrated capability with its contract row, automated parity fixture, rollback plan, and manual security/visual check.
