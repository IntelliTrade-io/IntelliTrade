# IntelliTrade Refactor Plan

**Status:** Living document. Multi-session effort.
**Started:** 2026-07-04
**Architect role:** planning + sequencing. Execution happens over multiple sessions, one workstream at a time.

---

## 0. How to use this document

This is the single source of truth for the refactor. Each session:

1. Pick the **next unchecked task** from the active phase (phases are ordered by dependency + risk).
2. Do the work on a branch, run `npm run build` + `npm test` + `pytest` before considering it done (per project rule: build must pass, zero errors, before a task is complete).
3. Check the box, add a one-line note under the task (what changed, any surprise), commit.
4. If something new is discovered, add it to the backlog (§8) — don't silently expand a task.

**Golden rules for this refactor**
- No behavior change and no cleanup in the same commit. Separate "move/rename" commits from "change logic" commits so diffs stay reviewable.
- Don't delete anything as "dead" until proven unreachable (see verification protocol, §3.1). The audit is evidence, not proof.
- Never rewrite git history without an explicit go-ahead (decided: **no history rewrite** — see §2).
- Security fixes (Phase 1) land before cosmetic refactors. A tidy codebase that leaks paid data is worse than a messy secure one.

---

## 1. Current-state summary

IntelliTrade is a Next.js 15 (App Router, React 19) app with a Sanity blog, Supabase backend, Stripe billing, and a Python side (EURUSD support/resistance engine + market-data scrapers deployed to a Windows VPS). It works, but has accumulated the mess typical of fast iteration.

**Repo scale:** 392 tracked files. ~24,500 lines of first-party Python. ~176 TS/TSX files in `app/` + `components/`.

**The five structural liabilities**

| # | Liability | Evidence |
|---|-----------|----------|
| 1 | **Data publicly exposed** — RLS is off on every Supabase table except `subscriptions`; 5+ premium API routes have no auth; paid API key shipped to browser. | §Phase 1 |
| 2 | **Duplication everywhere** — currency-strength engine forked into 3 drifting copies; economic-calendar scraper exists twice; nested duplicate Next.js app; duplicate components + data assets. | §Phase 3, §Phase 6 |
| 3 | **Committed build output & data blobs** — `.contentlayer/`, prebuilt Vite bundles, `reports/` outputs, ~9 MB of CSVs/PNGs in git; `.gitignore` too thin. | §Phase 2 |
| 4 | **Two half-migrated CMS stacks** — Sanity is live, but contentlayer/pliny/MDX scaffolding left behind; Tailwind v3 and v4 both installed with v3 actually wired. | §Phase 4, §Phase 5 |
| 5 | **No Python packaging** — bare scripts, 7 sys.path hacks (backend reaches into scripts tree at runtime), one 14,565-line monolith, ~88% of Python untested. | §Phase 6 |

---

## 2. Decisions locked (owner, 2026-07-04)

| Question | Decision | Consequence for plan |
|----------|----------|----------------------|
| Nested `IntelliConflict-Map/` app | **Keep separate for now.** | Don't merge/delete it this refactor. Just stop it polluting root: gitignore its `node_modules`, keep it excluded from root tooling (tsconfig/vitest already exclude it — verify). Revisit later. Logged in backlog §8. |
| Old contentlayer/pliny/MDX blog stack | **Verify each item before deleting.** | Phase 4 is a *verification-gated* deletion pass, not a blind rm. Every candidate gets the §3.1 protocol before removal. |
| ~9 MB committed data blobs | **Purge generated/build artifacts + gitignore; move real fixtures to LFS/external. No history rewrite.** | Phase 2 removes from tree + ignores going forward. History stays as-is (repo stays large on disk but stops growing). |
| Windows VPS deploy | **Improve but stay on Windows/Task Scheduler.** | Phase 6 packages Python properly, kills path hacks, parameterizes `C:\IntelliTrade\*`, adds a code-transfer/deploy script. No platform migration. |

---

## 3. Working protocols

### 3.1 Dead-code verification protocol (required before any deletion)

A file/dep/asset may only be deleted after **all** of these pass:

