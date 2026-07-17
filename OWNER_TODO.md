# Owner TODO

Things only the owner can do (account access, credentials, external services). **Not critical right now** unless marked. Execute when the refactor plan wraps up — or at the noted unblock date. Claude adds items here instead of nagging; each says what, why, and what to tell Claude afterwards.

---

## ★ Post-refactor launch checklist (start here)

The refactor is **code-complete** (all 7 phases; only owner/external-gated items remain). These are the things standing between "refactor done" and "safe to launch", newest-blocking first. Each links to its detail section below.

- [ ] **🔴 Move production off demo FX feeds → licensed data provider** *(launch-blocking, legal)*. Prod runs on MetaQuotes-Demo (MT5 VPS) + OANDA demo. Not a refactor item, but the biggest real risk before public launch. See "Legal / data licensing" below and `claudeLoad/TRADING_CORRECTNESS_AUDIT.md`.
- [ ] **🟠 Rotate the CurrencyFreaks key (H7)** *(was blocked till ~2026-07-06 — now unblocked)*. Last open security-register item. Steps in "Unblocks on a date" below. Tell Claude "key rotated" → fallback stripped from `api/rates` + `api/dxy`, H7 closes.
- [ ] **🟠 Arm CI (Phase 7.3)** — workflows report but don't *gate* until: 2 Sanity Actions **variables**, 2 Supabase **secrets**, branch protection on `main` requiring `frontend` + `security-regression` + `pytest`. Full steps in "CI activation" below.
- [ ] **🟡 Merge to `main` + verify Vercel/Actions** — merge the refactor branch, then confirm the scheduled currency-strength GitHub Actions run green from the new default branch (see "Currency-strength GitHub Actions healthy after merge?").
- [ ] **🟡 Retire the old VPS flat files** after a rollback window — `C:\IntelliTrade\scanner\*.py` + `setup_windows_tasks.ps1` are superseded by the git deploy (`bootstrap.ps1`); delete once the git tasks are proven. See "Retire the old flat files" below.

Everything below is the detail for these plus lower-priority owner items (AdSense, research validation, email redirect check).

---

## Unblocks on a date

- [ ] **Rotate the CurrencyFreaks key** *(unblock date ~2026-07-06 has passed — actionable now)*
  1. Rotate the key in the CurrencyFreaks dashboard (old one was browser-exposed pre-refactor).
  2. In Vercel: set new value on `CURRENCYFREAKS_API_KEY`, **delete** `NEXT_PUBLIC_CURRENCYFREAKS_API_KEY`.
  3. Tell Claude: "key rotated" → code fallback in `app/api/rates` + `app/api/dxy` gets stripped, H7 closes in the security register.

## Deploy / merge (closer to critical — security fixes aren't live until merged)

- [x] ~~**Run migration 006 in the Supabase SQL Editor**~~ **DONE 2026-07-17** (`supabase/migrations/006_calculator_templates.sql`) — `calculator_account_templates` created for the lot size calculator Pro account templates. Verified live: table reachable via service role, anon SELECT returns an empty set (RLS filters to owner), anon INSERT rejected with 42501 (row-level security). Safe ahead of the `feat/lot-size-precision` deploy.

