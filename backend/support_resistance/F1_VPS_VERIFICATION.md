# F1 - closed-M15 fix: VPS verification, rollback and evidence preservation

STATUS: prepared, NOT deployed. Do not deploy to the VPS or write production
Supabase data until the founders approve. ASCII-only on purpose so every command
copy-pastes cleanly into a Windows console (no smart quotes, em-dashes or box
characters).

Fix scope: exclude the still-forming M15 bar from the S&R production candle
input, in the S&R candle layer only (backend/support_resistance/fetch_candles.py),
plus observability logging in run_sr_alpha.py. Nothing else changed (see the
"not changed" list in the audit). Separate follow-ups NOT in this fix:
independent zone grading, H1/H4 research parity, close-reclaim timing.

VPS facts (from scripts/vps/bootstrap.ps1 + scripts/vps/DEPLOY.md):
  - Repo (sparse checkout):   C:\IntelliTrade\repo
  - Package install:          pip install -e .[mt5]  (so `support_resistance` is importable)
  - Scheduled task name:      "IntelliTrade SR Alpha"
  - Task command:             python -m support_resistance.run_sr_alpha --source mt5
  - Task working directory:   C:\IntelliTrade\repo
  - Cadence:                   every 15 minutes

---

## Step 1 - Preserve current production evidence FIRST (read-only, pre-deploy)

Run on the VPS before anything changes. Capture to a folder and keep it.

```
$ts  = Get-Date -Format "yyyyMMdd_HHmmss"
$out = "C:\IntelliTrade\out\f1_evidence_$ts"
New-Item -ItemType Directory -Force $out | Out-Null

# a) Deployed code identity (what has actually been running)
git -C C:\IntelliTrade\repo rev-parse HEAD                    | Out-File "$out\deployed_sha.txt"
git -C C:\IntelliTrade\repo status --porcelain               | Out-File "$out\worktree_dirty.txt"
Get-FileHash C:\IntelliTrade\repo\backend\support_resistance\fetch_candles.py -Algorithm SHA256 | Out-File "$out\fetch_candles_hash.txt"
Get-FileHash C:\IntelliTrade\repo\backend\support_resistance\run_sr_alpha.py  -Algorithm SHA256 | Out-File "$out\run_sr_alpha_hash.txt"

# b) Current scheduled-task state + last run
Get-ScheduledTask     -TaskName "IntelliTrade SR Alpha" | Format-List * | Out-File "$out\task_def.txt"
Get-ScheduledTaskInfo -TaskName "IntelliTrade SR Alpha" | Format-List * | Out-File "$out\task_lastrun.txt"

# c) Current candle input archive (do NOT delete - needed for replay audit)
Copy-Item C:\IntelliTrade\out\eurusd_m15_archive.csv "$out\" -ErrorAction SilentlyContinue
```

Supabase rows (service role, read-only). Set the two env vars first, then:

```
$H = @{ apikey = $env:SUPABASE_SERVICE_ROLE_KEY; Authorization = "Bearer $($env:SUPABASE_SERVICE_ROLE_KEY)" }
Invoke-WebRequest -UseBasicParsing -Headers $H -OutFile "$out\sr_opportunities.json" `
  "$($env:SUPABASE_URL)/rest/v1/sr_opportunities?select=*&order=calculated_at.desc&limit=2000"
Invoke-WebRequest -UseBasicParsing -Headers $H -OutFile "$out\sr_zones.json" `
  "$($env:SUPABASE_URL)/rest/v1/sr_zones?select=*&limit=2000"
Invoke-WebRequest -UseBasicParsing -Headers $H -OutFile "$out\market_candles_tail.json" `
  "$($env:SUPABASE_URL)/rest/v1/market_candles?symbol=eq.EURUSD&order=time.desc&limit=2000"
```

Also record the current run_id / calculated_at from the most recent task log (in
C:\IntelliTrade\logs) into the evidence folder.

Labeling rule: the previous week's displayed grades are UNVERIFIED for
forming-candle sensitivity, NOT proven wrong. Only the replay audit (re-scoring
the archived closed candles and diffing vs the stored rows) can prove whether any
displayed grade actually differed from its closed-candle value.

## Step 2 - Pause the scheduler (so the fix cannot auto-write during verification)

```
Disable-ScheduledTask -TaskName "IntelliTrade SR Alpha"
```

## Step 3 - Deploy the approved merge commit

The branch is merged to main by an owner; the VPS then checks out exactly that
merge commit (record the SHA).

```
git -C C:\IntelliTrade\repo fetch origin
git -C C:\IntelliTrade\repo checkout <merge-commit-sha>
git -C C:\IntelliTrade\repo rev-parse HEAD                    # record deployed SHA
Get-FileHash C:\IntelliTrade\repo\backend\support_resistance\fetch_candles.py -Algorithm SHA256
# only if dependencies changed (they did not for F1): pip install -e "C:\IntelliTrade\repo[mt5]"
```

## Step 4 - Dry run (writes NOTHING - proven in code)

In run_sr_alpha.py every Supabase write is inside
`if not dry_run and supabase_writer.is_configured():` (upsert_candles,
upsert_zone, upsert_opportunity, prune_stale). With --dry-run the branch is not
entered, so no row is created, updated or deleted.

```
cd C:\IntelliTrade\repo
python -m support_resistance.run_sr_alpha --source mt5 --dry-run *>&1 | Tee-Object "C:\IntelliTrade\out\f1_postfix_dryrun.txt"
```

Confirm in the run summary:
  - "last M15 (closed=True)"                 <- MUST be True
  - now_utc, run_id, calculated_at            (calculated_at == last closed M15 open)
  - "last H1 bucket M15s : x/4", "last H4 bucket M15s : x/16"  (developing HTF is expected; now logged)
  - candles processed, zones detected, active support zones, strength distribution
  - grade distribution
  - persisted=False (dry run wrote nothing)

## Step 5 - One controlled live run (writes Supabase) - only if the dry run is clean

```
cd C:\IntelliTrade\repo
python -m support_resistance.run_sr_alpha --source mt5 *>&1 | Tee-Object "C:\IntelliTrade\out\f1_postfix_live.txt"
```

Then verify all current rows belong to the one latest run:

```
$H = @{ apikey = $env:SUPABASE_SERVICE_ROLE_KEY; Authorization = "Bearer $($env:SUPABASE_SERVICE_ROLE_KEY)" }
Invoke-RestMethod -Headers $H `
  "$($env:SUPABASE_URL)/rest/v1/sr_opportunities?select=calculated_at&order=calculated_at.desc&limit=50"
# expect a single distinct calculated_at == this run's calculated_at
```

Also confirm from the live summary: opportunities_written > 0, stale_opps_deleted
and stale_zones_deactivated as expected, no mock data (source=mt5), and the
dashboard chart / scanner / detail panel are consistent with the stored rows.

## Step 6 - Re-enable the scheduler

```
Enable-ScheduledTask -TaskName "IntelliTrade SR Alpha"
```

## Rollback

Two files, no schema, no frontend, no data migration.

```
Disable-ScheduledTask -TaskName "IntelliTrade SR Alpha"
git -C C:\IntelliTrade\repo checkout <previous-sha>          # from Step 1a
cd C:\IntelliTrade\repo
python -m support_resistance.run_sr_alpha --source mt5       # regenerate rows under old code
Enable-ScheduledTask  -TaskName "IntelliTrade SR Alpha"
```

sr_opportunities / sr_zones are fully regenerated every run (prune_stale), so a
rollback run restores the prior behaviour immediately. The Step 1 snapshots allow
after-the-fact comparison either way.