1. **Static import search** — grep the whole repo (incl. `app/`, `components/`, `layouts/`, `scripts/`, config files, `sitemap`/`robots`/`rss` generators) for the module name, path, and default+named exports. Zero hits outside the file itself.
2. **Dynamic/config references** — check `next.config.ts` rewrites, `package.json` scripts, `tailwind.config` content globs, `contentlayer.config`, sitemap/RSS builders, and any string-based dynamic import.
3. **Build proof** — remove (or `git mv` to a `_graveyard/` staging dir), run `npm run build` + `npm test`, confirm green.
4. **Runtime spot-check** — for anything user-facing (pages, layouts, components), load the affected route in dev and confirm no regression.

Only after 1–4 is the deletion committed. Batch deletions are fine, but the build proof must cover the whole batch.

### 3.2 Branch / commit conventions
- One phase → one or more focused branches off `main`. Current working branch is `SRL-dev3`; cut refactor branches from `main` unless told otherwise.
- Commit prefixes: `security:`, `chore(git):`, `refactor:`, `chore(deps):`, `test:`, `docs:`.
- Every task-completing commit must have `npm run build` green (and `pytest` green if Python touched).

### 3.3 Definition of done (per task)
Build passes · tests pass · no new `any`/`@ts-ignore` introduced · box checked with a one-line note · committed.

---

## 4. Phased plan

Phases are ordered by **risk-adjusted dependency**: secure first, then remove noise (so later refactors have less surface), then structural dedup, then consistency polish, then hardening.

---

### PHASE 1 — Security (do first, blocks nothing else but is highest priority)

> Rationale: the app currently serves paid data to anyone and leaks a paid API key. This is live risk, independent of code tidiness. Land it first.

**1.1 — [CRITICAL] Enable RLS on all data tables**
- [x] Audit every table in `supabase/migrations/` (002, 003, 004 create tables with no RLS): `conflict_cache`, `scanner_results`, `currency_strength_snapshots`, `fx_strength_snapshots`, `market_candles`, `sr_zones`, `sr_opportunities`, `economic_events`, `fx_candles`, etc.
- [x] Add a new migration `005_enable_rls.sql` that: enables RLS on every table; revokes the default public/anon grants; adds explicit policies — `service_role` full access (writers), and for reader tables either no anon policy (force everything through gated API routes) or a subscription-scoped policy if direct client reads are needed.
- [ ] Verify with the anon key that a raw Supabase REST `SELECT` against each table now returns empty/denied.
- Note (2026-07-04): `005_enable_rls.sql` written — RLS + grant revoke on all 13 tables (incl. 4 dashboard-created ones: `conflict_cache`, `scanner_results`, `currency_strength_snapshots`, `economic_events`). No anon/authenticated policies added — all access via service-role server routes. The two routes that used the anon key (`api/conflicts`, `data/current/[...slug]`) were switched to `supabaseAdmin` so they survive RLS. **⚠️ Migration must still be RUN in the Supabase SQL editor (repo has no CLI-linked migration flow), then the anon-key REST verification done.**

> ⚠️ **This is the linchpin.** With RLS off, the anon key (shipped to every browser) can read/write all tables directly, bypassing every Next.js route. Gating the API routes (1.2) is cosmetic until this lands. Do 1.1 before 1.2.

**1.2 — [HIGH] Gate premium API routes with auth + subscription check**
- [ ] Build one reusable server helper (e.g. `lib/auth/requireSubscription.ts`) that resolves the Supabase session and checks active subscription. Reuse across routes.
- [ ] Apply to: `app/api/sr-alpha/route.ts`, `app/api/conflicts/route.ts`, `app/api/currency-strength/route.ts`, `app/api/currency-strength-history/route.ts`, `app/api/currency-strength-heatmap/route.ts`, `app/api/economic-events/route.ts`, `app/data/current/[...slug]/route.ts`.
- [ ] Decide per-route: fully gated (paid) vs. intentionally public (marketing teaser). Document the decision inline.
- Note:

