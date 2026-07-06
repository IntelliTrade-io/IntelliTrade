# 6.3 split map — scripts/economic_calendar_scraper.py → economic_calendar/

Working map for the multi-session monolith split (REFACTOR_PLAN §6.3).
Line numbers refer to the monolith at the start of session 7 (14,565 lines, 270 defs).
Rule: mechanical moves only — logic changes are separate commits.

## Contract that must never break

- `scripts/economic_calendar_upload.py` does `from economic_calendar_scraper import run`
  (GitHub workflow `economic-calendar.yml` runs it with `pip install ".[scraper]"`).
- `run(since_days, until_days, include_global, include_central_banks, allow_persist)` → list[dict].
- Output/cache/config paths anchor to `scripts/` via `PROJECT_DIR = Path(__file__).parent`
  (out/, cache/, failures/, config JSONs). Path parameterization is plan 6.6, not 6.3.

## Framework layers (extracted session 7 — DONE)

| Monolith region | Target module | Contents |
|---|---|---|
| 5–45, 284–337 (minus 321–323), 592–605, 829–835, 1015–1112, 3310–3314 | `timeutils.py` | MONTHS, month_to_num, TZ constants, `_get_zoneinfo`, `_now_utc`, `_iso`, `ensure_aware`, `_parse_local_time`, business-day/weekday helpers, `_within` |
| 796–827, 837–867, 869–1013 | `events.py` | EVENT_JSON_SCHEMA + `_validate_event_schema`, content hashes, COUNTRY_CODES, `Event`, `_event_to_dict` / `_event_from_dict`, `make_id` |
| 3348–3859 | `http.py` | `EnhancedCacheManager`, `EphemeralCacheManager`, DEFAULT_HEADERS, `build_session`, `RetryBudget`, `CircuitBreaker`, SOURCE_BREAKERS, `get_source_breaker`, `source_sget`, `sget_with_retry`, `sget_retry_alt` |
| 3861–4037 | `ics.py` | `parse_ics_datetime`, `parse_ics_bytes` |

Logging: extracted modules log to the monolith's logger name `econ_calendar_complete`
so the handler configured in the monolith keeps receiving their records. Revisit when
the CLI/orchestrator moves into the package.

## Session 8 (2026-07-06) — PMI + curated extracted (DONE)

| Monolith region (post-session-7 lines) | Target module | Contents |
|---|---|---|
| 306–474, 722–752 | `curated.py` | CuratedMeeting + CURATED_* data, strict/warn zero gates, benign-zero-reason policy, `_curated_fallback_info`, GraceWindowConfig + GRACE_WINDOW_SOURCES, `_resolve_curated_local_dt`, `_ensure_time_confidence` |
| 476–720, 755–859 | `pmi.py` | PROVIDER constants, PMI dataclasses, config JSON loading + lazy caches, sector/importance inference, `_calc_pmi_rule_date`, override matching, `_estimate_pmi_releases_for_series` |

Adaptation (documented in commit): `_resolve_config_path` anchors via `pmi.set_config_base()`;
the monolith pins it to its own directory at import. NOTE: the three PMI config JSONs
(`PMI_FEEDS_CATALOG/ESTIMATOR_RULES/OVERRIDES.json`) exist nowhere in the repo — the
SPGLOBAL_PMI source has been running its broad-except fallback path in prod (owner flagged).

## Session 9 (2026-07-06, same day) — classification & enrichment extracted (DONE)

| Target module | Contents |
|---|---|
| `textutils.py` | eventish accessors, `_normalize_metadata_text`, text/regex matchers (shared by enrich + bls_specs; avoids a circular import) |
| `bls_specs.py` | BLS canonical release specs + curated date overrides + `_bls_canonical_key_from_text` + the local business-day helpers its rule lambdas need (`_weekday_local`, `_nth_business_day_local`, `_last_business_day_local`) |
| `enrich.py` | impact keywords + `classify_event`, country/category/pair-relevance inference, official-URL standardization (incl. S&P Global + `NBS_RELEASE_CALENDAR_INDEX_URL`), descriptions, low-signal/market-mover gates, ECB classification, trader-relevance scoring, dashboard gating, `_enrich_event(s)_metadata` |

