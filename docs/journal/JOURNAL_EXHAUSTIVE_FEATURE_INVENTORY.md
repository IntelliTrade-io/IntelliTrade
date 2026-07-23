# IntelliJournal Exhaustive Feature Inventory

## Authority and baseline

- Canonical source: `Canonical standalone Journal source (read-only reference; not required at runtime)`
- Compared newer copy evidence: March 14-18, 2026 root redirect and purple-token source changes are present.
- Analysis date: 2026-07-22.
- Source manifest: 104 files excluding `node_modules` and `.next`; combined SHA-256 at analysis start: `FC60614ABF46CD565CD28BA2FA256185B5E53A442BBD3AE71E14FB89C4B90409`.
- Baseline: 12 Vitest files, 60/60 tests pass; lint passes with no warnings; Next 14.2.6 production build passes and emits 14 App Router routes.
- Baseline warning: Vitest reports that the CommonJS build of Vite's Node API is deprecated.
- No runtime environment was exercised. Auth, RLS, database, and Storage behavior still require a configured Supabase environment.

This document is the primary feature-parity source. Historical docs are evidence of intent only when current source confirms them.

## Record field convention

Every permanent-ID row below contains the required record fields in grouped columns:

- `Role / trigger / preconditions` covers user role, trigger, and preconditions.
- `Behavior / inputs / validation` covers description, inputs, and validation.
- `Output / loading / empty / failure` covers output and observable states.
- `Security / data impact` covers auth, ownership, RLS, tables, columns, or storage.
- `Evidence / tests` contains exact source and test evidence.
- `Integration / preservation / verification` states dependency, invariant, and acceptance method.
- `Status` is `Confirmed`, `Implemented but not directly tested`, or `Documented but not confirmed in implementation`.

## Complete source map

### User-facing routes

| Route | Purpose and access | Server/client behavior and dependencies | Observable states/actions | Feature IDs |
| --- | --- | --- | --- | --- |
| `/` | Public root; immediately redirects | Server `redirect('/journal')` | No rendered UI | AUTH-001 |
| `/login` | Minimal email/password entry; signed-in users redirect | Server resolves user; server action signs in; `next` is sanitized | Required fields, provider error shown, secure-access copy | AUTH-003 through AUTH-005 |
| `/journal` | Authenticated overview | Server shell plus client stats/list queries | Delete-result banner, KPIs, chart, table, roadmap copy | NAV-001, DATA-001 through TRADE-LIST-005, STATS-001 through STATS-009 |
| `/journal/trades/new` | Authenticated create flow | Server loads lookup rows; client form posts API | Lookup failure, prerequisite blocks, validation, pending, cancel, redirect | TRADE-CREATE-001 through TRADE-CREATE-008 |
| `/journal/trades/[id]` | Authenticated detail/edit/legs/media/delete | Server loads trade, lookups, signed URLs; client mutation forms | Loading, privacy-preserving not-found, retryable error, reset/success/failure states | TRADE-DETAIL-001 through TRADE-DELETE-004, SCREENSHOT-001 through SCREENSHOT-009 |
| `/journal/reviews` | Authenticated review list/save | Server loads reviews and current trade context; client save form | Loading, empty, load error, create/update feedback | REVIEW-001 through REVIEW-009 |
| `/journal/exports` | Authenticated export request UI | Static server page plus client download form | Validation, pending, success filename, request error | EXPORT-001 through EXPORT-010 |

`app/journal/layout.tsx` protects every `/journal/*` page. `/journal/loading.tsx`, review loading, and trade-detail loading/error/not-found files are route-specific boundaries.

### HTTP endpoints

There are 8 route paths and 11 HTTP method endpoints when sign-out is included.

| Method and path | Input / output | Auth and failure behavior | Feature IDs |
| --- | --- | --- | --- |
| `GET /api/journal` | Query -> paginated trade rows | Query is parsed before auth; 401 auth; 500 DB; invalid query is not locally caught | TRADE-LIST-001, TRADE-LIST-002 |
| `POST /api/journal` | JSON create payload -> `{id}`, 201 | Validation before auth; 400 schema/reference; 401 auth; 500 write/leg error | TRADE-CREATE-004, TRADE-CREATE-007, TRADE-CREATE-008 |
| `GET /api/journal/[id]` | ID -> mapped detail and signed screenshots | 401, privacy-safe 404, 500 detail/signing loader failure | TRADE-DETAIL-001, TRADE-DETAIL-006 |
| `PATCH /api/journal/[id]` | Strict top-level JSON -> `{ok,id}` | 400 validation/reference/empty; 401; 404; 500 | TRADE-EDIT-003 through TRADE-EDIT-005 |
| `DELETE /api/journal/[id]` | ID -> cleanup status/error | 401; 404; 500 DB; storage failure still returns successful delete status | TRADE-DELETE-002 through TRADE-DELETE-004 |
| `PUT /api/journal/[id]/legs` | Strict full leg array -> count | 400; 401; 404; 500 including restore outcome | TRADE-LEGS-003 through TRADE-LEGS-006 |
| `POST /api/journal/[id]/screenshots` | Multipart `screenshots` -> uploaded count and all paths | Auth is checked first; 400 no/invalid files; 404; 500 upload/persist | SCREENSHOT-001 through SCREENSHOT-006 |
| `GET /api/journal/stats` | No input -> full realized stats contract | 401; 500 | STATS-001 through STATS-009 |
| `POST /api/journal/reviews` | Review JSON -> ID and created/updated action | Validation before auth; 400; 401; 500 | REVIEW-004 through REVIEW-006 |
| `GET /api/journal/exports` | Resource/format/date/period -> attachment | Query validation before auth; 400; 401; 500; no-store headers | EXPORT-003 through EXPORT-010 |
| `POST /auth/signout` | Cookie session -> 303 `/login` | Calls Supabase sign-out; return value/error is not checked | AUTH-006 |

No API endpoint emits 403 in application route code. Client helpers contain 403-specific copy, but current standalone authorization is authentication plus RLS; inaccessible rows normally become 404 or a Supabase error.

### Forms and server actions

There are 9 rendered forms and one server action.

| Form | Fields/actions | Pending/disabled behavior | Feature IDs |
| --- | --- | --- | --- |
| Login | Email, password, hidden `next`, Sign in | Native required controls; server redirect errors | AUTH-003 through AUTH-005 |
| Sign out | POST button | No explicit pending state | AUTH-006 |
| Add trade | Account, instrument, optional strategy, bias, opened time, setup, risk, target R, tags, thesis, dynamic legs | All mutable controls disabled while saving; create disabled for prerequisites/pending | TRADE-CREATE-001 through TRADE-CREATE-008 |
| Edit trade | Same supported top-level fields; no legs/screenshots | Entire form disabled if lookups unavailable or while saving; Reset restores loaded trade | TRADE-EDIT-001 through TRADE-EDIT-005 |
| Replace legs | Dynamic full leg set | Remove disabled at one leg; all controls disabled while saving; Reset legs | TRADE-LEGS-001 through TRADE-LEGS-006 |
| Upload screenshots | Multiple file input, Clear, Upload | File control/buttons disabled while uploading; clear resets DOM input and messages | SCREENSHOT-001, SCREENSHOT-002 |
| Delete trade | Confirmation checkbox, Cancel, Delete | Delete disabled until checked and during delete | TRADE-DELETE-001 |
| Save review | Existing review selector, period, dates, notes, Reset, Save | Controls disabled while saving; Reset returns current-week draft | REVIEW-002 through REVIEW-005 |
| Export | Resource, format, from/to, optional period, Reset, Download | Period disabled for trades; all controls disabled while preparing | EXPORT-001 through EXPORT-003, EXPORT-010 |