**1.3 — [HIGH] Stop shipping the paid API key to the browser**
- [x] `NEXT_PUBLIC_CURRENCYFREAKS_API_KEY` is extractable from any visitor's network tab. Used in `app/{gold,silver,bitcoin}-price-today/*Page.tsx`, `components/lot-size-calculator-2.tsx`, and server route `app/api/dxy/route.ts`.
- [x] Move all CurrencyFreaks calls behind a server route (proxy). Rename env var to drop `NEXT_PUBLIC_`. Client components fetch the internal route instead.
- [ ] Rotate the key after it's off the client (it's already been exposed).
- Note (2026-07-04): New `app/api/rates/route.ts` proxy (symbol whitelist, 60s upstream cache, same `{rates}` shape as CurrencyFreaks). All 6 client callsites swapped to `/api/rates?symbols=…`; `/api/dxy` reads server var. Both routes read `CURRENCYFREAKS_API_KEY` with legacy `NEXT_PUBLIC_` fallback. **⚠️ Manual steps left: add `CURRENCYFREAKS_API_KEY` in Vercel, delete the `NEXT_PUBLIC_` var, rotate the key, then remove the fallback (tracked in IMPROVEMENTS.md).**

**1.4 — [MEDIUM] Fix open redirect in auth callback**
- [x] `app/auth/confirm/route.ts` redirects to an unvalidated `next` param. Validate it's a same-origin relative path before `redirect(next)`. Also URL-encode the reflected error string (`L13`).
- Note (2026-07-04): `safeNext()` allows only `/path` (rejects `//host` + absolute URLs); error messages now `encodeURIComponent`ed. Closes M11 + L13.

**1.5 — [MEDIUM] Lock down `/api/scrape` and CORS**
- [x] `app/api/scrape/route.ts` — unauthenticated, spawns a Python process with user-controlled argv. Add auth; validate/whitelist the `since/until/central_banks/global` params before passing to `spawn`.
- [x] `app/data/current/[...slug]/route.ts` — wildcard `Access-Control-Allow-Origin: *`. Restrict to own origin unless a public API is intended.
- Note (2026-07-04): scrape now requires `Authorization: Bearer $SCRAPE_SECRET` (fails closed if unset) + argv strictly validated (ints/bools only). Discovery: the route was already dead — `scraper/cli.py` doesn't exist, it 500s on every call; deletion candidate, logged in IMPROVEMENTS.md. `data/current` CORS wildcard removed entirely (iframes are same-origin via rewrites). Closes M9 + M10.

**1.6 — [MEDIUM] Add rate limiting to public/expensive routes**
- [ ] No app-level rate limiting exists. Add a limiter (e.g. Upstash) at minimum to `/api/scrape`, `/api/newsletter`, and any route left intentionally public.
- Note:

**1.7 — [MEDIUM] Pin Supabase deps**
- [x] `package.json` has `@supabase/ssr: "latest"` and `@supabase/supabase-js: "latest"` — non-deterministic builds. Pin to exact versions.
- Note (2026-07-04): pinned to installed versions `@supabase/ssr@^0.6.1`, `@supabase/supabase-js@^2.50.0`; lockfile synced. Closes M12.

**Phase 1 exit criteria:** raw anon-key REST calls against premium tables are denied; every premium route requires auth; no `NEXT_PUBLIC_` secret remains; deps pinned. Re-run the security scout to confirm.

---

### PHASE 2 — Git hygiene & repo weight (fast wins, shrinks surface for later phases)

> Rationale: removing committed build output and blobs makes every later diff cleaner and clone/CI faster. No history rewrite (decided).

**2.1 — Fix `.gitignore`**
- [ ] Add: `.contentlayer/`, `.cache/`, `*.log`, `__pycache__/`, `.pytest_cache/`, `**/node_modules/` (so nested app deps can never be committed), prebuilt `public/**/assets/index-*.js` if those are generated.
- Note:

**2.2 — Remove committed generated/build output from the tree** (`git rm --cached`, keep on disk where still needed)
- [ ] `.contentlayer/` (13 files, ~1 MB generated cache).
- [ ] `.cache/events-cache.json`.
- [ ] `scraper.log` (log file committed at root).
- [ ] `backend/support_resistance/reports/*` (program outputs under version control).
- [ ] Prebuilt Vite bundles in `public/currency-strength-meter*/assets/` — confirm whether these are build output of a separate source (if so, they belong in a build step, not git).
- Note:

**2.3 — Move real test fixtures out of git into LFS or external store**
- [ ] `backend/support_resistance/fixtures/*.csv.gz` + `*.csv` (~4.4 MB, incl. a **redundant EURUSD M15 2021–2025 dataset pair** — keep one). Decide: Git LFS vs. external bucket + fetch script. Tests must still find them (or a small golden subset stays in-repo).
- [ ] Keep the small `golden_backend_fixture.csv` in-repo (it anchors the regression test); externalize the large ones.
- Note:

