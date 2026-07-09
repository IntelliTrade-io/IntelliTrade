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

**Tooling is ready (2026-07-08):** full step-by-step in `scripts/vps/DEPLOY.md`;
`scripts/vps/bootstrap.ps1` does the pull + `pip install -e .[mt5]` + idempotent
re-registration of the 3 scanner/watchdog tasks to the new `python -m` layout.
Do the ordered steps below (the script assumes 1–3 are done).

- [ ] **Install git on the VPS** + create a read-only deploy key / fine-grained PAT for the repo (not owner credentials).
- [ ] **Don't hand-edit files on the VPS from now on** — any in-place fix should also land in the repo, or drift reconciliation (§6.7 step 3) gets harder.
- [ ] **Reconcile VPS drift before the git deploy**: copy the scanner `.py` files off the box (RDP) and hand them to Claude to diff against commit `2a010de` — that commit is the exact tree that was last hand-copied to the VPS (committed 2026-07-05). Any in-place VPS edits get folded into the repo before the box switches to `git pull`.
- [ ] **Sparse-clone + run bootstrap** per `scripts/vps/DEPLOY.md` (clone to `C:\IntelliTrade\repo`, `git sparse-checkout set intellitrade_scanners backend/support_resistance economic_calendar scripts/vps`, create `config\.env` from the template, run `bootstrap.ps1` as Administrator).
- [ ] **Manual step the script can't do:** Task Scheduler → each IntelliTrade task → "Run whether user is logged in or not" (needs the account password). **This is the CSM-outage fix.** Then confirm MT5 is logged in and run `python -m intellitrade_scanners.scanner_h1m15` once to verify a scan writes a row.
- [ ] **Heads-up**: scanner code moved in the repo (`scripts/vps/*.py` → `intellitrade_scanners/`; runners are now `python -m intellitrade_scanners.scanner_d1h4` etc.). The VPS's current flat files keep working as-is — but if you hand-copy anything scanner-related to the box before switching to git, ask Claude for the file list first; a partial copy of the new layout won't run.
- [ ] **S&R backend task** (`run_sr_alpha.py`, 15-min) isn't in bootstrap.ps1 yet (old setup didn't register it either) — tell Claude its current schedule and it gets folded in.

## Google AdSense (see GOOGLE_ADSENSE_APPROVAL.md)

- [ ] **Record the exact rejection wording**: AdSense dashboard → Sites → intellitrade.tech → paste the reason into `GOOGLE_ADSENSE_APPROVAL.md` §0 (most likely "Low value content"). Fixes are sequenced off this.
- [ ] **Fill `lib/company.ts`** with legal entity name, KvK number, business address (footer identity block renders automatically once set; email default is info@intellitrade.tech — correct if wrong).
- [ ] **Don't re-request review** until the doc's §1 content work is live on production. Fix → deploy → wait → request.
- [ ] Later, post-approval: enable Privacy & messaging (GDPR message) in AdSense + add `ads.txt` (doc §3).

## Quick checks

- [ ] **Trading-correctness audit result — decide on the forming-candle fix** (2026-07-07, full report: `claudeLoad/TRADING_CORRECTNESS_AUDIT.md`). Highest finding: the MT5 feed includes the still-forming candle and nothing drops it — live strength scores repaint intra-bar and S&R "close reclaims" can fire on a mid-bar price poke (OANDA path already filters to closed candles; the two pipelines see different inputs by construction). Recommended one-line fix in `feed_adapter` (fetch from position 1 = last closed bar) but it's the production VPS path: greenlight it, then Claude applies + you verify one scan on the VPS before trusting. Two smaller research-model quirks (F2/F3 in the report) are faithful to the locked research code — backlog, not hotfix.

- [ ] **🔴 URGENT — CSM (currency-strength meter) shows stale data; both data pipelines are down** (diagnosed 2026-07-07, cofounder report). Facts from Supabase: daily snapshots last written **Jul 2 20:05 UTC**, intraday last **Jul 4 19:31 UTC** and did NOT resume at Sunday's market open; all 85 snapshot rows ever written came from the VPS (`metaquotes_demo`) — **the GitHub OANDA workflows have never written a single row**. The UI/API are fine; they show the newest data that exists.
  1. **VPS (primary fix):** RDP in → Task Scheduler → check the d1h4/h1m15 scanner tasks. Run pattern (bursts only on days someone was logged in) says they're set to "run only when user is logged on" — switch to **"run whether user is logged on or not"** (needs the account password; this is the manual step plan 6.7 already flags). Also check the MT5 terminal: its feed froze ~Jul 3 23:00 UTC (scanner_health.last_candle_time lagged the run time by ~20h) — restart the terminal/re-login the demo account.
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