The only server action is `login(formData)` in `app/login/actions.ts`.

### Validation contracts

| Schema/helper | Exact contract | Important edge behavior |
| --- | --- | --- |
| `TradeLegSchema` | side buy/sell; qty and price positive; fee/slippage >= 0 with defaults 0; offset datetime | DB lacks a non-negative slippage check even though app validation has one |
| `CreateTradeSchema` | account/instrument UUID required; strategy nullable; setup/thesis nullable; long/short; numeric risk/target nullable; string tags; offset opened time; string screenshot array; >=1 leg | Risk/target have no non-negative schema constraint; direct API can provide arbitrary screenshot paths |
| `UpdateTradeSchema` | Strict optional top-level fields only | Rejects legs, screenshots, unknown fields; empty object parses but route rejects it |
| `ReplaceTradeLegsSchema` | Strict object containing >=1 validated leg | No per-leg mutation or audit semantics |
| `ReviewSaveSchema` | weekly/monthly, ISO-like date strings, notes <=5000 nullable | Lexical end >= start refinement; date regex does not prove a real calendar date |
| `JournalExportQuerySchema` | trades/reviews, csv/json, from/to date strings, optional weekly/monthly period | End >= start; period accepted for trades but normalized to null by the form helper |
| `TradeQuerySchema` | page 1+, limit 1..200, dates, instrument, strategy, asset class, result, search, comma tags | Only `from` and `to` are applied by current query code; other declared filters are ignored |

Form helpers trim nullable text, split/trim comma tags, convert local datetime values to ISO strings, and map the first Zod issue per field path.

### Deterministic calculation and normalization helpers

Seventeen calculation/normalization helpers influence displayed or exported metrics.

| Helper | Formula / algorithm and edge behavior | Location / tests | Feature IDs |
| --- | --- | --- | --- |
| `aggregateTrade` | Weighted average buy/sell; matched quantity `min(buyQty,sellQty)`; gross `(avgSell-avgBuy)*matchedQty*contractSize`; net gross minus all fees/slippage; net position buy-sell | `lib/trades/math.ts`; math tests | STATS-002 |
| `rMultiple` | `pnlNet/riskAmount`; null for missing/zero risk; negative risk is not rejected | `lib/trades/math.ts`; math tests | STATS-006 |
| `normalizeLegs` | Null costs -> 0; ascending `executed_at`, missing timestamps treated as epoch 0 | `lib/journal/server.ts`; indirect server tests | TRADE-DETAIL-004 |
| `getDisplayEntryExit` | Long entry=avg buy/exit=avg sell; short reversed; numeric zero -> null | `lib/journal/server.ts`; detail mapping test | STATS-003 |
| `getTradeSides` | Long buy/sell, short sell/buy | `lib/journal/server.ts`; indirect | STATS-003 |
| `sumLegQtyBySide` | Sum quantity by buy/sell side | `lib/journal/server.ts`; indirect | STATS-003 |
| `getTradeResolution` | No matched qty=open; matched plus remaining entry qty=partial; no remaining=closed; uses `Number.EPSILON` | `lib/journal/server.ts`; dashboard test | STATS-004 |
| `getEquityTimestamp` | `closed_at`, else latest exit-side leg, else `opened_at` | `lib/journal/server.ts`; dashboard test | STATS-007 |
| `mapTradeList` | Derives entry qty, averages, net PnL, R, symbol/strategy fallbacks | `lib/journal/server.ts`; no direct list test | TRADE-LIST-003 |
| `buildEquityCurve` | Sort timestamp ascending and cumulative-add PnL without rounding | `lib/journal/server.ts`; direct test | STATS-007 |
| `buildJournalDashboardStats` | Resolution counts, closed-only net sum, resolved-risk R average, all-trade equity | `lib/journal/server.ts`; direct test | STATS-005 through STATS-009 |
| `filterTradeStatsRecordsByPeriod` | Include records whose `opened_at` lies in inclusive UTC date bounds | `lib/journal/server.ts`; indirect review-save tests | REVIEW-006 |
| `buildCurrentReviewStatsSnapshot` | Period filter -> dashboard stats -> supported snapshot plus basis notes | `lib/journal/server.ts`; indirect | REVIEW-006 |
| `normalizeStoredReviewStats` | Parse object/JSON string; finite numeric strings accepted; legacy `trades` maps; unsupported keys hidden/listed; completeness by 0/1-5/6 supported fields | `lib/journal/reviews.ts`; direct tests | REVIEW-007 |
| `buildReviewStatsSnapshotFromDashboardStats` | Copies six supported stats, marks supported, excludes equity | `lib/journal/reviews.ts`; direct test | REVIEW-006 |
| `mapTradeExportRows` | Reuses trade math/resolution and selects safe trade-level fields | `lib/journal/server.ts`; direct test | EXPORT-005 |
| `mapTradeDetail` | Reuses trade math; maps joins/fallbacks and initializes screenshot assets empty | `lib/journal/server.ts`; direct test | TRADE-DETAIL-002, TRADE-DETAIL-003 |

Calculations use JavaScript numbers and are not rounded before persistence/transport. UI formatting generally uses two decimals, prices use four, timestamps use locale formatting, missing values use `--` or `Unavailable`, and positive/zero values receive a `+` sign. Currency symbols and account base-currency formatting are not applied.

Not implemented: win/loss/breakeven classification, win rate, average win/loss, profit factor, expectancy, percentage return, drawdown, grouping, time-window filters, or unrealized mark-to-market.

### Database map

The SQL defines 8 tables, 4 enums, 1 materialized view, 1 refresh function, and 15 indexes including the view index.

| Table | Columns, constraints, defaults, relationships | RLS / runtime use | Feature ID |
| --- | --- | --- | --- |
| `accounts` | UUID PK; owner FK cascade; required name; optional broker; 3-char base currency default USD; created timestamp; owner/name unique | Owner CRUD policies; lookup and trade FK | DB-002 |
| `instruments` | UUID PK; owner FK cascade; symbol; asset enum; tick size 0.01; contract size 1; 3-char quote USD; created; owner/symbol unique | Owner CRUD; lookup/trade FK. Contract size is not used by runtime math | DB-003 |
| `strategies` | UUID PK; owner FK cascade; name; optional description; created; owner/name unique | Owner CRUD; optional trade FK with SET NULL | DB-004 |
| `sessions` | UUID PK; owner FK cascade; date; pre/post notes; rating 1..5; created; owner/date unique | Owner CRUD; no application route/component uses it | DB-005 |
| `trades` | UUID PK; owner/account/instrument required; optional strategy/setup/thesis/risk/target/closed; tags and screenshot arrays; bias; opened/created timestamps | Owner CRUD; central runtime row | DB-006 |
| `trade_legs` | UUID PK; trade FK cascade; side; positive qty/price; non-negative fee; slippage default but no check; executed/created timestamps | Parent-owner EXISTS policies; runtime create/replace/read | DB-007 |
| `risk_markers` | UUID PK; trade FK cascade; optional stop/target; noted/created timestamps | Parent-owner CRUD; no application route/component uses it | DB-008 |
| `reviews` | UUID PK; owner; period enum; start/end; notes; JSON stats; created; unique owner/period/start | Owner CRUD; runtime read/save/export; no updated timestamp | DB-009 |