**2.4 — Remove root strays & filesystem cruft**
- [ ] `events.json` at root — identify owner; move to `data/` or delete.
- [ ] Empty misnamed folder `c:intellitradesupabasemigrations/` (a botched path, untracked) — delete from disk.
- [ ] `alejoScraper.py` at root — defer to Phase 6 (scraper dedup), just flag here.
- Note:

**Phase 2 exit criteria:** `git status` clean of generated files; no build output tracked; large fixtures externalized with tests still green.

---

### PHASE 3 — Isolate the nested IntelliConflict-Map app (decided: keep separate)

> Rationale: it's staying, but it must stop bleeding into the root project.

**3.1 — Contain it**
- [ ] Confirm root `tsconfig.json` and `vitest.config.ts` exclude `IntelliConflict-Map/` (they currently do — verify after gitignore changes).
- [ ] Ensure its `node_modules` is gitignored (covered by 2.1) and not tracked.
- [ ] Add a short `IntelliConflict-Map/README.md` noting its status: separate app, not part of root build, revisit date. Point back to this plan.
- [ ] Verify root ESLint/prettier don't try to lint into it.
- Note:

**3.2 — Note the duplication (do NOT resolve yet)**
- [ ] Document in backlog §8 that its logic overlaps root `lib/conflicts/*` and its tests duplicate `__tests__/conflicts-route.test.ts` + `scoring.test.ts`. Decision on reconciliation deferred.
- Note:

---

### PHASE 4 — Remove the dead blog/starter stack (verification-gated; decided: verify each)

> Rationale: two CMS stacks coexist. Sanity is live; contentlayer/pliny/MDX appears dead. Every item below must pass the §3.1 protocol before deletion. Expect a few to surprise us (e.g. `app/blog/sitemap.ts` still imports `contentlayer/generated`).

**4.1 — Verify then remove contentlayer**
- [ ] Confirm `contentlayer.config.ts` is 100% commented (it is) and nothing imports `contentlayer/generated` except possibly `app/blog/sitemap.ts`. Fix or repoint that consumer first.
- [ ] Remove config, `.contentlayer/` cache (also in 2.2), and the `contentlayer`/`next-contentlayer` deps.
- Note:

**4.2 — Verify then remove `layouts/blog/*`**
- [ ] Six files (`AuthorLayout`, `ListLayout`, `ListLayoutWithTags`, `PostLayout`, `PostSimple`, `PostBanner`) — audit reports zero imports. Run §3.1, then remove the folder.
- Note:

**4.3 — Verify then handle `data/blog/` MDX + pliny**
- [ ] `data/blog/*.mdx` (starter posts like `the-time-machine.mdx`), `data/authors/`, `data/siteMetadata.js`, `scripts/blog/rss.mjs`, `pliny` dep, `types/pliny.d.ts`.
- [ ] Owner decided verify-first; if content is worth keeping, migrate to Sanity, else remove. Confirm nothing live reads `data/blog`.
- Note:

**4.4 — Remove other verified starter leftovers**
- [ ] `components/hero.tsx`, `next-logo.tsx`, `supabase-logo.tsx`, `deploy-button.tsx`, `env-var-warning.tsx` — Supabase starter cruft. Verify + remove.
- [ ] `components/tutorial/*` — only `fetch-data-steps.tsx` is used (by `app/protected/page.tsx`, itself a starter page). Decide whether `/protected` stays; if not, remove the page + tutorial folder together.
- [ ] `styles/prism.css` — no active MDX/Prism pipeline. Verify + remove.
- Note:

**4.5 — Remove dead dependencies**
- [ ] tsparticles **v3** packages (`@tsparticles/engine`, `@tsparticles/react`, `@tsparticles/slim`, `tsparticles@3`) are unused — only **v2** (`react-tsparticles`, `tsparticles-slim`, `tsparticles-engine`) is imported by `components/particles.tsx`. Remove v3. (Or, better, upgrade to v3 and remove v2 — pick one; note the choice.)
- [ ] `pliny`, `contentlayer` deps (from 4.1/4.3).
- Note:

