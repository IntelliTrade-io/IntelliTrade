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
5. Product/architecture ideas → `IMPROVEMENTS.md`. Actions only the owner can do (credentials, merges, external accounts), non-critical → `OWNER_TODO.md` (owner executes post-refactor or at the noted unblock date).

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
- [x] Verify with the anon key that a raw Supabase REST `SELECT` against each table now returns empty/denied.
- Note (2026-07-04, later): **owner ran 005 in Supabase; verified via REST with the anon key — all 8 premium tables return `42501 permission denied`. C1 closed.**
- Note (2026-07-04): `005_enable_rls.sql` written — RLS + grant revoke on all 13 tables (incl. 4 dashboard-created ones: `conflict_cache`, `scanner_results`, `currency_strength_snapshots`, `economic_events`). No anon/authenticated policies added — all access via service-role server routes. The two routes that used the anon key (`api/conflicts`, `data/current/[...slug]`) were switched to `supabaseAdmin` so they survive RLS. **⚠️ Migration must still be RUN in the Supabase SQL editor (repo has no CLI-linked migration flow), then the anon-key REST verification done.**

> ⚠️ **This is the linchpin.** With RLS off, the anon key (shipped to every browser) can read/write all tables directly, bypassing every Next.js route. Gating the API routes (1.2) is cosmetic until this lands. Do 1.1 before 1.2.