Enums are `asset_class_enum`, `trade_bias_enum`, `trade_side_enum`, and `review_period_enum`. All tables have RLS enabled. Direct owner tables compare `auth.uid()` with `user_id`; child rows use an owned-parent `EXISTS` check.

`trade_stats_mv` and `refresh_trade_stats_mv()` are admin-controlled and unused by application routes. Its PnL differs from runtime math: the view does not subtract slippage and does not use the runtime matched-quantity algorithm. It has no documented RLS/grants in this file.

Multi-step writes are not transactional:

- Create inserts trade then legs; leg failure attempts a trade delete but ignores rollback-delete failure.
- Leg replacement deletes all legs then inserts; insert failure attempts restoration, which can also fail.
- Screenshot upload is sequential; failures attempt removal of already uploaded objects, but removal failure is ignored.
- Screenshot persistence occurs after object upload; failure triggers the same best-effort removal.
- Trade delete removes the DB row first, then attempts Storage cleanup; cleanup failure leaves orphaned objects and returns a warning.

### Storage contract

- Bucket: private `journal-screenshots` (bucket and policies are not created by SQL).
- Accepted MIME types: `image/png`, `image/jpeg`, `image/webp`.
- Per-file size: >0 and <=8 MiB.
- File count: no application maximum; the multiple input and route accept all submitted files.
- Path: `journal/{userId}/trades/{tradeId}/{timestamp}-{sanitizedFileName}`.
- Sanitization: lowercase; non `[a-z0-9.-]` runs become `-`; repeated hyphens collapse; leading/trailing hyphens trim; empty becomes `chart-screenshot`.
- Upload: sequential, `upsert:false`; timestamp comes from `Date.now()` per file. Same sanitized name and millisecond can collide.
- Persistence: stable paths are de-duplicated and stored in `trades.screenshot_urls`.
- Read: one signed URL per path, valid 3600 seconds; failed signing yields `status:'unavailable'` and no URL.
- Display: plain `<img>` with path-derived alt text; unavailable objects show explicit error copy.
- No individual screenshot delete, reorder, caption, replacement, or gallery-management API exists.

### UI and visual contract

- Fonts: Manrope body and Space Grotesk display through `next/font`.
- Dark color scheme with layered radial/linear background, purple token family, green success, red danger.
- Reusable glass panels use 28px radius, translucent gradients, blur, border glow, and deep shadow.
- Fixed decorative SVG web and animated blurred orbs are `aria-hidden`; no reduced-motion override exists.
- Desktop uses a 300px sticky sidebar. At <=1180px it is hidden and replaced by sticky, horizontally scrollable pill navigation.
- At <=880px page padding shrinks; two/three-column, foundation, and leg grids collapse to one column; actions and pagination stack.
- Tables preserve width with horizontal overflow; screenshot cards use auto-fit min 220px.
- Buttons have 44px minimum height, hover lift, and disabled opacity/not-allowed cursor. Inputs have visible focus ring.
- Top progress uses passive scroll listener and clamped `scaleX`; it is visual-only and `aria-hidden`.
- Native labels, table semantics, button types, input types, `aria-label` navigation, image alt text, and confirmation checkbox are present. There is no focus trap, live region, custom keyboard navigation, or automated accessibility test.
- The 1,198-line `ApprovedMacroMasteryUI.jsx` is visual reference only and imports unavailable prototype dependencies. Its demo state and extra screens are not production behavior.

### React Query and client data behavior

- One app-level `QueryClient` is created per mounted provider.
- Default query stale time is 30 seconds; focus refetch is disabled.
- Retry callback intends to stop for error messages containing `401` or `403`, otherwise retries while `failureCount < 2`.
- The API reader converts 401/403 into prose without status numbers, so those messages do not match the retry regex and can still retry.
- List key is `['trades', page]`; stats key is `['journal-stats']`.
- Fetches use `cache:'no-store'`; React Query still provides its in-memory stale cache.
- Mutations use direct `fetch`, local pending/error/success state, `router.refresh()`, and no query invalidation call.

### Exact export field order

Trade CSV: `trade_id`, `opened_at`, `closed_at`, `account`, `broker`, `symbol`, `asset_class`, `strategy`, `setup`, `thesis`, `bias`, `resolution`, `qty`, `avg_entry`, `avg_exit`, `pnl_net`, `r`, `risk_per_trade`, `target_r`, `fees_total`, `slippage_total`, `tags`.

Review CSV: `review_id`, `period`, `period_start`, `period_end`, `notes`, `created_at`, `snapshot_completeness`, `total_trades`, `closed_trades`, `open_trades`, `partially_closed_trades`, `net_pnl_closed`, `avg_r_closed_or_resolved`, `unsupported_keys`, `snapshot_notes`.

CSV nulls become empty strings; arrays join with ` | `; values containing comma, quote, or newline are quoted and quotes doubled. Spreadsheet-formula prefixes are not neutralized. Empty CSV exports contain the header line. JSON is pretty-printed with two spaces and returns metadata plus `rows:[]` when empty.

Trade exports include rows opened in inclusive UTC date bounds and sort by `opened_at` ascending. Review exports require `period_start >= from` and `period_end <= to`, optionally filter period, and sort by start then creation ascending. Media, screenshot paths, user IDs, separate leg rows, current recomputed review stats, and advanced analytics are excluded.

## Permanent feature catalog

The following compact records use the grouped-field convention defined above.

### Authentication, navigation, and data client