- [x] ~~**Merge `refactor/phase1-security` → `main`** (PR)~~ **DONE 2026-07-08** (PR #103, merge `de3342b`). Verified before merge: clean merge-tree (0 conflicts), merged tree byte-identical to the tested branch, rebuilt green (build 216 pages, pytest 395, tsc). CI caught + fixed one Windows-only path test (`3cea76d`). Security hardening now on `main` → deploys via Vercel.
- [ ] **Merge `SRL-dev3` → `main`** for the S&R frontend on Vercel (if not already superseded by the branch above — verify diff first).
- [ ] **VPS: redeploy the 4 updated S&R backend files + apply migration 004** (close-reclaim columns). Manual RDP copy for now; §6.7 replaces this workflow later.

## When Phase 6.7 (VPS on git) starts

**Executed 2026-07-09** — VPS moved onto git. Tooling: `scripts/vps/DEPLOY.md` + `scripts/vps/bootstrap.ps1`.

- [x] ~~**Install git on the VPS**~~ done 2026-07-09. (Clone used the Administrator's cached GitHub credential — read access confirmed.)
- [x] ~~**Reconcile VPS drift**~~ **CLEAR** — owner confirms no in-place edits (VPS files only ever copied from local; dated 06/14, older than baseline `2a010de`). Nothing to fold.
- [x] ~~**Sparse-clone + run bootstrap**~~ done 2026-07-09. Cloned to `C:\IntelliTrade\repo` (sparse: `intellitrade_scanners backend/support_resistance economic_calendar scripts/vps`), `pip install -e .[mt5]` OK, 3 tasks re-registered to `python -m intellitrade_scanners.*`. `.env` already present.
- [x] ~~**Verify scan**~~ manual `scanner_h1m15` ran green — MT5 connected (demo 5051758028), wrote `fx_strength_snapshots id=111` + `currency_strength_snapshots` (compat) + `scanner_health → ok`, 22/28 pairs.
- [x] ~~**Task Scheduler password (the actual CSM-outage fix)**~~ **DONE 2026-07-09** — all 4 IntelliTrade tasks (D1H4, H1M15, Watchdog, SR Alpha) set to "Run whether user is logged in or not". Meter now survives RDP disconnect.
- [x] ~~**6 non-USD crosses fail to fetch**~~ **RESOLVED 2026-07-09 — was cold history-sync latency on MetaQuotes-Demo, NOT a feed limitation.** GBPAUD, AUDJPY, AUDCAD, NZDCAD, CHFJPY, CADCHF initially returned `-1 Terminal: Call failed` on ALL timeframes. Probing proved the symbols exist with live ticks; the terminal just hadn't downloaded their bar history yet. It finished syncing in the background (minutes) and cached to disk → **both scanners now run 28/28, 0 failed** (h1m15 id=121, d1h4 id=122). **`MIN_SYMBOLS` stays 28 — do NOT set it to 22** (that would sacrifice functionality; see memory rule). The `INTELLITRADE_MIN_SYMBOLS` env knob exists (default 28) only as legit per-feed config, not to mask this. Cold-start note: MT5 persists history to disk, so reboots should keep the 6 warm; if a reboot ever makes them `-1` again, tell Claude and we harden `feed_adapter` warmup patience (don't lower the threshold).
- [ ] **Don't hand-edit files on the VPS from now on** — the box now pulls from git; any fix must land in the repo, or the next `git pull` overwrites it.
- [ ] **Retire the old flat files** once the git tasks are proven: `C:\IntelliTrade\scanner\*.py` + its `setup_windows_tasks.ps1` are now unused (tasks point at the repo). Leave for rollback for a few days, then delete.
- [x] ~~**S&R backend task** isn't managed by `bootstrap.ps1` yet~~ **Folded in** — `bootstrap.ps1` registers `IntelliTrade SR Alpha` → `python -m support_resistance.run_sr_alpha --source mt5`, 15-min trigger (line ~180), same as the other scanners; it was among the 4 tasks set to "run whether logged in or not" on 2026-07-09. **Remaining verify (owner, quick):** confirm the SR Alpha task actually writes fresh `sr_*` rows to Supabase after a run — only the D1H4/H1M15 strength scans were row-verified on 2026-07-09; the SR scan wasn't. If it errors, paste Claude the task's last-run log.

## Google AdSense (see GOOGLE_ADSENSE_APPROVAL.md)

- [x] ~~**Record the exact rejection wording**~~ done 2026-07-05 — "Low value content", recorded in doc §0.
- [ ] **Update the cofounder's custom GPT** (2026-07-12): posts are drafted by a custom ChatGPT and hand-published by the cofounder. Replace the GPT's Instructions with the block in **`BLOG_PROMPT.md`** (repo root) — it kills the title suffix, varies structure/length, requires a per-post `summary` (was empty on all 182 posts), and bakes in the non-signals language rules. The per-post Sanity checklist in that file is for the cofounder's publishing step. Claude already cleaned the 108 old titles in Sanity (backup: `claudeLoad/adsense/post_titles_backup_2026-07-12.json`) and the frontend strips the suffix defensively, so a slip won't leak — but the GPT is the source.
- [ ] **Search Console indexing check**: how many of the ~180 posts are actually indexed? Few indexed = corroborates the low-value-content signal. Also confirm site verified + sitemap submitted (doc §3).
- [ ] **Review + publish 3 evergreen guide drafts** (2026-07-12, in Sanity Studio drafts): sessions guide, position-sizing guide, correlation guide. One-time review; publish all three together (the correlation guide links the sizing guide's URL). Adjust `publishedAt` to the actual publish date if you wait.
- [ ] **Deploy the Studio** — Claude added the 3 `marketContext` fields (stats/weekRecap/relatedLinks) to `C:\studio-intellitrade\schemaTypes\marketPrices.ts` (2026-07-12, typecheck clean, left uncommitted alongside your other local studio edits). Run `npx sanity deploy` from `C:\studio-intellitrade` (or restart the local studio) and the fields appear in the editing UI. Content guidance in `SANITY_SCHEMA_UPGRADE.md`. The site already renders the fields (verified on the gold doc's two demo related-links).
- [x] ~~**Vercel bot challenge on prod**~~ FIXED 2026-07-12 — root cause was the **Bot Protection managed firewall rule set to "challenge" since 2025-11-01** (not Attack Challenge Mode); owner confirmed not deliberate. Claude switched it to action **"log"** via the Vercel API (project `nextjs-with-supabase`, Firewall → Bot Protection) and verified non-browser clients now get 200. Note: all ~5 AdSense denials predate this fix — worth mentioning if support contact ever happens. If bot abuse ever becomes real, flip back to "challenge" in the dashboard knowing the tradeoff.
- [ ] **Fill `lib/company.ts`** with legal entity name, KvK number, business address (footer identity block renders automatically once set; email default is info@intellitrade.tech — correct if wrong).
- [ ] **Don't re-request review** until the doc's §1 content work is live on production. Fix → deploy → wait → request. Note: the title cleanup in Sanity is live immediately (CMS-served), but the frontend changes (title strip, meta descriptions, /feed.xml) only count once merged + deployed.
- [ ] Later, post-approval: enable Privacy & messaging (GDPR message) in AdSense + add `ads.txt` (doc §3).

## Quick checks

- [ ] **🟡 Co-founder (research) — validate the S&R close-reclaim vs the research backtest** (found 2026-07-09 comparing `backend/support_resistance` against `claudeLoad/SnRTool/researchCode`). **What's already proven faithful:** zone geometry is byte-identical to the research (`validate_zone_fixture` = 18488/18488, 100%); dynamic score+grade pass the golden fixture (50/50); touch test, `close > zone_high` reclaim, and the locked params (`max_confirm_wait_bars=8`, `max_touch_wait_bars=384`, `max_hold_bars=48` from `locked_phase39_config.json`) all match. **The one unvalidated area:** `backend/support_resistance/zone_detector.py::close_reclaim_state` (line ~302) is a *live analogue* of the research backtest `zone_confirmation_engine.py::evaluate_zone_confirmation`, not a line-port, and there is **no reclaim-timing fixture** — so per-trade confirm timings were never checked. Two concrete, by-design differences to reconcile:
  1. **Which touch:** research takes the **first** touch after zone creation (one backtest trade/zone); backend takes the **most-recent** touch (`reversed(touches)`) to answer "is a reclaim active *now*".
  2. **Confirm window:** research `range(touch_idx, …)` lets the **touch bar itself** confirm (same-bar pin-bar reclaim); backend `range(t+1, …)` requires a **later** bar to close above the zone.
  **This is NOT from the refactor** — the engine logic predates it (this session only changed print→logging in runners). **To close it (Claude can build this):** generate a reclaim-timing fixture by running the research `evaluate_zone_confirmation` over the controlled candles + `controlled_zone_events_reference.csv`, dump per-zone confirm times, then diff the backend's `close_reclaim_state` decisions against it → either proves equivalence or quantifies the drift. **Decision co-founder owns:** is the live-analogue (most-recent, "active now") the intended product behavior, or should the live reclaim mirror the backtest exactly? Answer that, then Claude builds the fixture + reconciles.

- [ ] **Trading-correctness audit result — decide on the forming-candle fix** (2026-07-07, full report: `claudeLoad/TRADING_CORRECTNESS_AUDIT.md`). Highest finding: the MT5 feed includes the still-forming candle and nothing drops it — live strength scores repaint intra-bar and S&R "close reclaims" can fire on a mid-bar price poke (OANDA path already filters to closed candles; the two pipelines see different inputs by construction). Recommended one-line fix in `feed_adapter` (fetch from position 1 = last closed bar) but it's the production VPS path: greenlight it, then Claude applies + you verify one scan on the VPS before trusting. Two smaller research-model quirks (F2/F3 in the report) are faithful to the locked research code — backlog, not hotfix.

- [ ] **CSM — primary (VPS) pipeline RESTORED 2026-07-09; GitHub OANDA backup still down** (orig diagnosed 2026-07-07, cofounder report). Live meter is fresh again via the VPS; the item stays open only for the never-worked OANDA backup (point 2). Facts from Supabase: daily snapshots last written **Jul 2 20:05 UTC**, intraday last **Jul 4 19:31 UTC** and did NOT resume at Sunday's market open; all 85 snapshot rows ever written came from the VPS (`metaquotes_demo`) — **the GitHub OANDA workflows have never written a single row**. The UI/API are fine; they show the newest data that exists.
  1. **VPS (primary fix) — RESOLVED 2026-07-09:** MT5 feed live again (demo 5051758028); both scanners run **28/28, 0 failed** and write fresh rows (h1m15 id=121, d1h4 id=122, `currency_strength_snapshots` compat, `scanner_health → ok`); tasks re-registered via the git deploy and set to "run whether user is logged on or not" so the meter survives RDP disconnect; watchdog reports healthy (`0x0`). CSM pipeline fully restored. (The 6-crosses `-1` scare was cold history-sync latency, self-healed — see the 6.7 section.)
  2. **GitHub (backup pipeline, broken since inception):** Actions → "Currency Strength — Daily Scanner" → open the latest runs. They're scheduled 22:15 UTC Mon–Fri but have produced zero DB rows ever. Likely missing/invalid `OANDA_API_KEY`/`OANDA_ENVIRONMENT` secrets or a script crash. Paste the red step's error to Claude.
  3. **Watchdog gap:** the watchdog runs on the same VPS it watches, so it died silently with the box. Off-box staleness alerting is queued as an IMPROVEMENTS idea (route-level stale banner + a GitHub-scheduled freshness check).

- [ ] **PMI config JSONs are missing from the repo** (found during the 6.3 scraper split, 2026-07-06). The scraper's S&P Global PMI source expects `PMI_FEEDS_CATALOG.json`, `PMI_ESTIMATOR_RULES.json`, `PMI_OVERRIDES.json` next to the scraper (or in a `PMI Research/` folder) — none exist anywhere in the repo, so the PMI estimator has been failing into its broad-except fallback on every run (GitHub Actions included; it fails the same way before and after the split). If you have these files somewhere (old machine, "PMI Research" folder?), drop them in `scripts/` and PMI events start flowing; if not, tell Claude and the dead path gets removed or the catalog rebuilt in a later 6.3 session.

- [ ] **Currency-strength GitHub Actions healthy after merge?** The daily (22:15 UTC) and hourly intraday workflows now install the package (`pip install .`) and run `python -m intellitrade_scanners.scanner_oanda_{daily,intraday}` — same flags, same output, algorithm verified identical. This only takes effect once the refactor branch merges to `main` (scheduled workflows run from the default branch). After the next scheduled runs, glance at GitHub → Actions; if a run fails on `pip install .` or OANDA auth, paste Claude the error. (Claude couldn't check run history: no `gh` CLI on this machine.)

## Legal / data licensing (LAUNCH-BLOCKING — full dive scheduled)

- [ ] **🔴 Market-data licensing for the commercial product.** The CSM/scanners currently run on **MetaQuotes-Demo** (and we evaluated a Switch Markets demo). **Demo/broker feeds are dev-only** — demo-account ToS are almost always "evaluation only," and even funded-account ToS restrict commercial use + redistribution of the price data. The strength meter shows *derived* analytics (lower risk than republishing raw quotes) but commercial use of the underlying data is still governed by the source's terms. **Before commercial launch, move production to a licensed FX data provider with explicit commercial/redistribution rights.** Shortlist to evaluate (coverage of all 28 pairs, history depth, commercial pricing, fits the existing `fetch_df`/`make_fetch_fn` adapter pattern): **Polygon.io, Twelve Data, TraderMade, Databento, Finnhub**, or a commercial data agreement with a broker/OANDA (separate from free-practice terms). Read each ToS for "commercial use"/"redistribution"; confirm with counsel given IntelliTrade's analytics-not-signals positioning + AdSense sensitivity. **Owner said: keep this noted now, do a full dive later.** (Claude to research provider comparison on request.) Not a code problem — a licensing one; cheap to fix now, expensive post-launch.

## CI activation (Phase 7.3 — workflows landed, need repo config to fully arm)

The `.github/workflows/frontend.yml` job runs lint + typecheck + test on every push/PR **now** (no config needed). Two parts are gated until you add repo settings:

- [ ] **Activate the `next build` CI gate** — add two repo **Actions *variables*** (Settings → Secrets and variables → Actions → *Variables*, NOT secrets — these are the public `NEXT_PUBLIC_` Sanity values that already ship to the browser): `NEXT_PUBLIC_SANITY_PROJECT_ID` and `NEXT_PUBLIC_SANITY_DATASET` (usually `production`). Until set, the Build step is skipped (Vercel still builds on deploy, so nothing is unguarded — this just moves the catch earlier). Supabase/Stripe use placeholders in CI by design (no page hits them at build time).
- [ ] **Arm the anon-key security regression check** — add two repo **secrets**: `SUPABASE_URL` and `SUPABASE_ANON_KEY` (the production project's public anon key). The `security-regression` job then verifies anon REST reads are denied on all 13 premium tables (guards audit finding C1). Until set, the check self-skips (green). It's read-only and only asserts *denial*.
- [ ] **Enable branch protection on `main`** (Settings → Branches → add rule) — require the `frontend` + `security-regression` + `pytest` checks to pass before merge. This is what actually gates merges on green; the workflows only report status without it.

## Conversion launch (CONVERSION_PLAN.md / OPUS_HANDOFF.md, 2026-07-12)

- [x] ~~**Verify `STRIPE_PRICE_ID` (prod env) is a €15.00 EUR/month recurring price**~~ — owner confirmed 2026-07-12: prod price is already €15/mo EUR. Founding copy is safe as-is.
- [x] ~~**Approve Phase D middleware change**~~ — approved + implemented 2026-07-12: logged-out visits to premium pages now redirect to `/pro?from=dashboard` (explainer banner) instead of `/auth/login`. Non-premium protected paths (e.g. /account) still go to login. No access loosened.
- [ ] **Decide standard price after member 100** (recommend before ~member 70; no code needed now — copy says "standard price" without a number).
- [ ] **VAT presentation** — owner decision 2026-07-12: keep copy VAT-silent for now. Before EU launch, enable Stripe Tax and decide inclusive/exclusive €15, then add "VAT included" under the price on /pro + /upgrade.
- [ ] **GA4 console tasks** (events now live in prod build): mark `sign_up`, `begin_checkout`, `purchase` as key events; Admin → Data streams → unwanted referrals: add `checkout.stripe.com`; define internal-traffic filter for your IPs; build funnel exploration `page_view → cta_click → sign_up → begin_checkout → purchase`. Event names shipped: `cta_click`, `founding_cta_click`, `view_pricing`, `preview_interact`, `calculator_result`, `sign_up_start`, `sign_up`, `login`, `begin_checkout`, `purchase`.
- [ ] **Founding-member cap watch** — count paid members with `select count(*) from subscriptions where status in ('active','trialing')`; automate enforcement when approaching ~80 (backlogged in IMPROVEMENTS.md).

## External / accounts

- [ ] **Check Supabase sign-up email redirect** — the sign-up flow passes `emailRedirectTo: <origin>/auth/callback`, but no `/auth/callback` route exists in the app (only `/auth/confirm`, which handles `token_hash` links). If the Supabase email template uses `{{ .ConfirmationURL }}`, new users may land on a 404 after confirming. Test one real sign-up; tell Claude "callback works" or "callback 404s" → then it's either left alone or repointed to `/auth/confirm`.

- [ ] **Locate the currency-strength meter Vite source** (built outside this repo — see `claudeLoad/STRENGTH_METER_DEV_HANDOFF.md`). Needed to bring it in-repo with a build step (IMPROVEMENTS.md entry).
- [ ] **Supabase CLI link** for the project so migrations run via `db push` instead of hand-pasting in the SQL editor; then Claude backfills migration files for the 4 dashboard-created tables (IMPROVEMENTS.md → Ops).

## Market Context automation (see MARKET_CONTEXT_AUTOMATION.md, 2026-07-15)

Wires the daily blog post's "Cross-Asset Wrap" section into the four `marketContext` documents behind the price pages. Code is done + tested, committed locally (`41220e4` site, `411beca` studio). **2026-07-15: steps 1-4 DONE by owner (token, secret, webhook, studio deploy — deployed schema verified). Only the site production deploy remains.**

- [x] **Create the Sanity write token** — sanity.io/manage, project `6s37xbfh` → API → Tokens → add a token with **Editor** role. Add its value as `SANITY_API_WRITE_TOKEN` in Vercel (Production, server-side — NOT `NEXT_PUBLIC_`) and in local `.env.local`.
- [x] **Create the webhook secret** — generate a random string. Add it as `SANITY_WEBHOOK_SECRET` in Vercel (Production, server-side) and local `.env.local`. Use the same value in the webhook config below.
- [x] **Create the Sanity webhook** (API version `v2025-02-19`; drafts + versions OFF) — sanity.io/manage, project `6s37xbfh` → API → Webhooks → Create:
  - Name: `market-context-automation`
  - URL: `https://intellitrade.tech/api/sanity/market-context`
  - Dataset: `production`
  - Trigger on: **Create + Update + Delete**
  - Include drafts: **OFF**
  - Filter: `_type == "post"`
  - Projection: `{_id, _type, title, publishedAt, body, "operation": delta::operation()}`
  - HTTP method: **POST**
  - Secret: the `SANITY_WEBHOOK_SECRET` value
  - API version: `2024-01-01` or later
- [x] **Deploy the Studio schema** (done 2026-07-15; `sourcePost`/`generatedAt`/`manualOverride` confirmed in deployed schema) — run `npx sanity deploy` from `C:\studio-intellitrade` to ship the schema changes (3 new `marketContext` fields: `sourcePost`, `generatedAt`, `manualOverride`; plus a body validation on `post` that blocks publishing a broken Cross-Asset Wrap). This is the same deploy already queued for the earlier `marketContext` enrichment fields — one `sanity deploy` covers both.
- [ ] **Note:** the webhook only takes effect after the next production push/deploy of the site (repo is in no-push refactor mode). Kill switches if needed: disable the webhook in sanity.io/manage (instant), or set `MARKET_CONTEXT_AUTOMATION_DISABLED=1` in Vercel + redeploy. **No historical backfill** — only posts published after the webhook is live are processed.

---

*Done items: strike through + date, don't delete — they're the audit trail.*
