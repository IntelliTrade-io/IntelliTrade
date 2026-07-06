# Session 7 (2026-07-05) — 6.3 framework extraction: what to verify later

Work committed locally (no push, per refactor rule). Everything below is the
owner/next-session verification list before trusting the split.

## 1. Parity check — PASSED (verified in-session 2026-07-05)

Pre-split (`0a544d6^`) vs post-split scraper, identical args (`since=-1,
until=14, global+central banks, allow_persist=False`), live scrape, output
sorted by event id: **byte-identical JSON, 127 events each** (`diff` clean,
276,897 bytes both). Artifacts copied to `claudeLoad/parity63/`
(old.json/new.json + harness `run_one.py` + `pre_split_scraper.py`).
Nothing left to do here; harness kept for reuse after future split sessions:
```
python claudeLoad/parity63/run_one.py claudeLoad/parity63/pre_split_scraper.py old.json
python claudeLoad/parity63/run_one.py scripts/economic_calendar_scraper.py new.json
diff old.json new.json
```

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