| ID / feature | Role / trigger / preconditions | Behavior / inputs / validation | Output / loading / empty / failure | Security / data impact | Evidence / tests | Integration / preservation / verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| AUTH-001 Root redirect | Visitor opens `/` | Server redirects to `/journal` | Redirect only | None | `app/page.tsx`; no direct test | Preserve destination or intentionally adapt native dashboard entry; route test | Implemented but not directly tested |
| AUTH-002 Journal page guard | Visitor opens `/journal/*` | Resolve Supabase user in layout | Missing user -> `/login?next=%2Fjournal` | Cookie SSR; no write | `app/journal/layout.tsx`; QA auth checklist | Reuse IntelliTrade auth and paid guard; signed-out browser test | Implemented but not directly tested |
| AUTH-003 Login signed-in redirect | Signed-in user opens login | Sanitize `next`, resolve user | Redirect to sanitized path | Cookie SSR | `app/login/page.tsx`; auth helper tests | Do not port standalone login; preserve redirect intent through platform auth | Confirmed |
| AUTH-004 Login submit | Signed-out user submits email/password | Trim email; password unchanged; both required | Provider error in query; success revalidates layout and redirects | Supabase password auth/cookies | `app/login/actions.ts`; manual QA only | Platform login must return to Journal; browser auth test | Implemented but not directly tested |
| AUTH-005 Redirect sanitization | Login receives `next` | Allow one-leading-slash internal path; reject empty, relative, `//`, absolute URL | Fallback `/journal` | Prevents basic open redirect | `lib/supabase/auth.ts`; `auth.test.ts` | Preserve with target route adaptation; unit tests | Confirmed |
| AUTH-006 Sign out | User presses Sign out | POST Supabase signOut | 303 to `/login`; signOut errors ignored | Clears auth session cookies | `JournalShell.tsx`, `app/auth/signout/route.ts`; manual QA | Use IntelliTrade logout; verify session cleared | Implemented but not directly tested |
| AUTH-007 Session refresh middleware | Request matches journal/API/login | SSR client mirrors cookie writes and calls `auth.getUser()` | Pass-through response | Cookie refresh boundary | `middleware.ts`, `lib/supabase/middleware.ts`; no direct test | Do not copy over IntelliTrade middleware; session regression test | Implemented but not directly tested |
| AUTH-008 API authentication | API request reaches handler | `requireAuthenticatedUser()` calls `auth.getUser()` | Endpoint-specific 401; row access then relies on RLS | Cookie client, no service role | API routes/server helper; manual QA | Add platform paid entitlement as well; 401/403 matrix | Implemented but not directly tested |
| AUTH-009 Environment fail-fast | Supabase helper called | Required env name lookup | Descriptive throw when absent | URL/anon public; service role sensitive | `lib/supabase/env.ts`; `env.test.ts` | Reuse platform env helpers; no duplicate client secret exposure | Confirmed |
| NAV-001 Journal shell | Authenticated page renders | Sidebar, brand, utility stats, nav, signout, main slot | Shared visual shell | None | `JournalShell.tsx`, CSS; manual QA | Adapt visual language into dashboard shell; visual parity | Implemented but not directly tested |
| NAV-002 Overview anchors | User chooses Overview/Performance/Trades/Rollout | Four hash links | Smooth-scroll sections | None | `navigation.ts`, `/journal` IDs | Preserve section reachability where dashboard-native | Implemented but not directly tested |
| NAV-003 Route links | User chooses Journal/Add/Reviews/Exports | Four absolute links | Route navigation | Protected by layout | `navigation.ts` | Rewrite to target routes; route tests | Implemented but not directly tested |
| NAV-004 Responsive nav | Viewport <=1180px | Hide sidebar; show sticky horizontal pills | Overflow scroll | None | CSS media query; manual QA | Preserve responsive access without duplicate dashboard nav | Implemented but not directly tested |
| NAV-005 Scroll progress | User scrolls | Passive listener computes clamped page fraction | Visual scale bar; no text | None | `TopProgressBar.tsx`; no test | Preserve only if compatible; visual/manual check | Implemented but not directly tested |
| NAV-006 Route boundaries | Detail/reviews/journal route pending or fails | App Router loading/error/not-found components | Explicit loading, Retry, Back, privacy-safe not-found | No data disclosure on missing row | route boundary files; manual QA | Preserve exact state classes and privacy behavior | Implemented but not directly tested |
| DATA-001 Query defaults | App provider mounts | 30s stale, no focus refetch, retry callback | In-memory caching and retries | No persistence | `app/providers.tsx`; no test | Reconcile with platform query model; timing tests if retained | Implemented but not directly tested |
| DATA-002 Trade list query | Journal table mounts/page changes | `GET /api/journal?page&limit`; key includes page | Loading/error/empty/populated | Auth/RLS | `TradesTable.tsx`, `api.ts`; no component test | Preserve pagination cache behavior; component/API test | Implemented but not directly tested |
| DATA-003 Stats query | Dashboard mounts | `GET /api/journal/stats`; fixed key | Loading/error/empty chart | Auth/RLS | `Dashboard.tsx`, `api.ts`; helper tests only | Preserve separate full-set stats boundary | Implemented but not directly tested |

### Trade list, create, detail, edit, legs, and delete

