# Opus session handoff — remaining Python refactor work (post-6.3)

Written 2026-07-06 by the Fable session that completed 6.3. Each task below is
deliberately mechanical: the design decisions are already made and stated. Do
them in order, one branch commit series per task, following repo conventions
(CLAUDE.md): commit prefixes, moves separate from logic, `pytest` green before
done, **no push** (owner pushes at refactor end).

Context you need first: read `REFACTOR_PLAN.md` §6.6/6.8/7.x and
`economic_calendar/SPLIT_MAP.md` (bottom sections) — 5 minutes, no more.

---

## Task A — 6.6: print → logging in backend runners (mechanical)

- Scope: `backend/support_resistance/run_sr_alpha.py`, `run_fixture_validation.py`,
  `run_zone_validation.py`, `validate_zone_fixture.py` and any other `print(` hits
  in `backend/` (~115 calls). NOT the golden-validated engine modules' logic —
  only swap output calls.
- Pattern: module-level `logger = logging.getLogger(__name__)`; `print(f"...")` →
  `logger.info("...", args)` (lazy %-style, not f-strings, in logger calls);
  error-ish messages → `logger.warning`/`logger.error`. Add one
  `logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")`
  in each `__main__` entry point only.
- DO NOT touch `economic_calendar/` prints: `cli.py` has ~6 `print()` calls that
  are CLI UX output (debug diagnostics paths) — leave them.
- Verify: `pytest` green + run `python -m backend.support_resistance.run_fixture_validation`
  (offline, uses fixtures) and confirm output still readable.
- Commit: `refactor: replace print with logging in backend runners (6.6)`.

## Task B — 6.6: paths from env (decisions locked, apply them)

Decisions (do not re-decide):
1. `economic_calendar/paths.py`: `set_project_dir` stays; additionally, at module
   import, honor `ECON_CALENDAR_HOME` env var as the initial PROJECT_DIR if set
   (shim's `set_project_dir` still wins when it runs — shim is the entry point).
2. `intellitrade_scanners`: hardcoded `C:\IntelliTrade\*` in
   `scripts/vps/setup_windows_tasks.ps1`, `config_template.env`,
   `export_eurusd_m15.py` → introduce `INTELLITRADE_HOME` env var with default
   `C:\IntelliTrade` (Windows) so current VPS behavior is unchanged without env set.
3. PS1 file: parameterize via `$env:INTELLITRADE_HOME` with the same default.
- Verify: `pytest` green; grep zero remaining hardcoded `C:\IntelliTrade` outside
  defaults; `python -c "import economic_calendar.paths"` works with and without
  `ECON_CALENDAR_HOME` set.
- Commit: `refactor: parameterize install paths via env with current defaults (6.6)`.
- ⚠ Anything touching `scripts/vps/` semantics beyond path constants: STOP and
  leave a note — VPS is production, drift reconciliation pending (6.7).

## Task C — 6.8: per-source fixture tests (replicate the exemplar)

- Exemplar (COMMITTED, working): `economic_calendar/tests/test_source_eurostat.py`
  + `tests/fixtures/eurostat_calendar.ics`. Read it fully; replicate per source.
  The pattern: fixture file + `FixtureSession` (URL-substring routing; unmatched
  URLs raise ConnectionError so the real fallback ladder runs) + the `lkg_off`
  fixture (inert LKG, instant retry backoff) + assert the Event contract and the
  primary→fallback→empty ladder. Route keys come from the URL constants at the
  top of each source module.
- Priority order (highest prod value first): bls, ons, statcan, abs,
  statsnz, boe, ecb, fomc, boj (eurostat ✓ exemplar). Curated/rules-based sources
  (us_curated, ism, pmi_spglobal) need no fixtures — rules are deterministic; test like the exemplar's
  rules-path test.
- Fixture capture: run `python claudeLoad/parity63/run_one.py scripts/economic_calendar_scraper.py /tmp/x.json`
  once with cache enabled? NO — simpler: each source module's URLs are at the top
  of its file; `curl -sL <url> -o economic_calendar/tests/fixtures/<source>_<page>.html`
  and trim to the relevant table/feed section if >100KB. Note capture date in a
  comment in the test.
- 2–4 tests per source is enough (happy parse, empty page → zero events + no
  crash, window filtering). Don't chase the debug/reconcile branches (BLS) —
  those are Fable-tier if ever.
- Commit per batch: `test: fixture tests for <sources> (6.8)`.

## Task D — 6.8/7.3: coverage floor in CI (config)

- After C lands: add `pytest --cov` to the three Python workflows? NO — only to a
  new `python-tests.yml` workflow (push/PR on any `*.py` change), coverage floor
  `--cov=economic_calendar --cov=intellitrade_scanners --cov=support_resistance --cov-fail-under=45`
  (measure first; set floor = current% − 2, never above 60).
- `pytest-cov` goes in `[dev]` extra + `requirements-lock.txt` regenerated the
  same way 6.5 did it (see plan 6.5 note).
- Commit: `test: CI workflow with coverage floor (7.3)`.

## Guardrails (all tasks)

- The parity harness (`claudeLoad/parity63/run_one.py`) exists for scraper-touching
  changes; Tasks A–D shouldn't need it (no scraper logic changes) — if you find
  yourself changing `economic_calendar/` behavior, you're out of scope. Stop.
- statcan.gc.ca rate-limits: don't hammer it for fixtures; one curl, cache the file.
- Owner-only items stay in OWNER_TODO.md; product ideas in IMPROVEMENTS.md.
- If blocked or something contradicts this doc: note it in the doc and stop that
  task — don't improvise around a locked decision.
