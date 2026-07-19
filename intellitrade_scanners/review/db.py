# coding: utf-8
"""
Thin DB access for the review pipeline: a cached service-role PostgREST client
(same client the scanners use) plus a job-run logger. All review tables are
RLS deny-all; this client has BYPASSRLS via the service-role key.
"""

from __future__ import annotations

import datetime as dt
import logging
from contextlib import contextmanager

from intellitrade_scanners.postgrest import Postgrest

log = logging.getLogger(__name__)

UTC = dt.timezone.utc

_client: Postgrest | None = None


def get_client() -> Postgrest:
    global _client
    if _client is None:
        _client = Postgrest()
    return _client


def _now_iso() -> str:
    return dt.datetime.now(UTC).isoformat().replace("+00:00", "Z")


@contextmanager
def job_run(job_name: str, client: Postgrest | None = None):
    """Record a csm_review_job_runs row around a stage.

    Yields a mutable dict; set dict["items_processed"] and dict["detail"] inside
    the block. On exception the row is marked error (and the exception re-raised).
    """
    db = client or get_client()
    state = {"items_processed": 0, "detail": {}}
    started = _now_iso()
    try:
        yield state
    except Exception as exc:  # noqa: BLE001 - recorded then re-raised
        _write_job_run(db, job_name, started, "error",
                       state.get("items_processed", 0), state.get("detail"), str(exc))
        raise
    else:
        _write_job_run(db, job_name, started, "ok",
                       state.get("items_processed", 0), state.get("detail"), None)


def _write_job_run(db: Postgrest, job_name: str, started: str, status: str,
                   items: int, detail: object, error: str | None) -> None:
    try:
        db.insert("csm_review_job_runs", {
            "job_name": job_name,
            "started_at": started,
            "finished_at": _now_iso(),
            "status": status,
            "items_processed": items,
            "detail": detail,
            "error": error,
        })
    except Exception as exc:  # noqa: BLE001 - logging must never mask stage result
        log.error("csm_review_job_runs write failed (%s/%s): %s", job_name, status, exc)