| ID / feature | Role / trigger / preconditions | Behavior / inputs / validation | Output / loading / empty / failure | Security / data impact | Evidence / tests | Integration / preservation / verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| TRADE-LIST-001 Paginated list API | Auth user requests list | Page default 1, limit 50/max200; newest opened first; exact count/range | Min one page even zero rows; DB error 500 | Reads `trades` + joins via RLS | route/server source; schema pagination test | Preserve response contract; route tests | Implemented but not directly tested |
| TRADE-LIST-002 Date-only filters | Client/API supplies query | Only raw `from` GTE and `to` LTE on opened timestamp are applied | Other declared filters silently ignored | RLS query | `applyTradeListFilters`; no direct test | Do not claim unsupported filters; add explicit tests/decision | Implemented but not directly tested |
| TRADE-LIST-003 Row derivation | List rows map | Entry quantity, averages, net, R, symbol/strategy | Null averages/labels; NaN/falsy net becomes 0 | No write | `mapTradeList`; indirect math tests | Match metric formulas exactly | Implemented but not directly tested |
| TRADE-LIST-004 Table rendering | List query resolves | Date/time locale; symbol link; side/status; two-decimal qty/averages/net/R | Loading row, API error, first-trade empty copy | None | `TradesTable.tsx`; manual QA | Preserve columns/copy/states; component/browser tests | Implemented but not directly tested |
| TRADE-LIST-005 Pagination controls | User presses Previous/Next | Clamp within 1..pages; effect lowers page if pages shrink | Buttons disabled at bounds; page/total copy | No write | `TradesTable.tsx`; manual QA | Preserve disabled/clamp semantics | Implemented but not directly tested |
| TRADE-CREATE-001 Lookup loading | User opens new trade; auth required | Parallel alphabetic accounts/instruments/strategies queries; formatted labels | Route-level explicit load failure | RLS owns lookup rows | `getTradeFormLookups`, new page | Use canonical platform asset/account model; two-user test | Implemented but not directly tested |
| TRADE-CREATE-002 Prerequisites | Lookups loaded | Account/instrument absence blocks; strategy absence warns only | Exact create-specific guidance | No write | prerequisite helper/test | Preserve blocking vs optional distinction | Confirmed |
| TRADE-CREATE-003 Defaults | Form initializes | First account/instrument; no strategy; long; now local; one buy leg; fee/slippage 0 | Empty optional strings | No write | create helper/test | Preserve defaults or obtain approval | Confirmed |
| TRADE-CREATE-004 Top-level validation | Submit create | UUID refs, long/short, ISO time, optional strings/numbers/tags | First field issue plus summary error | No write until valid | schemas/create helper tests | Port all validation cases; add risk policy decision | Confirmed |
| TRADE-CREATE-005 Normalization | Submit create | Trim setup/thesis; blank -> null; comma tags trim/drop blanks; local times -> UTC ISO; blank numeric -> null | Invalid numeric/date field errors | No write until valid | create helper/test | Preserve transformations | Confirmed |
| TRADE-CREATE-006 Dynamic create legs | User edits legs | Add using opened time; remove any except last; side/qty/price/fee/slippage/time | >=1 leg; controls disabled pending | No write until submit | AddTradeForm, schema tests | Preserve multi-leg UI and one-leg floor | Implemented but not directly tested |
| TRADE-CREATE-007 Submit UX/API | Valid user submits | Direct fetch; set pending; prevent repeat via disabled controls | `Saving trade...`; API/provider errors; success push+refresh journal | Inserts owned trade/legs | form/api/route; no route/component test | Preserve all pending/error/redirect behavior | Implemented but not directly tested |
| TRADE-CREATE-008 Ownership and rollback | Create API after validation | Verify each non-null reference through RLS; insert trade then legs | Ref failure 400; leg failure 500 and attempted trade delete | `trades`, `trade_legs`; rollback failure ignored | server/route; no direct create rollback test | Transactionalize or preserve warning; integration tests | Implemented but not directly tested |
| TRADE-DETAIL-001 Detail load | Auth user opens ID | Select trade, joins, legs; parallel best-effort lookups; sign paths | Route loading; server error boundary; not-found | RLS; read tables/storage | detail page/server; no route test | Preserve full data and failure surfaces | Implemented but not directly tested |
| TRADE-DETAIL-002 Context display | Detail loaded | Symbol/bias or ID; account/broker; asset; strategy/setup/thesis/tags | Explicit unavailable/no-value copy | No write | detail page/map detail test | Preserve fallback text and fields | Confirmed |
| TRADE-DETAIL-003 Metric display | Detail loaded | Opened, avg entry/exit, size, net/gross, R/risk/target, costs | 2/4 decimal and signed fallbacks | No write | detail page/map/math tests | Preserve formulas and formatting | Confirmed |
| TRADE-DETAIL-004 Leg table | Detail loaded | Sort chronological; show time, side, qty, price, fee, slippage | Six-column empty row if none | Reads `trade_legs` | detail/server; indirect tests | Preserve order/fields/empty state | Implemented but not directly tested |
| TRADE-DETAIL-005 Screenshot surface | Detail loaded | Count stable paths; upload form; signed image cards | No-media empty; unreadable error | Storage signed read | detail page | Preserve privacy/unavailable states | Implemented but not directly tested |
| TRADE-DETAIL-006 Privacy-safe absence | Missing or RLS-hidden ID | `.maybeSingle()` -> null | Same not-found page/message for both | Avoids ownership disclosure | server/not-found; QA only | Preserve non-disclosure; two-user test | Implemented but not directly tested |
| TRADE-DETAIL-007 Retryable error | Detail render throws | Error boundary receives message/reset | Retry button and Back link | May expose server error text | error component | Preserve retry; review message disclosure | Implemented but not directly tested |
| TRADE-EDIT-001 Initial mapping | Detail edit mounts | Null -> blank; tags join comma-space; opened UTC -> local input | Loaded values | No write | edit helper/test | Preserve reversible mapping | Confirmed |
| TRADE-EDIT-002 Edit prerequisites | Detail lookups resolve/fail | Account/instrument absence blocks; strategy warns; lookup error disables all | Exact edit-specific guidance | RLS lookups | helper test, form | Preserve inability to reassign without lookups | Confirmed |
| TRADE-EDIT-003 Supported fields | User submits edit | Account, instrument, strategy, setup, bias, thesis, risk, target, tags, opened only | Strict rejection of legs/screenshots/unknowns | Updates `trades` | schema/server tests | Preserve dedicated mutation boundaries | Confirmed |
| TRADE-EDIT-004 Reset/save UX | User resets/submits | Reset loaded state/messages; pending disables; success refresh | `Trade details saved.` or API error | No write on reset | form; helper tests only | Component test exact states | Implemented but not directly tested |
| TRADE-EDIT-005 PATCH behavior | Valid API request | Reference ownership; omit undefined; reject empty; maybeSingle | 400/401/404/500 or `{ok,id}` | RLS update `trades` | route/server tests for payload only | Add route/two-user tests | Implemented but not directly tested |
| TRADE-LEGS-001 Initial leg edit values | Detail editor mounts | Existing legs -> strings/local times; none -> one new default leg | Editable full set | No write | helper test | Preserve field conversion/default | Confirmed |
| TRADE-LEGS-002 Leg editor controls | User edits | Add, remove except last, reset server props; clear leg errors on change | Pending disables; summary/field/success errors | No write until save | component; helper tests | Preserve full-set semantics and button states | Implemented but not directly tested |
| TRADE-LEGS-003 Replacement validation | User/API submits | Strict >=1 validated legs | Field-path errors and summary | No write until valid | schema/helper tests | Preserve all leg constraints | Confirmed |
| TRADE-LEGS-004 Full-set replacement | Owned trade and valid body | Load prior set; delete all; insert replacement | Count success; 404/500 failures | Rewrites `trade_legs` | server helper test | Do not silently change to partial edits | Confirmed |
| TRADE-LEGS-005 Best-effort restore | Replacement insert fails | Reinsert old legs; missing old timestamp becomes current time | Distinct restored vs restore-failed error | Can alter IDs/timestamps; non-atomic | server helper test covers successful restore only | Prefer RPC or preserve exact failure contract; add restore-failure test | Confirmed |
| TRADE-LEGS-006 No individual mutations | Developer/API client | No PATCH/DELETE/reorder/history endpoints | Unsupported by design | None | source/docs | Preserve as explicit limitation unless approved | Confirmed |
| TRADE-DELETE-001 Explicit confirmation | User reaches danger section | Checkbox required; Cancel; delete disabled until checked | Local confirmation error; `Deleting trade...` | No write until confirmed | delete form; no test | Preserve destructive confirmation and copy | Implemented but not directly tested |
| TRADE-DELETE-002 DB deletion/cascade | Confirmed authenticated delete | Load screenshot paths; delete trade; DB cascades legs/risk markers | 404/500 or success | Deletes `trades`; child cascades | SQL/server delete tests | Verify cascades and RLS in test DB | Confirmed |
| TRADE-DELETE-003 Storage cleanup | DB delete succeeded | If paths, remove all from private bucket | not_needed/complete/failed plus cleanup error; DB stays deleted | Deletes Storage objects best-effort | server delete tests | Preserve truthful orphan warning; staging test | Confirmed |
| TRADE-DELETE-004 Redirect feedback | Client receives delete result | Add `tradeDeleted=1`; add warning query if cleanup failed | Journal success/warning banner | URL state only | form/page; no component test | Preserve query semantics/copy | Implemented but not directly tested |

### Statistics and reviews

| ID / feature | Role / trigger / preconditions | Behavior / inputs / validation | Output / loading / empty / failure | Security / data impact | Evidence / tests | Integration / preservation / verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| STATS-001 Full-set stats endpoint | Auth dashboard query | Reads all user trades ordered opened asc; not paginated | Contract or 401/500 | RLS reads trades/legs | stats route/server | Preserve separate server boundary | Implemented but not directly tested |
| STATS-002 Realized PnL aggregation | Any mapper computes trade | Weighted buy/sell; matched qty; gross less all costs | Open positions can have negative cost-only net | No write; contract size defaults 1 | math helper/tests | Preserve formula; resolve contract-size gap explicitly | Confirmed |
| STATS-003 Bias-aware display | List/detail/export | Entry/exit sides reverse for shorts; entry qty sums entry-side legs | Missing averages -> null | No write | server/map detail test | Preserve long/short display | Confirmed |
| STATS-004 Resolution classification | Stats/export | Matched=0 open; matched+remaining partial; no remaining closed | Over-exited trades classify closed | No write | server/dashboard test | Preserve or approve stricter invariant | Confirmed |
| STATS-005 Counts and closed net | Full stats | Count all states; net closed sums only closed | Empty -> zero counts/net | No write | dashboard helper test | Deterministic fixture parity | Confirmed |
| STATS-006 Average resolved R | Full stats | Include partial/closed with non-null R; arithmetic mean | No values -> null | No write | helper/math tests | Preserve denominator and risk behavior | Confirmed |
| STATS-007 Equity curve | Full stats | Every trade contributes net-to-date; timestamp closed/last exit/opened; ascending cumulative | Open contributes costs; no rounding | No write | equity/dashboard tests | Preserve inclusion/timestamp rules | Confirmed |
| STATS-008 Dashboard presentation | Query states | Six cards, 280px Chart.js line, no legend, hidden points | `--`, loading, error, no-equity states | No write | Dashboard/CSS; manual QA | Preserve visible metrics/states/responsiveness | Implemented but not directly tested |
| STATS-009 Explicit exclusions | User reads assumptions | Realized net only; partial matched PnL+all costs; no unrealized | Notes fallback before data | No write | server/Dashboard/test | Do not relabel as full performance analytics | Confirmed |
| REVIEW-001 Review loading/sort | Auth user opens reviews | Read start desc then created desc; if rows, load full trade context | Empty returns without trade query; route load error | RLS reviews/trades | server/page; no direct load test | Preserve sort and conditional query | Implemented but not directly tested |
| REVIEW-002 Current-week defaults | New review form mounts/reset | Monday through Sunday based on local `Date`; weekly; blank notes | Draft values | No write | ReviewSaveForm; no test | Preserve timezone behavior or approve UTC change | Implemented but not directly tested |
| REVIEW-003 Existing review selection | User selects saved review | Populate period/start/end/notes; blank selection resets draft | Missing selected ID leaves current values | No write | ReviewSaveForm | Component test | Implemented but not directly tested |
| REVIEW-004 Review validation/UX | User submits | Weekly/monthly; date order; notes trim blank->null/max5000 | Field+summary error; pending; created/updated success | No write until valid | reviews/schema tests | Preserve exact constraints/messages | Confirmed |
| REVIEW-005 Save/update key | Valid authenticated save | Find owner+period+start; update existing or insert; period end may change | Action created/updated; DB errors explicit | Writes `reviews` owned row | server tests | Preserve uniqueness semantics | Confirmed |
| REVIEW-006 Snapshot calculation | Save/display review | Trades selected by opened date inclusive UTC; current stats model; six fields persisted | Supported snapshot plus basis notes | Reads trades, writes `auto_stats` | server/reviews tests | Preserve opened-date basis and stored field set | Confirmed |
| REVIEW-007 Stored normalization | Load/export legacy snapshot | Parse object/JSON; numeric strings; legacy trades; unsupported key reporting | missing/partial/supported with notes | No write during load | reviews tests | Preserve compatibility and no silent mis-map | Confirmed |
| REVIEW-008 Stored vs current display | Review card renders | Side-by-side persisted and recomputed period snapshots | Notes fallback; updated_at explained absent | No write | reviews page | Preserve historical-vs-live distinction | Implemented but not directly tested |
| REVIEW-009 Review empty/error/boundaries | Route has none/failure | Explain first save and narrow scope | Empty and explicit load error | None | reviews page/QA | Preserve honest limitations | Implemented but not directly tested |