**Phase 4 exit criteria:** one CMS stack (Sanity) remains; `npm run build` green; no orphaned MDX/contentlayer/pliny references; dependency count down.

---

### PHASE 5 — Frontend consistency & config

> Rationale: with dead code gone, standardize what's left.

**5.1 — Resolve the Tailwind v3/v4 mismatch**
- [ ] Both `tailwindcss@3.4` and `@tailwindcss/postcss@4.1` are installed; postcss + config are v3-style. Decide: **commit to one**. Recommended: finish the v4 migration (the project already pulls the v4 postcss plugin) OR drop the v4 package and stay v3 cleanly. Don't leave both.
- [ ] Consolidate the three global stylesheets (`styles/tailwind.css`, `styles/main.css` @ 1,301 lines, `app/globals.css`) — `main.css` is a legacy Fluent/Office god-sheet; audit what's still referenced, delete dead rules, keep one canonical entry.
- Note:

**5.2 — Standardize a data-fetching pattern**
- [ ] No data lib today: 68 client components, 86 `useEffect`, 32 raw `fetch`, direct Supabase client calls in auth components. Pick a convention (recommended: server components + a thin typed fetch wrapper, or introduce `@tanstack/react-query` for client data). Document it, then migrate the price pages + panels incrementally.
- [ ] Centralize auth mutations (login/signup/logout/password) out of components into `lib/auth/` helpers.
- Note:

**5.3 — Component organization & naming**
- [ ] Pick one naming convention (recommend PascalCase for components) and one structure (by-feature). Plan the moves; execute as pure `git mv` commits (no logic change).
- [ ] Convert the untyped `.jsx` islands in `components/dashboardv2/` to `.tsx` (`ConflictMapModule.jsx` 1,757 lines, `BullBearGame.jsx`, `MacroMasteryModule.jsx`, `IntelliJournalModule.jsx`, `ModulePageShell.jsx`, `BullBearExperience.jsx`).
- Note:

**5.4 — De-duplicate components**
- [ ] `lot-size-calculator.tsx` (v1, unused) — remove; keep `-2`, then rename `-2` → canonical.
- [ ] `MobileNav.tsx` vs `blog/MobileNav.tsx`; `theme-switcher.tsx` vs `blog/ThemeSwitch.tsx`; `strength-panel.tsx` vs `strength-panel-native.tsx` — reconcile to one each.
- [ ] Two newsletter API routes (`app/api/newsletter/` vs near-empty `app/blog/api/newsletter/`) — remove the stub.
- Note:

**5.5 — Extract business logic to `lib/`**
- [ ] Domain math currently inlined in giant components (`lot-size-calculator-2.tsx` 682, `strength-panel-native.tsx` 740, `calendar-panel.tsx` 699) — pull pure logic into `lib/` modules with unit tests.
- Note:

**5.6 — TypeScript hardening**
- [ ] Only 15 `any` and ~0 `@ts-ignore` — good baseline. After `.jsx`→`.tsx` conversion, consider enabling `noUncheckedIndexedAccess` + `noImplicitReturns`. Create a shared `types/domain/` for scattered domain types (`dashboardv2/types.ts`, `lib/conflicts/schema.ts`).
- Note:

---

### PHASE 6 — Python: dedup, packaging, deploy (decided: stay Windows/VPS)

> Rationale: highest-effort area. Sequence: pick canonical copies → package → kill path hacks → tame the monolith → deploy script → tests.

**6.1 — Collapse the triple-duplicated currency-strength engine**
- [ ] Three drifting copies of one algorithm: `claudeLoad/...v1_5_2 (1).py` (MT5 original) → `scripts/currency_strength_scanner_{daily,intraday}.py` (OANDA port) → `scripts/vps/strength_core.py` ("verbatim copy"). Pick **one canonical `strength_core`** in the package, parameterize the feed (MT5 vs OANDA) via an adapter, delete the rest.
- Note:

**6.2 — Resolve the two economic-calendar scrapers**
- [ ] `alejoScraper.py` (root, 1,069) vs `scripts/economic_calendar_scraper.py` (14,565). Determine canonical (likely the scripts one), remove the other. Then plan taming the monolith.
- Note:

