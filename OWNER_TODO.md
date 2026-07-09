# Owner TODO

Things only the owner can do (account access, credentials, external services). **Not critical right now** unless marked. Execute when the refactor plan wraps up — or at the noted unblock date. Claude adds items here instead of nagging; each says what, why, and what to tell Claude afterwards.

---

## Unblocks on a date

- [ ] **Rotate the CurrencyFreaks key** *(unblocks ~2026-07-06 when co-founder is back)*
  1. Rotate the key in the CurrencyFreaks dashboard (old one was browser-exposed pre-refactor).
  2. In Vercel: set new value on `CURRENCYFREAKS_API_KEY`, **delete** `NEXT_PUBLIC_CURRENCYFREAKS_API_KEY`.
  3. Tell Claude: "key rotated" → code fallback in `app/api/rates` + `app/api/dxy` gets stripped, H7 closes in the security register.

## Deploy / merge (closer to critical — security fixes aren't live until merged)

- [x] ~~**Merge `refactor/phase1-security` → `main`** (PR)~~ **DONE 2026-07-08** (PR #103, merge `de3342b`). Verified before merge: clean merge-tree (0 conflicts), merged tree byte-identical to the tested branch, rebuilt green (build 216 pages, pytest 395, tsc). CI caught + fixed one Windows-only path test (`3cea76d`). Security hardening now on `main` → deploys via Vercel.
- [ ] **Merge `SRL-dev3` → `main`** for the S&R frontend on Vercel (if not already superseded by the branch above — verify diff first).
- [ ] **VPS: redeploy the 4 updated S&R backend files + apply migration 004** (close-reclaim columns). Manual RDP copy for now; §6.7 replaces this workflow later.

## When Phase 6.7 (VPS on git) starts

**Executed 2026-07-09** — VPS moved onto git. Tooling: `scripts/vps/DEPLOY.md` + `scripts/vps/bootstrap.ps1`.

- [x] ~~**Install git on the VPS**~~ done 2026-07-09. (Clone used the Administrator's cached GitHub credential — read access confirmed.)
- [x] ~~**Reconcile VPS drift**~~ **CLEAR** — owner confirms no in-place edits (VPS files only ever copied from local; dated 06/14, older than baseline `2a010de`). Nothing to fold.
- [x] ~~**Sparse-clone + run bootstrap**~~ done 2026-07-09. Cloned to `C:\IntelliTrade\repo` (sparse: `intellitrade_scanners backend/support_resistance economic_calendar scripts/vps`), `pip install -e .[mt5]` OK, 3 tasks re-registered to `python -m intellitrade_scanners.*`. `.env` already present.
- [x] ~~**Verify scan**~~ manual `scanner_h1m15` ran green — MT5 connected (demo 5051758028), wrote `fx_strength_snapshots id=111` + `currency_strength_snapshots` (compat) + `scanner_health → ok`, 22/28 pairs.
- [ ] **REMAINING — Task Scheduler password (the actual CSM-outage fix):** `taskschd.msc` → each IntelliTrade task (D1H4, H1M15, Watchdog; SR Alpha too if wanted) → Properties → General → **"Run whether user is logged in or not"** → enter the Administrator password. Until this is set, tasks still only run while logged on. After: RDP-disconnect, wait one 15-min cycle, confirm `scanner_health.last_run` advances.
- [x] ~~**6 non-USD crosses fail to fetch**~~ **DIAGNOSED 2026-07-09 — MetaQuotes-Demo feed limitation, not a regression.** GBPAUD, AUDJPY, AUDCAD, NZDCAD, CHFJPY, CADCHF return `1hour: Terminal: Call failed`. "Show All" in Market Watch did NOT fix it, and their H1 charts snap back when scrolled → the demo genuinely serves **no H1 history** for these 6. So 22/28 is this feed's real ceiling; expected to fix itself on the real broker (`switchmarkets_mt5`). **Interim fix:** `watchdog.py` now reads `INTELLITRADE_MIN_SYMBOLS` (default 28) — set it to `22` on the VPS so the watchdog stops false-alerting. **Owner steps:** (1) merge the deploy-followups PR + `git -C C:\IntelliTrade\repo pull` (or re-run bootstrap) to get the new watchdog, (2) add `INTELLITRADE_MIN_SYMBOLS=22` to `C:\IntelliTrade\config\.env`, (3) revert to 28 (or unset) when you switch to the real broker feed.
- [ ] **Don't hand-edit files on the VPS from now on** — the box now pulls from git; any fix must land in the repo, or the next `git pull` overwrites it.
- [ ] **Retire the old flat files** once the git tasks are proven: `C:\IntelliTrade\scanner\*.py` + its `setup_windows_tasks.ps1` are now unused (tasks point at the repo). Leave for rollback for a few days, then delete.
- [ ] **S&R backend task** (`IntelliTrade SR Alpha`, already registered separately) isn't managed by `bootstrap.ps1` yet — still runs its old way. Tell Claude its current Execute path + schedule to fold it into the bootstrap (and repoint it at the repo `python -m`/`run_sr_alpha`).

## Google AdSense (see GOOGLE_ADSENSE_APPROVAL.md)

- [ ] **Record the exact rejection wording**: AdSense dashboard → Sites → intellitrade.tech → paste the reason into `GOOGLE_ADSENSE_APPROVAL.md` §0 (most likely "Low value content"). Fixes are sequenced off this.
- [ ] **Fill `lib/company.ts`** with legal entity name, KvK number, business address (footer identity block renders automatically once set; email default is info@intellitrade.tech — correct if wrong).
- [ ] **Don't re-request review** until the doc's §1 content work is live on production. Fix → deploy → wait → request.
- [ ] Later, post-approval: enable Privacy & messaging (GDPR message) in AdSense + add `ads.txt` (doc §3).

## Quick checks

- [ ] **Trading-correctness audit result — decide on the forming-candle fix** (2026-07-07, full report: `claudeLoad/TRADING_CORRECTNESS_AUDIT.md`). Highest finding: the MT5 feed includes the still-forming candle and nothing drops it — live strength scores repaint intra-bar and S&R "close reclaims" can fire on a mid-bar price poke (OANDA path already filters to closed candles; the two pipelines see different inputs by construction). Recommended one-line fix in `feed_adapter` (fetch from position 1 = last closed bar) but it's the production VPS path: greenlight it, then Claude applies + you verify one scan on the VPS before trusting. Two smaller research-model quirks (F2/F3 in the report) are faithful to the locked research code — backlog, not hotfix.

- [ ] **🔴 URGENT — CSM (currency-strength meter) shows stale data; both data pipelines are down** (diagnosed 2026-07-07, cofounder report). Facts from Supabase: daily snapshots last written **Jul 2 20:05 UTC**, intraday last **Jul 4 19:31 UTC** and did NOT resume at Sunday's market open; all 85 snapshot rows ever written came from the VPS (`metaquotes_demo`) — **the GitHub OANDA workflows have never written a single row**. The UI/API are fine; they show the newest data that exists.
  1. **VPS (primary fix) — MOSTLY RESOLVED 2026-07-09:** MT5 re-logged in (demo 5051758028, feed live again) and a manual `scanner_h1m15` wrote fresh rows (`fx_strength_snapshots id=111`, `currency_strength_snapshots` compat, `scanner_health → ok`). Tasks re-registered via the git deploy. **One thing still open:** set the tasks to **"run whether user is logged on or not"** (Task Scheduler password step — see the 6.7 section above). Until that's set, they still only fire while someone's logged in, so the meter can re-stale on RDP disconnect.
  2. **GitHub (backup pipeline, broken since inception):** Actions → "Currency Strength — Daily Scanner" → open the latest runs. They're scheduled 22:15 UTC Mon–Fri but have produced zero DB rows ever. Likely missing/invalid `OANDA_API_KEY`/`OANDA_ENVIRONMENT` secrets or a script crash. Paste the red step's error to Claude.
  3. **Watchdog gap:** the watchdog runs on the same VPS it watches, so it died silently with the box. Off-box staleness alerting is queued as an IMPROVEMENTS idea (route-level stale banner + a GitHub-scheduled freshness check).

- [ ] **PMI config JSONs are missing from the repo** (found during the 6.3 scraper split, 2026-07-06). The scraper's S&P Global PMI source expects `PMI_FEEDS_CATALOG.json`, `PMI_ESTIMATOR_RULES.json`, `PMI_OVERRIDES.json` next to the scraper (or in a `PMI Research/` folder) — none exist anywhere in the repo, so the PMI estimator has been failing into its broad-except fallback on every run (GitHub Actions included; it fails the same way before and after the split). If you have these files somewhere (old machine, "PMI Research" folder?), drop them in `scripts/` and PMI events start flowing; if not, tell Claude and the dead path gets removed or the catalog rebuilt in a later 6.3 session.

- [ ] **Currency-strength GitHub Actions healthy after merge?** The daily (22:15 UTC) and hourly intraday workflows now install the package (`pip install .`) and run `python -m intellitrade_scanners.scanner_oanda_{daily,intraday}` — same flags, same output, algorithm verified identical. This only takes effect once the refactor branch merges to `main` (scheduled workflows run from the default branch). After the next scheduled runs, glance at GitHub → Actions; if a run fails on `pip install .` or OANDA auth, paste Claude the error. (Claude couldn't check run history: no `gh` CLI on this machine.)

## External / accounts

- [ ] **Check Supabase sign-up email redirect** — the sign-up flow passes `emailRedirectTo: <origin>/auth/callback`, but no `/auth/callback` route exists in the app (only `/auth/confirm`, which handles `token_hash` links). If the Supabase email template uses `{{ .ConfirmationURL }}`, new users may land on a 404 after confirming. Test one real sign-up; tell Claude "callback works" or "callback 404s" → then it's either left alone or repointed to `/auth/confirm`.

- [ ] **Locate the currency-strength meter Vite source** (built outside this repo — see `claudeLoad/STRENGTH_METER_DEV_HANDOFF.md`). Needed to bring it in-repo with a build step (IMPROVEMENTS.md entry).
- [ ] **Supabase CLI link** for the project so migrations run via `db push` instead of hand-pasting in the SQL editor; then Claude backfills migration files for the 4 dashboard-created tables (IMPROVEMENTS.md → Ops).

---

*Done items: strike through + date, don't delete — they're the audit trail.*