### Screenshots and exports

| ID / feature | Role / trigger / preconditions | Behavior / inputs / validation | Output / loading / empty / failure | Security / data impact | Evidence / tests | Integration / preservation / verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| SCREENSHOT-001 Multi-file selection | Detail user selects files | Multiple `screenshots`; no count cap; Clear resets input/messages | Selected-count grammar; no-file submit error | No write until submit | upload form | Preserve no hidden count assumption; component test | Implemented but not directly tested |
| SCREENSHOT-002 File validation | Client and route inspect every file | PNG/JPEG/WebP; >0; <=8MiB | First client error; route returns first plus details | No write until all valid | uploads helper/tests/route | Preserve dual validation | Confirmed |
| SCREENSHOT-003 Name/path construction | Valid file upload | Sanitize lowercase filename; timestamped owner/trade prefix | Fallback filename; possible same-ms collision | Defines Storage object path | uploads helper/tests | Preserve namespace; add collision test/policy | Confirmed |
| SCREENSHOT-004 Auth/ownership | Upload/sign/remove requested | Resolve user; load trade through RLS before storage operation | 401/404/500 | RLS plus required Storage policies | route/server; manual QA | Two-user storage tests mandatory | Implemented but not directly tested |
| SCREENSHOT-005 Sequential upload rollback | Multiple valid files | Upload sequentially, no upsert; collect paths; on failure remove uploaded paths | 500 original error; cleanup result ignored | Creates/removes Storage objects | route; no route test | Preserve or improve atomically; failure-injection test | Implemented but not directly tested |
| SCREENSHOT-006 Path persistence | Uploads complete | Merge existing+new de-duplicated paths; update trade | Vanished trade triggers cleanup/error | Updates `trades.screenshot_urls` | helper tests/server | Persist paths, never signed URLs | Confirmed |
| SCREENSHOT-007 Signed reads | Detail load has paths | Create 3600-second signed URL per path | Available asset or unavailable null URL | Private bucket read | server/detail; no test | Preserve private signing duration/behavior | Implemented but not directly tested |
| SCREENSHOT-008 Display fallback | Detail renders assets | Plain image with path alt; metadata text | Missing/unreadable explicit error | No write | detail page | Visual/accessibility test | Implemented but not directly tested |
| SCREENSHOT-009 Media limitations | User manages media | Upload/read only; no individual delete/reorder/caption/gallery | Trade delete is only cleanup path | Orphan risk | source/readiness docs | Must not claim missing controls | Confirmed |
| EXPORT-001 Export scope UI | Auth user opens exports | Trades/reviews and CSV/JSON; explicit exclusions | Protected-download copy | No write | exports page/form | Preserve resources/formats/boundaries | Implemented but not directly tested |
| EXPORT-002 Export defaults/dynamics | Form mounts/reset/resource changes | Trades CSV, month start->today UTC-string dates, no period; switching trades clears period | Period control disabled for trades | No write | export helper/tests/form | Preserve defaults and period reset | Confirmed |
| EXPORT-003 Export validation | Submit/query | Date regex/order; enum resource/format/period | Field+summary errors; API 400 details | No read until valid | schema/helper tests | Preserve query contract | Confirmed |
| EXPORT-004 Trade selection | Valid trade export | Inclusive UTC opened bounds; opened ascending | DB failure 500 | RLS trades/joins | server/route | Route/two-user test | Implemented but not directly tested |
| EXPORT-005 Trade export mapping | Rows selected | Exact 22 fields; derived realized metrics; no media/user IDs/separate legs | Nulls retained JSON/blank CSV | No write | server/exports tests | Preserve exact order and exclusions | Confirmed |
| EXPORT-006 Review selection | Valid review export | Fully-contained date range; optional period; start then created ascending | DB failure 500 | RLS reviews | server/route | Preserve containment semantics | Implemented but not directly tested |
| EXPORT-007 Review export mapping | Rows selected | Exact 15 fields from persisted normalized snapshot only | Legacy unsupported metadata retained | No write | server/exports tests | Do not substitute current live stats | Confirmed |
| EXPORT-008 CSV serialization | CSV requested | Header always; arrays ` | `; RFC-like quote doubling | Empty header-only; no formula neutralization | Download data | exports tests | Preserve order/escaping; add injection decision | Confirmed |
| EXPORT-009 JSON document | JSON requested | Pretty metadata, exported_at, scope, rows, limitation notes | Empty rows valid | Download data | server tests | Preserve notes and exclusions | Confirmed |
| EXPORT-010 Response/download UX | Valid endpoint response | no-store; attachment filename; MIME charset; client Blob URL click/revoke; content-disposition fallback | Preparing/success/error states | Browser download only | route/form/helper test | Preserve filename/content headers and cleanup | Implemented but not directly tested |

### Database, UI, administration, tests, and documentation-only claims