**1.2 — [HIGH] Gate premium API routes with auth + subscription check**
- [x] Build one reusable server helper (e.g. `lib/auth/requireSubscription.ts`) that resolves the Supabase session and checks active subscription. Reuse across routes.
- [x] Apply to: `app/api/sr-alpha/route.ts`, `app/api/conflicts/route.ts`, `app/api/currency-strength/route.ts`, `app/api/currency-strength-history/route.ts`, `app/api/currency-strength-heatmap/route.ts`, `app/api/economic-events/route.ts`, `app/data/current/[...slug]/route.ts`.
- [x] Decide per-route: fully gated (paid) vs. intentionally public (marketing teaser). Document the decision inline.
- Note (2026-07-04): Owner locked the tier model — **free = blog + lot size calculator + prices-today pages; everything else premium (subscription)**. All 7 routes now call `requireSubscription()` (401 no session / 403 no active sub; reads `subscriptions` via cookie-scoped client, compatible with the 001 RLS policy). Middleware rewritten to match: premium page shells (`/dashboardv2`, `/support-resistance`, `/conflict-map`, `/currency-strength-meter*`, legacy `/dashboard` until 4.3b removes it) redirect to `/upgrade`; free-tier paths remain excluded from the matcher. Closes H2–H6. Free-module ideas logged in IMPROVEMENTS.md.

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
- [x] ~~Add a limiter (e.g. Upstash)~~ **Descoped (owner + architect, 2026-07-04).** After 1.1/1.2 the threat shrank: premium routes 401 pre-data, `/api/scrape` is secret-gated dead code, Supabase rate-limits auth itself, Vercel absorbs crude floods. The one concrete abuse left — burning paid CurrencyFreaks quota via novel symbol combos on public `/api/rates` — is fixed structurally instead: symbols now validate against a closed 13-code whitelist (app's exact needs), so combos can't bypass the 60s upstream cache indefinitely. Revisit only if a public teaser endpoint ships (see IMPROVEMENTS.md free-module ideas) or Vercel bills show abuse.
- Note: `/api/newsletter` spam remains a low-stakes gap — acceptable; revisit with the teaser endpoints.

**1.7 — [MEDIUM] Pin Supabase deps**
- [x] `package.json` has `@supabase/ssr: "latest"` and `@supabase/supabase-js: "latest"` — non-deterministic builds. Pin to exact versions.
- Note (2026-07-04): pinned to installed versions `@supabase/ssr@^0.6.1`, `@supabase/supabase-js@^2.50.0`; lockfile synced. Closes M12.

**Phase 1 exit criteria:** raw anon-key REST calls against premium tables are denied; every premium route requires auth; no `NEXT_PUBLIC_` secret remains; deps pinned. Re-run the security scout to confirm.

---

### PHASE 2 — Git hygiene & repo weight (fast wins, shrinks surface for later phases)

> Rationale: removing committed build output and blobs makes every later diff cleaner and clone/CI faster. No history rewrite (decided).

**2.1 — Fix `.gitignore`**
- [x] Add: `.contentlayer/`, `.cache/`, `*.log`, `__pycache__/`, `.pytest_cache/`, `**/node_modules/` (so nested app deps can never be committed), prebuilt `public/**/assets/index-*.js` if those are generated.
- Note (2026-07-04, session 3): done — `node_modules/` now matches at any depth; added `.contentlayer/`, `.cache/`, `*.log`, `__pycache__/`, `.pytest_cache/`, `*.pyc`, `/backend/support_resistance/reports/`, `/events.json`. Vite bundles NOT ignored — see 2.2 note (they have no in-repo source; they're the deployed artifact).

**2.2 — Remove committed generated/build output from the tree** (`git rm --cached`, keep on disk where still needed)
- [x] `.contentlayer/` (13 files, ~1 MB generated cache).
- [x] `.cache/events-cache.json`.
- [x] `scraper.log` (log file committed at root).
- [x] `backend/support_resistance/reports/*` (program outputs under version control).
- [x] Prebuilt Vite bundles in `public/currency-strength-meter*/assets/` — confirm whether these are build output of a separate source (if so, they belong in a build step, not git).
- Note (2026-07-04, session 3): all untracked via `git rm --cached` (2,920 lines gone), kept on disk. Prerequisite: `app/blog/sitemap.ts` was the last live `.contentlayer` consumer — rewritten to query Sanity for post slugs (separate `refactor:` commit; also fixes stale sitemap advertising dead MDX starter posts). **Vite bundles: KEEP TRACKED** — searched repo, no Vite source exists here (bundles are the only copy; built externally). Logged in IMPROVEMENTS.md: bring meter source in-repo with a build step. Build + 61 tests green.

**2.3 — Move real test fixtures out of git into LFS or external store**
- [x] `backend/support_resistance/fixtures/*.csv.gz` + `*.csv` (~4.4 MB, incl. a **redundant EURUSD M15 2021–2025 dataset pair** — keep one). ~~Decide: Git LFS vs. external bucket + fetch script.~~ **Owner decision 2026-07-04: keep in-repo, skip LFS.** Tests keep finding them unchanged.
- [x] Keep the small `golden_backend_fixture.csv` in-repo (it anchors the regression test); ~~externalize the large ones~~ large ones stay too (owner decision).
- Note (2026-07-04, session 3, state mapped): tracked = `controlled_qc_oanda_*` pair (1.4 MB gz + manifest) + `controlled_zone_events_reference.csv` (1.2 MB) + phase39 fixture (153 KB) — all consumed by `validate_zone_fixture.py`. UNtracked on disk = `eurusd_m15_2021_2025_quantconnect_oanda_mid.csv.gz` (1.6 MB) + manifest, from the SR validation rebuild (same 124,092 rows/range as controlled pair, different lineage — see controlled manifest's `important_note`). **Do NOT commit the untracked pair.** LFS-vs-bucket decision pending owner (recommendation: keep controlled pair in-repo for now — 2.6 MB, tests depend on it, LFS adds clone friction on the Windows VPS; revisit only if repo weight actually hurts).

**2.4 — Remove root strays & filesystem cruft**
- [x] `events.json` at root — identify owner; move to `data/` or delete.
- [x] Empty misnamed folder `c:intellitradesupabasemigrations/` (a botched path, untracked) — delete from disk.
- [x] `alejoScraper.py` at root — defer to Phase 6 (scraper dedup), just flag here.
- Note (2026-07-04, session 3): `events.json` untracked + gitignored in 2.2 (scraper output, regenerated at runtime; stays on disk). Misnamed folder already gone from disk (verified root listing). `alejoScraper.py` still at root, tracked — flagged, Phase 6.2 decides canonical.

**Phase 2 exit criteria:** `git status` clean of generated files; no build output tracked; ~~large fixtures externalized~~ fixtures decision made (kept in-repo, owner call) with tests still green. **✅ Phase 2 complete 2026-07-04.**

---

### PHASE 3 — Isolate the nested IntelliConflict-Map app (decided: keep separate)

> Rationale: it's staying, but it must stop bleeding into the root project.

**3.1 — Contain it**
- [x] Confirm root `tsconfig.json` and `vitest.config.ts` exclude `IntelliConflict-Map/` (they currently do — verify after gitignore changes).
- [x] Ensure its `node_modules` is gitignored (covered by 2.1) and not tracked.
- [x] Add a short `IntelliConflict-Map/README.md` noting its status: separate app, not part of root build, revisit date. Point back to this plan.
- [x] Verify root ESLint/prettier don't try to lint into it.
- Note (2026-07-04, session 3): tsconfig ✓ / vitest ✓ / node_modules 0 tracked ✓ (60 app files tracked, doubly-nested `IntelliConflict-Map/IntelliConflict-Map/`). ESLint/prettier were NOT excluding it — added `ignores` block to `eslint.config.mjs` (also claudeLoad, .next, public) and created root `.prettierignore`. README added. Lint = same 5 pre-existing root warnings only; build + 61 tests green.

**3.2 — Note the duplication (do NOT resolve yet)**
- [x] Document in backlog §8 that its logic overlaps root `lib/conflicts/*` and its tests duplicate `__tests__/conflicts-route.test.ts` + `scoring.test.ts`. Decision on reconciliation deferred.
- Note (2026-07-04, session 3): already in §8 (first bullet); also restated in the new nested README so nobody "fixes" the duplication ad hoc. **✅ Phase 3 complete 2026-07-04.**

---

### PHASE 4 — Remove the dead blog/starter stack (verification-gated; decided: verify each)

> Rationale: two CMS stacks coexist. Sanity is live; contentlayer/pliny/MDX appears dead. Every item below must pass the §3.1 protocol before deletion. Expect a few to surprise us (e.g. `app/blog/sitemap.ts` still imports `contentlayer/generated`).

**4.1 — Verify then remove contentlayer**
- [x] Confirm `contentlayer.config.ts` is 100% commented (it is) and nothing imports `contentlayer/generated` except possibly `app/blog/sitemap.ts`. Fix or repoint that consumer first.
- [x] Remove config, `.contentlayer/` cache (also in 2.2), and the `contentlayer`/`next-contentlayer` deps.
- Note (2026-07-04, session 4): config 100% commented ✓; sitemap already repointed to Sanity in 2.2. Deps were already absent from `package.json` (only `pliny` remained). Deleted `contentlayer.config.ts` + `scripts/blog/` (`rss.mjs` + `postbuild.mjs` — only consumer was postbuild, which no npm script ever ran).

**4.2 — Verify then remove `layouts/blog/*`**
- [x] Six files (`AuthorLayout`, `ListLayout`, `ListLayoutWithTags`, `PostLayout`, `PostSimple`, `PostBanner`) — audit reports zero imports. Run §3.1, then remove the folder.
- Note (2026-07-04, session 4): zero imports confirmed (only refs were frontmatter strings in the dead starter MDX). Whole `layouts/` dir removed (contained only `blog/`).

**4.3 — Verify then handle `data/blog/` MDX + pliny**
- [x] `data/blog/*.mdx` (starter posts like `the-time-machine.mdx`), `data/authors/`, `data/siteMetadata.js`, `scripts/blog/rss.mjs`, `pliny` dep, `types/pliny.d.ts`.
- [x] Owner decided verify-first; if content is worth keeping, migrate to Sanity, else remove. Confirm nothing live reads `data/blog`.
- Note (2026-07-04, session 4): all 11 MDX = template demo posts (tailwind-starter docs, time-machine, canada pics) — nothing worth migrating; deleted with `authors/`, `headerNavLinks.ts`, `projectsData.ts`, `references-data.bib`, `logo.svg`. **KEPT `siteMetadata.js`** — live config for `app/layout.tsx`, `app/page.tsx`, `app/blog/{Main,theme-providers,sitemap}`. Pliny surprises: (a) last real usage was `SearchProvider` in `app/layout.tsx` — dead weight (kbar pointing at nonexistent `/search.json`, no search button anywhere) → removed wrapper; (b) two files imported via `@/node_modules/pliny/utils/formatDate` (grep-evading path) → replaced with new 7-line `lib/formatDate.ts`. `types/pliny.d.ts` + `pliny` dep removed. Also dropped `remark-github-blockquote-alert` (CSS import in layout was the only live ref; the remark plugin itself only lived in the commented contentlayer config).

**4.3b — Remove legacy `/dashboard` (owner decision 2026-07-04)**
- [x] Old `/dashboard` is legacy — superseded by `/dashboardv2`. Remove `app/dashboard/page.tsx` (320 lines) and redirect `/dashboard` → `/dashboardv2` (or to `/upgrade` for non-subscribers). Update any nav links pointing at it. Its economic-events consumption is moot once removed (API now subscription-gated anyway).
- Note (2026-07-04, session 4): page deleted; permanent redirect added in `next.config.ts` (`redirects()` runs before middleware, so `/dashboard` 308s to `/dashboardv2`, which middleware still gates). `"/dashboard"` dropped from middleware `PREMIUM_PREFIXES` (`/dashboardv2` entry covers the post-redirect path). No nav links pointed at it (login + user-dropdown already target `/dashboardv2`). Verified live: `curl /dashboard` → 308 → `/dashboardv2`.

**4.4 — Remove other verified starter leftovers**
- [x] `components/hero.tsx`, `next-logo.tsx`, `supabase-logo.tsx`, `deploy-button.tsx`, `env-var-warning.tsx` — Supabase starter cruft. Verify + remove.
- [x] `components/tutorial/*` — only `fetch-data-steps.tsx` is used (by `app/protected/page.tsx`, itself a starter page). Decide whether `/protected` stays; if not, remove the page + tutorial folder together.
- [x] `styles/prism.css` — no active MDX/Prism pipeline. Verify + remove.
- Note (2026-07-04, session 4): all removed. `/protected` decision: **removed** (starter demo page; only live ref was `update-password-form.tsx` post-update redirect → repointed to `/dashboardv2`, consistent with login flow). `env-var-warning` was only imported by the deleted `protected/layout.tsx`. Scope addition (forced): 15 more dead files in `components/blog/` deleted — `Tag.tsx` broke the build post-pliny (imported `github-slugger`, a transitive dep that vanished), and the sweep showed everything there dead except `Link.tsx` + `social-icons/` (kept, used by Footer/Main/not-found). Deleted: BlogWrapper, Card, Comments, Header, Image, Layout, LayoutWrapper, MDXComponents, MobileNav, PageTitle, ScrollTopAndComment, SearchButton, SectionContainer, TableWrapper, Tag, ThemeSwitch. (This pre-empts most of the 5.4 blog-component dedup.)

**4.5 — Remove dead dependencies**
- [x] tsparticles **v3** packages (`@tsparticles/engine`, `@tsparticles/react`, `@tsparticles/slim`, `tsparticles@3`) are unused — only **v2** (`react-tsparticles`, `tsparticles-slim`, `tsparticles-engine`) is imported by `components/particles.tsx`. Remove v3. (Or, better, upgrade to v3 and remove v2 — pick one; note the choice.)
- [x] `pliny`, `contentlayer` deps (from 4.1/4.3).
- Note (2026-07-04, session 4): removed v3 set (zero imports; v2 stays — zero code change, upgrade-to-v3 logged as an option for 5.x). Removed `pliny` + `remark-github-blockquote-alert`; `contentlayer` deps were already gone. Net: 6 deps dropped.

**Phase 4 exit criteria:** one CMS stack (Sanity) remains; `npm run build` green; no orphaned MDX/contentlayer/pliny references; dependency count down.

---

### PHASE 5 — Frontend consistency & config

> Rationale: with dead code gone, standardize what's left.

**5.1 — Resolve the Tailwind v3/v4 mismatch**
- [x] Both `tailwindcss@3.4` and `@tailwindcss/postcss@4.1` are installed; postcss + config are v3-style. Decide: **commit to one**. ~~Recommended: finish the v4 migration~~ **Owner decision 2026-07-04: stay v3, drop the v4 package.** v4 migration deferred to post-refactor.
- [x] Consolidate the three global stylesheets (`styles/tailwind.css`, `styles/main.css` @ 1,301 lines, `app/globals.css`) — `main.css` is a legacy Fluent/Office god-sheet; audit what's still referenced, delete dead rules, keep one canonical entry.
- Note (2026-07-04, session 4): 3 sheets → 2. Discovery: **Tailwind core was emitted twice** (`tailwind.css` and `globals.css` both had `@tailwind` directives, and v3 requires them in any file using `@layer` — so the duplication was structural until the files merged). `globals.css` is now the single Tailwind entry (theme vars + base + prose merged in); `tailwind.css` deleted; import order `main.css → globals.css` preserves the old effective cascade (core after main.css). `main.css` audited per-selector with a word-boundary usage scan (scripted): 59 dead classes deleted (Brevo `sib-form` embed, old economic-calendar layout, v1 lot-calc inputs, spin-button demo, facebook/linkedIn buttons, Fluent cruft) → 1,301 → ~110 lines. Gotchas preserved: `--brand-primary(-light)` vars live in main.css and are consumed by `tailwind.config.ts` — NOT dead; `.radial-backdrop` needed `pointer-events:none` carried over from its removed duplicate. Verified: build + 61 tests green, emitted CSS diffed for live-present/dead-absent, prod sweep 200s.

**5.2 — Standardize a data-fetching pattern**
- [x] No data lib today: 68 client components, 86 `useEffect`, 32 raw `fetch`, direct Supabase client calls in auth components. Pick a convention ~~(recommended: server components + a thin typed fetch wrapper, or introduce `@tanstack/react-query` for client data)~~ **Owner decision 2026-07-04: RSC + thin typed fetch wrapper, no react-query** (revisit only if the polling dashboards hurt). Document it, then migrate the price pages + panels incrementally.
- [x] Centralize auth mutations (login/signup/logout/password) out of components into `lib/auth/` helpers.
- Note (2026-07-04, session 4): **The convention** — server components fetch directly (Supabase/Sanity server clients); client components call internal routes ONLY via `lib/api/client.ts` (`apiGet`/`apiPost`: no-store default, throws `ApiError` with the route's `{error}` body message); shared domain fetchers live in `lib/api/*` (`market.ts`: `fetchUsdPrice`/`fetchDxy`/`fetchTenYearYield` — the 4 price pages had 10+ hand-rolled copies of the same three fetchers); auth mutations only via `lib/auth/client.ts` (`signInWithPassword`/`signUpWithPassword`/`signOut`/`requestPasswordReset`/`updatePassword`). Migrated: 5 auth forms + AccountClient (also its inline supabase password/signout), 4 price pages, UpgradeButton/ManageBillingButton, NewsletterForm, calendar-panel, strength-panel-native (2 hooks), SupportResistanceAlphaLive, lot-size-calculator-2. Deferred: `ConflictMapModule.jsx` fetch (migrates with its 5.3 `.jsx→.tsx` conversion). ⚠️ Flag for owner: sign-up's `emailRedirectTo` targets `/auth/callback`, a route that doesn't exist (only `/auth/confirm`) — pre-existing; behavior preserved in the helper; verify the Supabase email template before touching (logged in OWNER_TODO.md).

**5.3 — Component organization & naming**

Target structure (owner 2026-07-04: "modern standards, use the official Next file conventions"):
- `app/` holds **route files only** (`page/layout/route/sitemap/robots/not-found` + special files) — plus, per Next convention, route-**private** components in `app/<route>/_components/` when used by exactly one route (pattern already present: `app/upgrade/_components/`). So: the four `*PriceTodayPage.tsx` bodies, `AccountClient.tsx`, `BlogClientPage.tsx` → each route's `_components/`; `gold-price-today/lib/pricePageBrand.tsx` → `_components/` (shared across the 4 price routes → actually `components/price-pages/`); `blog/Main.tsx`, `blog/theme-providers.tsx` → `app/blog/_components/`; `blog/seo.tsx` dead — delete.
- `components/<feature>/` for anything used by 2+ routes: `auth/` (login/sign-up/forgot/update/logout forms, auth-button, user-dropdown), `blog/` (exists), `dashboardv2/` (exists), `price-pages/`, `layout/` (Footer, MobileNav, nav-links, theme-switcher, particles), `ui/` (exists).
- **PascalCase filenames** for all components — fixes the 3-way mix (`Footer.tsx` / `auth-button.tsx` / `tradingView.tsx`).
- Non-component homes: pure logic → `lib/` (5.5), domain types → `types/` (5.6), one stylesheet entry (5.1). Root `data/` dissolves once `siteMetadata.js` finds a home (`lib/` or inline config). Non-Next roots (`backend/`, `scripts/`, `supabase/`, `sanity/`) are legitimate and stay; Python side is Phase 6's job. `assets/` → decide: static-import images can live in `app/` or stay; low priority.

- [x] Delete `app/blog/seo.tsx` (100% commented; Phase 4 leftover).
- [x] Execute the moves as pure `git mv` commits (no logic change), one feature at a time, import paths updated per batch; build green per batch.
- [x] Convert the untyped `.jsx` islands in `components/dashboardv2/` to `.tsx` — **4 of 6 done** (`ModulePageShell`, `BullBearExperience`, `MacroMasteryModule`, `IntelliJournalModule`; panels' `require('...jsx')` typecheck-dodges replaced with real imports). **Deferred:** `ConflictMapModule.jsx` (1,757) and `generated/BullBearGame.jsx` (734, canvas game) — each is its own sitting; `allowJs` keeps them compiling.
- [x] Lock the final convention into repo `CLAUDE.md` (per §5-conventions-home rule) so it survives the refactor.
- Note (2026-07-04, session 4): executed in 4 commits (dead-file batch, app/_components moves, components-by-feature + PascalCase, jsx→tsx). Extra dead files found by inventory: `app/blog/{theme-providers,robots.ts,tag-data.json}`, blog newsletter API stub, `components/{theme-switcher,tradingView,logout-button}.tsx` (all zero importers). `components/` root now = 8 feature folders, zero loose files; `app/` = route files + `_components/` only. Repo `CLAUDE.md` created with structure/data/styling/security/workflow conventions. tsc --noEmit clean; build + 61 tests green per batch.

**5.4 — De-duplicate components**
- [x] `lot-size-calculator.tsx` (v1, unused) — remove ✅ (2026-07-04, zero importers; its `#position-size-calculator-564055` CSS died with it in 5.1); rename done in 5.3: now `components/calculators/LotSizeCalculator.tsx`.
- [x] ~~`MobileNav.tsx` vs `blog/MobileNav.tsx`; `theme-switcher.tsx` vs `blog/ThemeSwitch.tsx`~~ (blog copies deleted in 4.4; root `theme-switcher` itself proved dead and died in 5.3); `strength-panel.tsx` vs `strength-panel-native.tsx` — reconciled 2026-07-04: old `strength-panel.tsx` (79 lines, zero importers) deleted; `-native` (739 lines, the live one) renamed to canonical `strength-panel.tsx`; sole importer (`Dashboard.tsx`) repointed. Export names (`*Native`) untouched — symbol rename belongs with the 5.5 extraction.
- [x] Two newsletter API routes (`app/api/newsletter/` vs near-empty `app/blog/api/newsletter/`) — remove the stub. ✅ removed in the 5.3 dead-file batch. **5.4 complete 2026-07-04.**
- Note:

**5.5 — Extract business logic to `lib/`**
- [x] Domain math currently inlined in giant components (`lot-size-calculator-2.tsx` 682, `strength-panel-native.tsx` 740, `calendar-panel.tsx` 699) — pull pure logic into `lib/` modules with unit tests.
- Note (2026-07-05, session 5): three new lib modules, 42 new tests (suite 61 → 103). `lib/strength.ts` (pair math, verbatim move, 12 tests); `lib/calendar.ts` (tz math + event transform + PMI clustering + date filters — tz and clock made injectable params with behavior-preserving defaults, 14 tests incl. day-rollover and Sunday week-edge); `lib/lot-size.ts` (pip/contract conventions + `rateFromUsdRates` + `computeLotSize` untangled from async closures, 16 tests over the money math). Components now orchestrate fetch/UI only. Layering note for 5.6: `lib/calendar.ts` imports types from `components/dashboardv2/types` — move those to `types/domain/` when 5.6 creates it. This closes 7.1's "lot-size calc logic" test item early.

**5.6 — TypeScript hardening**
- [x] Only 15 `any` and ~0 `@ts-ignore` — good baseline. After `.jsx`→`.tsx` conversion, consider enabling `noUncheckedIndexedAccess` + `noImplicitReturns`. Create a shared `types/domain/` for scattered domain types (`dashboardv2/types.ts`, `lib/conflicts/schema.ts`).
- Note (2026-07-05, session 5): **zero `any`/`as any`/`@ts-ignore` left** in app/components/lib/types (typed catches, Stripe webhook period-end shape, `world-countries` cast dropped — package is typed, `SanityImageSource` for blog images, gtag globals on `unknown`, recharts formatter inferred). Both flags ON: `noImplicitReturns` (zero fallout), `noUncheckedIndexedAccess` (~40 errors fixed with guards in lib modules + dxy/sr-alpha routes + use-workspace; tests use `!` on indexed assertions). `types/domain/calendar.ts` created — CalendarEvent/EventExtras/ImpactLevel out of `components/dashboardv2/types` (re-exported for back-compat); lib no longer imports types from components. `lib/conflicts/schema.ts` left in place — it's already lib-level, move only if a second consumer appears. **PHASE 5 COMPLETE.**

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

**6.7 — Git-based VPS deploy (stay Windows/Task Scheduler)**
- Owner facts (2026-07-04): VPS holds **only the relevant files, no git at all** — deploy today is literally hand-copy-paste of individual files. Owner wants the VPS moved onto git later so deploys become a pull.
- [ ] Step 1 — install git on the VPS; clone the repo to a fixed root (e.g. `C:\IntelliTrade\repo`). Use **sparse-checkout** limited to what the VPS runs (`backend/support_resistance/`, `scripts/` scanner+scraper, requirements) so the Next.js app, node_modules-adjacent weight, and fixtures the VPS doesn't need stay off the box. Read-only deploy key / fine-grained PAT, not owner credentials.
- [ ] Step 2 — bootstrap script (PowerShell): `git pull` → `pip install -e .` (post-6.4 packaging) → re-register Task Scheduler tasks idempotently. Replaces every hand-copy.
- [ ] Step 3 — reconcile drift first: diff what's on the VPS today against the repo (hand-copied files may have been edited in place on the box — treat VPS as possibly-newer until proven otherwise; same discipline as §3.1). Untracked `scripts/vps/` in the working tree is part of this evidence — commit it once reconciled.
- [ ] Depends on 6.4 (packaging) + 6.6 (paths from env, not `C:\IntelliTrade\*` hardcodes). Document the one unavoidable manual step (Task Scheduler "run whether logged in or not" password).
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
| C1 | CRITICAL | RLS off on all tables except `subscriptions`; public anon key → full direct DB read/write | ✅ fixed 2026-07-04 — 005 run in Supabase, anon REST verified denied on all 8 tables |
| H2 | HIGH | `/api/sr-alpha` no auth | ✅ fixed 2026-07-04 (subscription) |
| H3 | HIGH | `/api/conflicts` no auth | ✅ fixed 2026-07-04 (subscription) |
| H4 | HIGH | currency-strength + `data/current` endpoints no auth | ✅ fixed 2026-07-04 (subscription) |
| H5 | HIGH | `/api/economic-events` no auth | ✅ fixed 2026-07-04 (subscription) |
| H6 | HIGH | middleware matcher excludes `/api` entirely | ✅ fixed 2026-07-04 (APIs self-gate via `requireSubscription`; matcher now only excludes free tier + assets) |
| H7 | HIGH | `NEXT_PUBLIC_CURRENCYFREAKS_API_KEY` exposed to browser | ◐ proxy live, `CURRENCYFREAKS_API_KEY` set in Vercel — **rotation blocked until ~2026-07-06** (co-founder has CurrencyFreaks access, away). Then: rotate → update Vercel var → delete `NEXT_PUBLIC_` var → strip code fallback in `api/rates` + `api/dxy` |
| M8 | MED | No rate limiting anywhere | ✅ descoped 2026-07-04 — risk gone post-gating; `/api/rates` symbol whitelist closed structurally (see 1.6) |
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
- **2026-07-04 (session 2, cont.)** — 1.2 done. Owner locked tier model: free = blog + lot calc + prices-today; all else subscription. New `lib/auth/requireSubscription.ts`; 7 premium data routes gated; middleware gates all premium shells (incl. static meter/conflict-map bundles + legacy `/dashboard` pending 4.3b removal). Closes H2–H6. Build + 61 tests green.
- **2026-07-04 (session 2, close)** — **Phase 1 complete.** Owner ran 005 in Supabase; RLS verified via anon REST (all 8 tables `42501`) — C1 closed. `CURRENCYFREAKS_API_KEY` set in Vercel (rotation still pending). 1.6 rate limiting descoped with rationale; `/api/rates` hardened to a closed 13-symbol whitelist instead. Register: 13/14 closed, H7 half-open (rotation). Next session → Phase 2 (git hygiene).
- **2026-07-04 (session 3, branch `refactor/phase1-security` cont.)** — Phase 2 mostly done (recovered from a crashed session that had staged but not committed the work). 2.1 + 2.2 committed in two commits (logic vs tracking, per §3.2): sitemap repointed contentlayer→Sanity (`refactor:`), then `.contentlayer/`, `.cache/`, `scraper.log`, `events.json`, `reports/*` untracked + `.gitignore` broadened (`chore(git):`). Vite meter bundles investigated: no in-repo source → keep tracked, improvement logged. 2.4 done (misnamed folder already gone; `alejoScraper.py` flagged for 6.2). 2.3 mapped, decision pending owner (recommendation in note). Build + 61 tests green. **Remaining Phase 2: 2.3 owner call only.** Loose ends on disk, untouched deliberately: unstaged deletions of 3 tracked `claudeLoad/` files (incl. one scraper duplicate — Phase 6 evidence, don't commit blind) + untracked `scripts/vps/` and `claudeLoad/` working dirs. Next → Phase 3 (isolate nested app), then Phase 4.
- **2026-07-04 (session 3, close)** — **Phase 2 complete.** Owner: fixtures stay in-repo, no LFS (2.3 closed). New owner facts: VPS has no git, holds only relevant files, deploys were manual copy-paste → 6.7 rewritten as git-based sparse-checkout deploy plan (clone + pull + bootstrap; reconcile VPS drift first, VPS possibly newer than repo). Next → Phase 3.
- **2026-07-04 (session 3, cont.)** — **Phase 3 complete.** Nested app contained: eslint `ignores` block + root `.prettierignore` added (tsconfig/vitest/node_modules were already clean), status README dropped in `IntelliConflict-Map/`. Duplication documented, not resolved (§8). Lint/build/61 tests green. Also added `OWNER_TODO.md` convention (§0.5). Next → Phase 4 (dead blog stack, verification-gated).
- **2026-07-05 (session 5, cont.)** — **5.6 complete → PHASE 5 COMPLETE.** Zero `any` (from 13 at session start; audit's 15 baseline), `noImplicitReturns` + `noUncheckedIndexedAccess` on, `types/domain/` started with calendar types. Metrics vs §7 start: `any` 15→0, `.jsx` 6→2 (both deferred conversions tracked in 5.3), tests 3 root → 45 root TS files' worth (103 total). Next → Phase 6 (Python) — multi-session.
- **2026-07-05 (session 5)** — **5.4 + 5.5 complete.** 5.4: dead `strength-panel.tsx` deleted, `-native` renamed canonical. 5.5: domain math extracted to `lib/{strength,calendar,lot-size}.ts` with 42 new unit tests (suite 61 → 103); components are fetch/UI-only now. Phase 5 remaining: 5.6 only (TS hardening + `types/domain/`).
- **2026-07-04 (session 4, cont. 2)** — **5.2 + 5.3 complete.** 5.2: RSC + typed-wrapper convention locked (owner); `lib/api/{client,market}.ts` + `lib/auth/client.ts`; 17 files migrated off raw fetch/inline supabase. 5.3: app/ = routes + `_components/` only; components/ = 8 feature folders, PascalCase; 4 of 6 jsx islands converted (ConflictMapModule + BullBearGame deferred); conventions locked into new repo `CLAUDE.md`. 8 more dead files found+removed during inventory. All batches: build + 61 tests green; tsc clean. Remaining Phase 5: 5.4 strength-panel reconcile, 5.5 logic extraction, 5.6 TS hardening.
- **2026-07-04 (session 4, cont.)** — **5.1 complete + 5.3 spec locked.** Owner locked: Tailwind stays v3 (v4 package dropped); structure follows official Next conventions — app/ = route files + route-private `_components/`, shared components in `components/<feature>/`, PascalCase filenames (spec written into 5.3, execution pending). Stylesheets 3→2 with dead-rule purge (1,301-line main.css → ~110; double @tailwind emission fixed). v1 lot-size-calculator deleted (5.4 first bullet). Build + 61 tests green throughout.
- **2026-07-04 (session 4, branch `refactor/phase1-security` cont.)** — **Phase 4 complete.** ~60 dead files removed: contentlayer config + `scripts/blog/`, `layouts/blog/` (6), starter MDX + authors + blog data files (kept live `siteMetadata.js`), legacy `/dashboard` (308 → `/dashboardv2` via `next.config.ts` redirects), `/protected` + `components/tutorial/` + starter components (hero/logos/deploy-button/env-var-warning), `styles/prism.css`, and 16 dead `components/blog/` files (kept `Link.tsx` + `social-icons/`). Pliny fully excised: dead `SearchProvider` unwrapped from root layout, two `@/node_modules/pliny/...` grep-evading imports replaced by `lib/formatDate.ts`. Deps −6: pliny, remark-github-blockquote-alert, tsparticles v3 ×4. Verified per §3.1: build green, 61/61 tests, prod-server curl sweep (/, /blog, /dashboard→308, /auth/update-password 200, price pages 200). Gotcha for later sessions: a dev server holding port 3000 shares `.next/` with prod builds — contaminated artifacts produced a phantom 404 until rebuild; also that dev server 500s after `npm uninstall` under it (needs owner restart). Next → Phase 5 (Tailwind v3/v4, data-fetching convention).