Monolith 13,002 → 11,520. Speaker constants (CENTRAL_BANK_SPEAKER_*) deliberately
left in the monolith for the speakers-family session. `_curated_us_event`,
`_iter_local_month_starts`, `_shift_local_business_date` stay with the US fetchers.

## Session 10 (2026-07-06, same day) — speakers + HTML helpers + run state (DONE)

| Target module | Contents |
|---|---|
| `runstate.py` | `RUN_CONTEXT` + `RUN_CONTEXT_LOCK` — shared run-scoped state dict; monolith imports the same object, so LKG/health/orchestrator keep mutating it unchanged |
| `htmlparse.py` | selector-compat table/list helpers (`find_rows_by_header_keywords`, `broad_li_filter`, `rows_by_header_xpath`) |
| `speakers.py` | full central-bank speaker family: institution priority config, role rules, identity/scoring, datetime extraction, HTML + BoE-text parsing, dedupe, `collect_central_bank_speaker_events` (writes health into RUN_CONTEXT) |

Monolith 11,520 → 10,819. `run_central_bank_speaker_debug_diagnostics` stays in the
monolith (CLI-debug glue writing under script-anchored OUT_DIR; single caller passes
out_dir explicitly). Parity-3 lesson recorded: statcan.gc.ca rate-limits repeated
parity runs and flaps between live/degraded — when a parity diff is confined to one
source, AST-compare that source's functions pre/post before suspecting the cut.

## Session 11 (2026-07-06) — LKG / schema sentinel / health (DONE)

`health.py`: LKG persist/merge/read, schema capture, fetch metadata, zero snapshots,
SourceHealth SLOs + all health/QA payload builders, publish state. Path anchoring via
`health.set_paths(OUT_DIR, PRODUCTION_DIR)` (monolith pins at import). Coupling fixes
that came with it: monolith's `gather_events` was REBINDING `RUN_CONTEXT` — now
in-place `clear()/update()` so the runstate-shared dict stays one object;
`CURRENT_CACHE_MANAGER`, `RUN_OVERRIDES`, `DEBUG_ZERO_FLAG`/`STRICT_ZERO_FLAG` moved
to `runstate` (flags read via attribute access — CLI rebinds stay visible everywhere).
Monolith 10,819 → 9,972. Parity verified on both events AND health/warning log lines.

## Remaining families (future sessions, rough order)
3. **HTML parse helpers** (3250–3347): header-keyword row finders, `rows_by_header_xpath` → `htmlparse.py`.
4. **Central-bank speakers** (2711–3249) → `sources/speakers.py`.
5. **LKG / schema sentinel / health** (8477–9302): zero snapshots, fetch metadata,
   `_persist_lkg` / `maybe_merge_lkg`, schema capture, SourceHealth (229–266) + health payloads
   → `health.py` + `lkg.py`. Heavy global state (FETCH_METADATA etc.) — extract carefully.
6. **Per-source fetchers** (one module per agency under `sources/`):
   - Central banks: BoE 4043, BoC 4280, RBA 4392, RBNZ 4613, Fed/FOMC 11684, ECB 11940,
     BoJ 12257, SNB 12712
   - US macro: BLS 6535 + BLS debug/reconcile 7109–8090 + html fallback 9303, ISM 6608,
     curated US 6894–7108, BEA 8091, Census 8110, DOL 8132, EIA 8159, UMich 8186, ADP 8300
   - Europe: ONS 6019 + 9631–9984, Eurostat 10735, SECO 5285, BFS 5763
   - APAC: ESRI 4842, ABS 9985, StatCan 10188–10734, Stats NZ 10871, China NBS 10968–11683
   - PMI S&P Global 8399
7. **Merge/fallback/orchestration** (12937–13605): key filters, `_merge_events`, per-source
   fallbacks, `_apply_health_guard`, fetcher task runner → `orchestrator.py`.
8. **Collect/run/export/CLI** (13606–14565): `gather_*`, `collect_events`, `run`, CSV/JSON/JSONL
   exporters, `main` → `cli.py` / `collect.py`. When this lands, `scripts/economic_calendar_scraper.py`
   becomes a pure shim re-exporting `run`.

Per-source sessions: move fetcher + its curated data blocks, add tests against cached
HTML/ICS fixtures, re-evaluate `lxml`/`feedparser` need per source (plan 6.5 leftover).