**6.3 — Tame the 14,565-line scraper monolith**
- [ ] 270 defs, 45+ oversized functions (five ≥400 lines), 183 broad excepts, machine-patched provenance, 0 tests. Split by source (one module per central bank/agency), extract a shared fetch/parse framework, add tests per source incrementally. This is a mini-project on its own — schedule across multiple sessions.
- Note:

**6.4 — Package the Python properly**
- [ ] Add `pyproject.toml` making `backend/support_resistance` (and a new `intellitrade_scanners` package for the scripts) pip-installable. This alone removes most of the 7 sys.path hacks.
- [ ] Kill the cross-tree hack where `backend/support_resistance/fetch_candles.py` inserts `scripts/vps` onto `sys.path` — restructure so shared code lives in one importable place.
- Note:

**6.5 — Consolidate dependencies**
- [ ] Two disjoint, effectively-unpinned `requirements.txt` with coverage gaps (`numpy`/`pandas`/`MetaTrader5` inconsistent). Move to `pyproject.toml` with pinned versions + a lockfile; split runtime vs dev.
- Note:

**6.6 — Parameterize paths & config**
- [ ] Hardcoded `C:\IntelliTrade\*` in `scripts/vps/setup_windows_tasks.ps1`, `config_template.env`, `export_eurusd_m15.py`. Move to env/config with sensible defaults so the tree isn't Windows-path-locked.
- [ ] Replace 115 `print()` debug calls in the backend runners with `logging`.
- Note:

