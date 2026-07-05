# Session 7 (2026-07-05) — 6.3 framework extraction: what to verify later

Work committed locally (no push, per refactor rule). Everything below is the
owner/next-session verification list before trusting the split.

## 1. Parity check (MOST IMPORTANT — was still running at session end)

Pre-split (HEAD) vs post-split scraper, identical args (`since=-1, until=14,
global+central banks, allow_persist=False`), output sorted by event id.

Artifacts (session scratchpad, may be gone — rerun if so):
`C:\Users\SYMONR~1\AppData\Local\Temp\claude\c--intellitrade\6167ddb2-909c-4d46-9e78-d9905ed4dc9c\scratchpad\parity\`
— `old.json` / `new.json` + `err_old.log` / `err_new.log`, harness `run_one.py`,
pre-split copy `pre_split_scraper.py` (= `git show <pre-split-commit>:scripts/economic_calendar_scraper.py`).

To rerun from repo root:
```
python <scratchpad>/parity/run_one.py <scratchpad>/parity/pre_split_scraper.py old.json
python <scratchpad>/parity/run_one.py scripts/economic_calendar_scraper.py new.json
diff old.json new.json
```
Expect: identical, modulo live-scrape noise (a source flaking in one run,
curated `age_days` if runs cross midnight UTC). Event ids must match — id set
diff is the signal, cosmetic extras diffs are the noise.

## 2. Suite + install checks (done this session, cheap to re-confirm)

- `python -m pytest` → 185 passed (127 existing + 58 new in `economic_calendar/tests/`).
- `pip install -e ".[scraper,dev]"` rerun after pyproject change (done locally;
  CI installs fresh so workflow unaffected).
- `python -c "import sys; sys.path.insert(0,'scripts'); import economic_calendar_scraper"` → OK.

## 3. Things I deliberately did NOT touch (pre-existing, logic-change discipline)

- `SOURCE_SLO_EXPECTATIONS` — undefined name in the tail machine-patch block
  (`try: SOURCE_SLO_EXPECTATIONS.update({...}) except ...` after `main()`), dead
  code since before split. Fix in a logic commit during orchestrator extraction.
- Unused locals at (post-split lines) ~4991 `events`, ~7154 `month_name`, ~10628 `path_label`.
- `requirements-lock.txt` NOT regenerated — no dep changes, lock still valid.
- pyflakes installed into local env for the sweep (not a project dep; uninstall if unwanted).

## 4. Watch after next scheduled workflow run (post-push, eventually)

- `economic-calendar.yml` (06:00/13:00 UTC) — `pip install ".[scraper]"` now also
  installs `economic_calendar` package; run should behave identically.
- Supabase `economic_events`: row count in window ~same; prune step should NOT
  mass-delete (would indicate scraperID drift → `make_id`/serialization regression;
  pinned test guards this but live confirm once).

## 5. Next session (6.3 continues)

Open `economic_calendar/SPLIT_MAP.md` — full map + recommended order.
Next family: PMI config + rules (`pmi_config.py`), then classification/enrichment.
