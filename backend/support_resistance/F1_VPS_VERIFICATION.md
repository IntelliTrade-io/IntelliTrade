# F1 — closed-M15 fix: VPS verification, rollback & evidence preservation

**Status: prepared, NOT deployed. Do not deploy to the VPS or write production
Supabase data until the founder approves.**

Scope of the fix (see the commit): exclude the still-forming M15 bar from the
S&R production candle input, in the S&R candle layer only (`fetch_candles.py`),
plus observability logging in `run_sr_alpha.py`. Nothing else changed — see the
"not changed" list in the PR/report.

---

## 0. Preserve evidence FIRST (before any deploy or cleanup)

Run on the VPS, capture output to a file, keep it. This is the pre-fix baseline
and the forming-candle-sensitivity evidence for the already-run week.

```powershell
# On the VPS (C:\IntelliTrade\repo), pre-deploy:
$ts = Get-Date -Format "yyyyMMdd_HHmmss"
$out = "C:\IntelliTrade\out\f1_evidence_$ts"; New-Item -ItemType Directory -Force $out | Out-Null

# a) Deployed code identity (prove what has been running)
git -C C:\IntelliTrade\repo rev-parse HEAD              | Tee-Object "$out\deployed_sha.txt"
git -C C:\IntelliTrade\repo status --porcelain          | Tee-Object "$out\worktree_dirty.txt"
Get-FileHash C:\IntelliTrade\repo\backend\support_resistance\fetch_candles.py -Algorithm SHA256 | Tee-Object "$out\fetch_candles_hash.txt"

# b) VPS task logs (whatever the SR Alpha task writes)
Copy-Item C:\IntelliTrade\logs\*sr*alpha* "$out\" -ErrorAction SilentlyContinue
Get-ScheduledTask -TaskName "IntelliTrade SR Alpha" | Get-ScheduledTaskInfo | Format-List * | Out-File "$out\task_info.txt"
```

```bash
# c) Supabase rows (service role; read-only). Preserve current + inactive.
#    Uses the same env the scanners use (SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).
curl -s "$SUPABASE_URL/rest/v1/sr_opportunities?select=*&order=calculated_at.desc&limit=2000" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > sr_opportunities_snapshot.json
curl -s "$SUPABASE_URL/rest/v1/sr_zones?select=*&limit=2000" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > sr_zones_snapshot.json
curl -s "$SUPABASE_URL/rest/v1/market_candles?symbol=eq.EURUSD&order=time.desc&limit=2000" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" > market_candles_tail.json
```

Do NOT delete the local M15 archive (`C:\IntelliTrade\out\eurusd_m15_archive.csv`)
— it is the closed-candle history needed for the replay audit.

**Labeling rule:** the previous week's displayed grades are **unverified for
forming-candle sensitivity**, NOT proven wrong. Only the replay audit (re-scoring
the archived closed candles and diffing vs the stored rows) can prove whether any
displayed grade actually differed from its closed-candle value.

---

## 1. Deploy (only after approval)

```powershell
git -C C:\IntelliTrade\repo fetch origin
git -C C:\IntelliTrade\repo checkout <approved-sha>
git -C C:\IntelliTrade\repo rev-parse HEAD   # record the deployed SHA
```

## 2. Controlled verification run (dry-run first — writes nothing)

```powershell
$env:TZ="UTC"
python -m support_resistance.run_sr_alpha --source mt5 --dry-run 2>&1 | Tee-Object "C:\IntelliTrade\out\f1_postfix_dryrun.txt"
```

Record from the run summary (all now emitted by the runner):

- deployed commit SHA + `fetch_candles.py` SHA256 (from step 0a, re-confirm)
- python command executed + data source (`mt5`)
- current UTC time (`now_utc` in the summary)
- `run_id`, `calculated_at`
- **`last_m15_utc` and `m15_closed` — MUST be `True`**
- `last_h1_m15_bars` /4 and `last_h4_m15_bars` /16 (expected: last H1/H4 bucket
  developing — this is the pre-existing, unchanged behaviour, now visible)
- `candles_processed`, `zones_detected`, `active_support_zones`, `strength_dist`
- `grade_dist`, `opportunities_built`
- (live run only) `opportunities_written`, `stale_opps_deleted`,
  `stale_zones_deactivated`, `persisted`

## 3. Live run (writes Supabase) — only after the dry-run looks right

```powershell
python -m support_resistance.run_sr_alpha --source mt5 2>&1 | Tee-Object "C:\IntelliTrade\out\f1_postfix_live.txt"
```

Then confirm every current row belongs to the one latest run:

```bash
curl -s "$SUPABASE_URL/rest/v1/sr_opportunities?select=calculated_at&order=calculated_at.desc&limit=50" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
# expect a single distinct calculated_at == the run's calculated_at
```

Keep both `f1_prefix` (step 0) and `f1_postfix` outputs side by side for the diff.

## 4. Success criteria

- `m15_closed == True` on the fix run (and stays True across repeated runs within
  the same M15 period — no intra-bar movement).
- Two runs inside the same M15 period (no new closed bar, no session change)
  produce identical `calculated_at`, identical `grade_dist`, identical rows.
- A run after a new M15 close incorporates exactly one more closed bar.
- Geometry/score unaffected (they never used live candles): the golden 50/50,
  Phase 39 428/428, and 18488/18488 geometry validations remain green locally.

## 5. Rollback

The change is confined to two files and writes no schema. To roll back:

```powershell
git -C C:\IntelliTrade\repo checkout <previous-sha>   # the SHA recorded in step 0a
# re-run the SR Alpha task once to repopulate rows under the old code
python -m support_resistance.run_sr_alpha --source mt5
```

No migration, no data backfill, no frontend deploy is involved. `sr_opportunities`
/ `sr_zones` are fully regenerated every run (prune_stale), so a rollback run
restores the prior behaviour immediately. The preserved snapshots (step 0) allow
after-the-fact comparison either way.