**6.7 — Add a deploy/transfer script (stay Windows/Task Scheduler)**
- [ ] Today "deploy" = hand-copy files to `C:\IntelliTrade\scanner\` + manually configure Task Scheduler. Add a scripted transfer (robocopy/git pull on the VPS + a bootstrap that installs the package and registers tasks). Document the one unavoidable manual step (Task Scheduler "run whether logged in or not" password).
- Note:

**6.8 — Python tests**
- [ ] ~88% of Python is untested. Backend package has a golden-fixture suite (good). Add tests for the scanners (post-dedup) and the scraper (per-source, post-split). Set a coverage floor in CI.
- Note:

---

### PHASE 7 — Testing & CI (cross-cutting, hardens everything above)

**7.1 — Frontend test coverage**
- [ ] Only 3 root tests, all conflict-map. Add tests for: lot-size calc logic (post-extraction 5.5), stripe webhook handling, auth flows, the gated-route helper (1.2).
- Note:

**7.2 — Wire the nested app's tests OR formally exclude**
- [ ] `IntelliConflict-Map`'s 9 tests never run in root `npm test`. Since it's staying separate (decided), document that its tests run via its own runner; don't silently leave them dead.
- Note:

**7.3 — CI pipeline**
- [ ] Add CI (if absent) running: `npm run build`, `npm test`, `tsc --noEmit`, `pytest`, lint. Gate merges on green. Add the security regression check (anon key can't read premium tables).
- Note:

---

## 5. Suggested session sequencing

| Session | Focus | Why this order |
|---------|-------|----------------|
| 1 (this) | Audit + plan | Done. |
| 2 | Phase 1.1–1.3 (RLS, route gating, key) | Highest risk, live exposure. |
| 3 | Phase 1.4–1.7 + Phase 2 (git hygiene) | Finish security, then shrink repo surface. |
| 4 | Phase 3 + Phase 4.1–4.2 (isolate nested app, kill contentlayer/layouts) | Remove noise before restructuring. |
| 5 | Phase 4.3–4.5 (finish dead-stack removal + deps) | Fewer deps, one CMS. |
| 6 | Phase 5.1–5.2 (Tailwind, data-fetching convention) | Foundational frontend consistency. |
| 7 | Phase 5.3–5.6 (org, .jsx→.tsx, dedup, TS) | Bulk frontend cleanup. |
| 8+ | Phase 6 (Python) split across several sessions | Largest effort; the scraper alone is multi-session. |
| Last | Phase 7 (tests + CI) | Lock in the gains. |

Order is a default, not a contract — reprioritize per session as needed.

---

## 6. Security findings register (from audit)

Full detail lives in Phase 1. Register for tracking:

| ID | Sev | Finding | Status |
|----|-----|---------|--------|
| C1 | CRITICAL | RLS off on all tables except `subscriptions`; public anon key → full direct DB read/write | ◐ migration 005 written — **must be run in Supabase + verified** |
| H2 | HIGH | `/api/sr-alpha` no auth | ☐ open |
| H3 | HIGH | `/api/conflicts` no auth | ☐ open |
| H4 | HIGH | currency-strength + `data/current` endpoints no auth | ☐ open |
| H5 | HIGH | `/api/economic-events` no auth | ☐ open |
| H6 | HIGH | middleware matcher excludes `/api` entirely | ☐ open |
| H7 | HIGH | `NEXT_PUBLIC_CURRENCYFREAKS_API_KEY` exposed to browser | ◐ code fixed (proxy) — Vercel env rename + key rotation pending |
| M8 | MED | No rate limiting anywhere | ☐ open |
| M9 | MED | Wildcard CORS on `data/current` | ✅ fixed 2026-07-04 |
| M10 | MED | `/api/scrape` unauth, user-controlled argv to `spawn` | ✅ fixed 2026-07-04 (route was also dead — see IMPROVEMENTS.md) |
| M11 | MED | Open redirect via `next` param in `auth/confirm` | ✅ fixed 2026-07-04 |
| M12 | MED | Supabase deps pinned to `latest` | ✅ fixed 2026-07-04 |
| L13 | LOW | Reflected unencoded auth error string | ✅ fixed 2026-07-04 |
| L14 | LOW | JSON-LD `dangerouslySetInnerHTML` from CMS without `</script>` escaping | ☐ open |

**Confirmed healthy (no action):** Stripe webhook signature verified; Stripe checkout/portal auth-checked, price from server env; no hardcoded secrets in git; `.env.local` gitignored; Python uses parameterized Supabase calls (no SQL injection surface); only 2 truly-bare Python excepts.

---

## 7. Metrics to track (before → after)

Capture at start of each phase to show progress:

- Tracked files (start: **392**)
- Repo size on disk / largest tracked blob
- npm dependency count
- `'use client'` count (start: **68**)
- `useEffect` / raw `fetch` counts (start: **86 / 32**)
- `any` count (start: **15**)
- `.jsx` files in a TS codebase (start: **6** in dashboardv2)
- Largest files (start: `ConflictMapModule.jsx` 1,757; `economic_calendar_scraper.py` 14,565; `styles/main.css` 1,301)
- Python packaged? (start: **no**) / sys.path hacks (start: **7**)
- Test count (start: 3 root TS + 9 nested + 9 python)
- Open security findings (start: **14**)

---

## 8. Backlog / deferred (not scheduled this refactor)

- **Reconcile or retire the nested `IntelliConflict-Map/` app.** It duplicates root `lib/conflicts/*` and conflict tests. Decided to keep separate for now; revisit whether to merge its (possibly newer) logic into root or delete one copy.
- **Duplicate data assets** — `world.topo.json` and `conflicts.sample.geojson` exist in both `public/` and the nested app; `opengraph-image.png`/`twitter-image.png` identical size (possible dup). Dedup when the nested-app decision is made.
- **`vercel.json` is empty (`{}`)** and `sanity/` has only a client (no schemas in-repo) — decide whether Studio/schemas should live here.
- **`/protected` starter page** — decide if it stays; ties to tutorial-folder removal (4.4).
- **Git history rewrite** — explicitly deferred. If repo on-disk size becomes a real problem, revisit `git-filter-repo` as a separate, announced operation.

---

## 9. Changelog

- **2026-07-04** — Initial plan created from a 4-scout parallel audit (structure, frontend, security, python). Owner decisions locked (§2). No code changed this session.
- **2026-07-04 (session 2, branch `refactor/phase1-security`)** — Phase 1 largely done: 005 RLS migration written (⚠️ run it in Supabase); `api/conflicts` + `data/current` switched anon→service-role; `/api/rates` proxy added, CurrencyFreaks key off the browser (⚠️ Vercel env rename + rotation pending); open redirect fixed; `/api/scrape` gated + argv validated (route found dead — `scraper/cli.py` missing); CORS wildcard removed; Supabase deps pinned. Build + 61 tests green. Remaining Phase 1: **1.2 route gating (needs owner paid-vs-public call), 1.6 rate limiting**. Added `IMPROVEMENTS.md` (product-idea backlog, separate from this plan).