| ID / feature | Role / trigger / preconditions | Behavior / inputs / validation | Output / loading / empty / failure | Security / data impact | Evidence / tests | Integration / preservation / verification | Status |
| --- | --- | --- | --- | --- | --- | --- | --- |
| DB-001 Enum domain | Migration administrator applies SQL | Four enums constrain asset/bias/side/period | Non-idempotent type create on rerun | Database types | SQL; no DB tests | Reconcile with IntelliTrade canonical types; migration test | Implemented but not directly tested |
| DB-002 Accounts model | User/admin seeds account | Owner/name unique, base currency check/default | FK cascade can delete trades | Owner RLS; accounts/trades | SQL/lookups | Human schema decision; DB/RLS tests | Implemented but not directly tested |
| DB-003 Instruments model | User/admin seeds instrument | Owner/symbol unique; asset/tick/contract/quote | Contract size currently unused by runtime math | Owner RLS; instruments/trades | SQL/lookups | Replace with canonical asset IDs/aliases | Implemented but not directly tested |
| DB-004 Strategies model | User/admin seeds optional strategy | Owner/name unique; description | Strategy deletion sets trade FK null | Owner RLS | SQL/lookups | Preserve optional behavior | Implemented but not directly tested |
| DB-005 Sessions model | SQL applied | Date notes/rating 1..5 owner/date unique | No app screen/API | Owner RLS | SQL only | Decide migrate/defer; do not claim UI parity | Implemented but not directly tested |
| DB-006 Trades model | CRUD routes | Required owner/account/instrument/bias/opened; optional context; arrays | Account/instrument delete cascades trade | Owner RLS | SQL/routes | Namespaced migration and ownership review | Implemented but not directly tested |
| DB-007 Trade legs model | Create/replace/delete | Positive qty/price; nonnegative fee; timestamp | Parent delete cascades | Parent-owner RLS | SQL/routes | Add slippage DB check/transaction decision | Implemented but not directly tested |
| DB-008 Risk markers model | SQL applied | Optional stop/target trail rows | No app screen/API | Parent-owner RLS | SQL only | Decide migrate/defer | Implemented but not directly tested |
| DB-009 Reviews model | Save/load/export | Unique owner/period/start; JSON snapshot; no updated_at | Existing save mutates historical row | Owner RLS | SQL/server tests | Preserve mutable key or approve change | Confirmed |
| DB-010 Materialized stats view | Admin refreshes | SQL gross/net/R/duration/day/hour joins | Stale until manual refresh; formula diverges | View RLS/grants not defined | SQL only | Do not use without redesign/security review | Implemented but not directly tested |
| DB-011 Index set | Migration applies | 14 table indexes plus unique view ID | Improves owner/date/FK lookups | Database only | SQL | Recreate only as justified | Implemented but not directly tested |
| DB-012 RLS policies | Authenticated DB operation | Owner CRUD; child parent-ownership EXISTS | Cross-user should deny/appear absent | All 8 tables | SQL/manual QA | Two-user automated policy suite mandatory | Implemented but not directly tested |
| DB-013 Non-transactional writes | Mutation spans operations | Best-effort rollback/restore/cleanup | Partial rows or orphan objects possible | Trades/legs/storage | route/server tests partial | Explicit risk acceptance or transactional RPC | Confirmed |
| UI-001 Typography/theme | Any page renders | Manrope/Space Grotesk, dark tokens, purple restraint | Font fallback to Segoe/sans | None | layout/CSS | Preserve hierarchy in platform tokens | Implemented but not directly tested |
| UI-002 Atmospheric background | Journal shell renders | Layered gradients, animated orbs, SVG web | Decorative/aria-hidden; no reduced-motion | None | CSS/BackgroundParticles | Preserve quality; add reduced-motion review | Implemented but not directly tested |
| UI-003 Glass surfaces/hierarchy | Content renders | Reusable panels, headers, pills, cards, dividers | Strong/default tones | None | UI components/CSS | Map to dashboard design system without flattening | Implemented but not directly tested |
| UI-004 Controls/states | User interacts | Hover lift, focus ring, disabled opacity, primary/danger styles | Explicit success/warning/error/empty colors | None | CSS/forms | Visual and keyboard parity tests | Implemented but not directly tested |
| UI-005 Tables/charts/media | Data renders | Horizontal tables, responsive chart, screenshot auto-grid | Empty/error states in same surfaces | None | components/CSS | Responsive visual regression | Implemented but not directly tested |
| UI-006 Responsive breakpoints | Viewport <=1180/880 | Nav substitution and one-column collapse | Stacked actions/pagination | None | CSS/manual QA | Test desktop/tablet/mobile | Implemented but not directly tested |
| UI-007 Accessibility semantics | Keyboard/AT user | Labels, semantic table/buttons, nav aria labels, image alt | No live regions/focus trap/a11y suite | None | JSX source | Preserve semantics and add automated audit | Implemented but not directly tested |
| ADMIN-001 Demo seed command | Admin runs script with auth user ID and service role | Upsert lookup/trades/reviews; delete+insert legs | Fails step with label; logs user ID | Bypasses RLS intentionally | seed script; no test; `tsx` not declared direct dependency | Keep admin-only; idempotency/test review | Implemented but not directly tested |
| ADMIN-002 Demo fixtures | Seed script called | Fixed IDs, account, 4 instruments/trades, 3 strategies, 10 legs, 2 legacy reviews | Includes fake screenshot paths not uploaded | Writes user-owned demo rows | fixture source; no test | Do not ship as real user data; canonical asset adaptation | Implemented but not directly tested |
| TEST-001 Validation/form unit suite | Developer runs Vitest | Create/update/leg/schema/prerequisite behavior | 20 tests across related files | No real DB | six test files | Port cases into IntelliTrade | Confirmed |
| TEST-002 Math/server unit suite | Developer runs Vitest | PnL/R/equity/stats/detail/export/review/delete/legs helpers with custom stubs | 19 tests | Mocked/stubbed Supabase only | math + server test files | Preserve deterministic cases; add route/DB tests | Confirmed |
| TEST-003 Review/export/upload/auth/env unit suite | Developer runs Vitest | Normalization, serialization, paths, redirect, env | 21 tests | No network/storage | six files (overlaps grouping by behavior) | Port all cases | Confirmed |
| DOC-REF-001 Rich list filters/search | Prototype/docs suggest side/search/filter UI | No production controls; API ignores most declared filters | Not available | None | reference, schema vs server | Requires separate approved implementation | Documented but not confirmed in implementation |
| DOC-REF-002 R histogram/advanced analytics | Reference shows histogram/last 50 | No production helper or component | Not available | None | reference only | Not parity baseline | Documented but not confirmed in implementation |
| DOC-REF-003 Mindset/emotions/rule adherence | Reference shows fields/cards | No schema/API/production UI | Not available | None | reference only | Not parity baseline unless product approves | Documented but not confirmed in implementation |
| DOC-REF-004 Rules screen | Reference has discipline rules | No production route | Not available | None | reference only | Not parity baseline | Documented but not confirmed in implementation |
| DOC-REF-005 PDF/settings/backups | Reference mentions PDF/defaults/backups | Production exports only CSV/JSON | Not available | None | reference only | Do not claim | Documented but not confirmed in implementation |
| DOC-REF-006 Sessions/risk-marker workflows | SQL tables suggest future behavior | No source route/component/API | Not available | RLS tables only | SQL only | Schema decision, not implemented feature | Documented but not confirmed in implementation |
| DOC-REF-007 Screenshot management | Backlog docs mention delete/reorder/captions | Only upload/read/trade-delete cleanup exists | Not available | Storage | readiness docs | Not parity baseline | Documented but not confirmed in implementation |
| DOC-REF-008 Browser/E2E suite | `test:ui` script and docs imply UI testing | No Playwright config/spec files | Command cannot represent repo-owned E2E coverage | None | package/source scan | Add in later integration validation | Documented but not confirmed in implementation |

## Test file mapping

