# coding: utf-8
"""
Minimal Supabase PostgREST client over `requests`.

Replaces the `supabase-py` SDK (20+ transitive packages: httpx, websockets,
realtime, gotrue, pydantic, …) for the handful of table operations this
codebase performs. Every method returns the affected rows as a list of dicts
(`Prefer: return=representation`), mirroring the `.data` the SDK returned.

Filters are (column, "<op>.<value>") query pairs — build them with the helper
functions (eq, gte, lte, not_in) so values are formatted/quoted correctly.
"""

from __future__ import annotations

import os
from collections.abc import Iterable, Mapping

import requests

Filter = tuple[str, str]

_TIMEOUT = 30.0


class PostgrestError(RuntimeError):
    """Non-2xx response from PostgREST (message includes status + body)."""


# ── filter builders ───────────────────────────────────────────────────────────

def eq(column: str, value: object) -> Filter:
    return (column, f"eq.{value}")


def gte(column: str, value: object) -> Filter:
    return (column, f"gte.{value}")


def lte(column: str, value: object) -> Filter:
    return (column, f"lte.{value}")


def _quote(value: object) -> str:
    text = str(value).replace('"', '\\"')
    return f'"{text}"'


def in_(column: str, values: Iterable[object]) -> Filter:
    return (column, "in.(" + ",".join(_quote(v) for v in values) + ")")


def not_in(column: str, values: Iterable[object]) -> Filter:
    return (column, "not.in.(" + ",".join(_quote(v) for v in values) + ")")


# ── client ────────────────────────────────────────────────────────────────────

class Postgrest:
    """One instance per credential set; safe to cache at module level."""

    def __init__(self, url: str | None = None, key: str | None = None,
                 timeout: float = _TIMEOUT):
        url = url or os.environ.get("SUPABASE_URL")
        key = key or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
        if not url or not key:
            raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
        self._rest = url.rstrip("/") + "/rest/v1"
        self._timeout = timeout
        self._session = requests.Session()
        self._session.headers.update({
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
        })

    def _request(self, method: str, table: str,
                 params: list[tuple[str, str]],
                 json_body: object = None,
                 prefer: str = "return=representation",
                 extra_headers: Mapping | None = None) -> list[dict]:
        headers = {"Prefer": prefer}
        if extra_headers:
            headers.update(extra_headers)
        resp = self._session.request(
            method, f"{self._rest}/{table}",
            params=params, json=json_body,
            headers=headers,
            timeout=self._timeout,
        )
        if not (200 <= resp.status_code < 300):
            raise PostgrestError(f"{method} {table} -> {resp.status_code}: {resp.text[:500]}")
        if not resp.content:
            return []
        data = resp.json()
        return data if isinstance(data, list) else [data]

    @staticmethod
    def _rows(rows: Mapping | list) -> list:
        return [dict(rows)] if isinstance(rows, Mapping) else list(rows)

    _PAGE = 1000

    def select(self, table: str, columns: str = "*",
               filters: Iterable[Filter] = ()) -> list[dict]:
        """Fetch all matching rows, paginating past PostgREST's default row cap.

        PostgREST returns at most ~1000 rows per response (and in no guaranteed
        order). Paginate with the Range header so callers always get the complete
        set. Filters/params are unchanged, so the request shape callers see is
        identical to a single-page fetch."""
        params = [("select", columns), *filters]
        rows: list[dict] = []
        start = 0
        while True:
            batch = self._request(
                "GET", table, params,
                extra_headers={"Range-Unit": "items",
                               "Range": f"{start}-{start + self._PAGE - 1}"},
            )
            rows.extend(batch)
            if len(batch) < self._PAGE:
                break
            start += self._PAGE
        return rows

    def insert(self, table: str, rows: Mapping | list) -> list[dict]:
        return self._request("POST", table, [], self._rows(rows))

    def upsert(self, table: str, rows: Mapping | list,
               on_conflict: str | None = None) -> list[dict]:
        params = [("on_conflict", on_conflict)] if on_conflict else []
        return self._request("POST", table, params, self._rows(rows),
                             prefer="resolution=merge-duplicates,return=representation")

    def update(self, table: str, values: Mapping,
               filters: Iterable[Filter]) -> list[dict]:
        return self._request("PATCH", table, list(filters), dict(values))

    def delete(self, table: str, filters: Iterable[Filter]) -> list[dict]:
        return self._request("DELETE", table, list(filters))