| Test file | Features protected | Current result | Integration adaptation needed |
| --- | --- | ---: | --- |
| `lib/journal/createTradeForm.test.ts` | Defaults conversion, create shaping, numeric/time field errors | 3 pass | Path imports and canonical asset/account IDs |
| `lib/journal/exports.test.ts` | Period dropping, date validation, exact CSV fields, list escaping, filenames | 5 pass | Route/auth additions; retain exact columns |
| `lib/journal/lookupPrerequisites.test.ts` | Create/edit blocker copy and optional strategies | 2 pass | Account/asset model adaptation |
| `lib/journal/reviews.test.ts` | Supported/legacy/invalid snapshots, current snapshot copy, notes/date validation, persisted field whitelist | 7 pass | Schema/table paths only |
| `lib/journal/server.test.ts` | Equity/stats, PATCH boundaries, delete cleanup, leg replace/restore, detail/export mapping, review create/update | 16 pass | Existing Supabase mocks and platform auth/entitlement seam |
| `lib/journal/tradeLegEditForm.test.ts` | Initial values, replacement shaping, invalid leg fields | 3 pass | Import paths |
| `lib/journal/updateTradeForm.test.ts` | Detail-to-form mapping, normalization, invalid number/date/UUID | 3 pass | Account/asset identifiers |
| `lib/journal/uploads.test.ts` | Sanitization, path namespace, type/size/empty, path merge | 5 pass | Platform storage helper and collision/policy additions |
| `lib/supabase/auth.test.ts` | Internal redirect and open-redirect fallback | 2 pass | Replace with IntelliTrade auth redirect tests |
| `lib/supabase/env.test.ts` | Required values and missing-env error | 2 pass | Use platform env helper; never port service-role client-side |
| `lib/trades/math.test.ts` | Partial long, profitable short, null R | 3 pass | Canonical contract-size decision and more edge cases |
| `lib/validation/schemas.test.ts` | Create/list/update/replace/export schema contracts | 9 pass | Add review schema coverage and platform route tests |

Mocks are custom Supabase-like stubs in `server.test.ts`; env tests mutate/restore `process.env`. There are no route, component, browser, real Supabase, RLS, Storage policy, SQL migration, accessibility, or visual tests.

## Implemented behavior without direct automated coverage

Key untested source behavior includes all route-handler status/headers and malformed JSON behavior; login action and cookie middleware; page/component rendering; query retry/caching; list page clamping; lookup loading and reference ownership; create rollback failure; restore-failure branch; signed URL duration/fallback; multi-file upload rollback; export response headers/Blob download; current-week review defaults; SQL constraints/RLS/cascades/view; seed idempotency; responsive and accessibility behavior.

## Manual and production-only checks

The eight `docs/qa/*` files map to the IDs above. Human/environment verification remains required for:

1. Email/password provider enablement, deployed cookie domain, refresh, login, and logout.
2. Applying schema safely and verifying all RLS policies with at least two users.
3. Creating a private `journal-screenshots` bucket and owner-prefix upload/sign/remove policies.
4. Signed URL rendering and missing-object behavior in the deployed environment.
5. End-to-end create/edit/replace/delete partial-failure behavior against real Supabase.
6. Cross-user list/detail/mutation/export/media isolation.
7. Required account/instrument seed/setup for each user.
8. CSV/JSON browser download headers and filenames.
9. Desktop, tablet, mobile, keyboard, focus, and visual parity.
10. Dependency/security patch review, especially pinned Next 14.2.6.

### Checklist-item coverage audit

All 121 top-level checklist steps/bullets are covered by a Feature ID, a human-only launch check, or both. The grouping below is exhaustive; repeated smoke checks intentionally retain the same mappings.

| Checklist / section | Items | Feature ID mapping | Human-only component |
|---|---:|---|---|
| `auth-checklist.md` | 6 | AUTH-002..008 | Deployed cookie/session/provider behavior |
| `deployed-smoke-test.md` Preconditions | 4 | AUTH-009, DB-001..012, SCREENSHOT-004, TRADE-CREATE-001..002 | Apply schema; provision private bucket/policies; seed real user prerequisites |
| `deployed-smoke-test.md` Session/Auth | 4 | AUTH-002..007, NAV-003 | Real provider login, cookie persistence, direct navigation |
| `deployed-smoke-test.md` Core flow | 6 | DATA-002..003, TRADE-LIST-004, TRADE-CREATE-007, TRADE-DETAIL-001..004, TRADE-EDIT-004..005, TRADE-LEGS-004..005 | End-to-end real Supabase workflow |
| `deployed-smoke-test.md` Screenshot flow | 4 | SCREENSHOT-001..008 | Real private Storage upload/sign/path inspection |
| `deployed-smoke-test.md` Review/Export flow | 5 | REVIEW-004..008, EXPORT-001..010, DB-012 | Two-user export isolation and browser downloads |
| `deployed-smoke-test.md` Delete/Cleanup flow | 4 | TRADE-DELETE-001..004, SCREENSHOT-005..006 | Real Storage cleanup/warning inspection |
| `deployed-smoke-test.md` Launch blockers | 5 | AUTH-007..009, DB-012, SCREENSHOT-004, EXPORT-004..010, TRADE-CREATE-001..002 | Deployment-blocking security/environment decisions |
| `exports-checklist.md` | 10 | AUTH-002, NAV-001, EXPORT-001..010, DB-012 | Browser downloads and two-user RLS |
| `reviews-checklist.md` | 13 | AUTH-002, REVIEW-001..009, DOC-REF-003, DOC-REF-005, DOC-REF-007 | Real DB persistence; confirm excluded prototype scope remains honest |
| `stats-checklist.md` | 11 | AUTH-008, DATA-003, STATS-001..009, UI-005..006 | Full-set production data and responsive visual QA |
| `trade-detail-checklist.md` | 21 | TRADE-DETAIL-001..007, TRADE-EDIT-001..005, TRADE-LEGS-001..005, TRADE-DELETE-001..004, SCREENSHOT-007..009 | Cross-user absence, real media, partial-failure, and responsive checks |
| `trades-checklist.md` | 17 | DATA-001..002, TRADE-LIST-001..005, TRADE-CREATE-001..008, TRADE-EDIT-003..005, TRADE-LEGS-002..005, TRADE-DELETE-001..004 | Auth/RLS, browser, and responsive workflow checks |
| `uploads-checklist.md` | 11 | SCREENSHOT-001..008, TRADE-DELETE-003, DB-012 | Real private bucket policies, signed reads, and two-user isolation |

## Known source/document quality findings

- `JOURNAL_GAP_ANALYSIS.md` and `JOURNAL_IMPLEMENTATION_HANDOFF.md` describe an earlier state and contain claims contradicted by current source.
- Several historical plan files display mojibake for apostrophes in the current console encoding.
- `IntelliJournal_Dev_Handoff_UPDATED.md` lists `POST /api/journal/[id]/legs` and a GET-like signout alternative, but source implements `PUT` legs and `POST /auth/signout`.
- The visual reference contains prototype-only features and dependencies; source comments explicitly prohibit copying its architecture/state.
- No `JOURNAL_TESTING_HANDOFF.md` exists; testing guidance is distributed across the updated handoff, readiness/launch docs, and QA checklists.

## Completeness statement

All 104 non-generated files were enumerated. All App Router pages/handlers, 9 forms, 8 SQL tables, 4 enums, materialized view/function, 17 calculation/normalization helpers, 12 test files, 8 QA checklists, root handoffs, plans, global CSS, seed script, fixture source, middleware, Supabase clients, and the visual reference were inspected. Binary `public/favicon.ico` has no feature behavior. `package-lock.json` was treated as dependency-lock metadata rather than line-by-line product behavior.
