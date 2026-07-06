"""Pin the fetch framework: cache managers, retry/circuit-breaker, request prep."""

from types import SimpleNamespace
from unittest.mock import patch

import requests

from economic_calendar.http import (
    DEFAULT_HEADERS,
    SOURCE_BREAKERS,
    CircuitBreaker,
    EnhancedCacheManager,
    EphemeralCacheManager,
    RetryBudget,
    _prepare_request,
    build_session,
    get_source_breaker,
    sget_with_retry,
)


def _response(status=200, content=b"<html>ok</html>", headers=None):
    resp = requests.Response()
    resp.status_code = status
    resp._content = content
    resp.headers.update(headers or {})
    return resp


class FakeSession:
    """Stands in for requests.Session; returns queued responses or raises."""

    def __init__(self, outcomes):
        self.outcomes = list(outcomes)
        self.calls = []

    def get(self, url, **kwargs):
        self.calls.append((url, kwargs))
        outcome = self.outcomes.pop(0)
        if isinstance(outcome, Exception):
            raise outcome
        return outcome


class TestCircuitBreaker:
    def test_opens_after_threshold(self):
        breaker = CircuitBreaker(failures_before_open=2, cooldown_seconds=60)
        assert breaker.allow()
        breaker.on_failure()
        assert breaker.allow()
        breaker.on_failure()
        assert not breaker.allow()

    def test_success_resets(self):
        breaker = CircuitBreaker(failures_before_open=1, cooldown_seconds=60)
        breaker.on_failure()
        assert not breaker.allow()
        breaker.on_success()
        assert breaker.allow()

    def test_cooldown_reopens(self):
        breaker = CircuitBreaker(failures_before_open=1, cooldown_seconds=0.0)
        breaker.on_failure()
        assert breaker.allow()


class TestSourceBreakers:
    def test_key_normalized_and_reused(self):
        SOURCE_BREAKERS.pop("TESTSRC", None)
        breaker = get_source_breaker("testsrc")
        assert get_source_breaker("TestSrc") is breaker
        SOURCE_BREAKERS.pop("TESTSRC", None)


class TestEnhancedCacheManager:
    def test_save_and_load_roundtrip(self, tmp_path):
        cache = EnhancedCacheManager(cache_dir=str(tmp_path / "c"), snapshots_dir=str(tmp_path / "f"))
        url = "https://example.gov/calendar"
        cache.save_cache(url, _response(headers={"ETag": '"abc"', "Last-Modified": "yesterday"}))
        assert cache.load_cached_content(url) == b"<html>ok</html>"
        assert cache.get_conditional_headers(url) == {
            "If-None-Match": '"abc"',
            "If-Modified-Since": "yesterday",
        }

    def test_no_cache_no_conditional_headers(self, tmp_path):
        cache = EnhancedCacheManager(cache_dir=str(tmp_path / "c"), snapshots_dir=str(tmp_path / "f"))
        assert cache.get_conditional_headers("https://example.gov/none") == {}
        assert cache.load_cached_content("https://example.gov/none") is None

    def test_save_snapshot_writes_content_and_error(self, tmp_path):
        cache = EnhancedCacheManager(cache_dir=str(tmp_path / "c"), snapshots_dir=str(tmp_path / "f"))
        cache.save_snapshot("BLS", b"<html>broken</html>", error="boom")
        files = list((tmp_path / "f" / "BLS").iterdir())
        suffixes = sorted(f.suffix for f in files)
        assert suffixes == [".error", ".html"]


class TestEphemeralCacheManager:
    def test_never_persists(self, tmp_path):
        cache = EphemeralCacheManager(cache_dir=str(tmp_path / "c"), snapshots_dir=str(tmp_path / "f"))
        cache.save_cache("https://example.gov/x", _response())
        assert cache.load_cached_content("https://example.gov/x") is None
        assert cache.get_conditional_headers("https://example.gov/x") == {}
        assert cache.respect_robots("https://example.gov/x") == 0.0
        assert not (tmp_path / "c").exists()


class TestBuildSession:
    def test_headers_and_cache_manager_attached(self, tmp_path):
        cache = EphemeralCacheManager(cache_dir=str(tmp_path / "c"), snapshots_dir=str(tmp_path / "f"))
        session = build_session(cache)
        assert session.headers["User-Agent"] == DEFAULT_HEADERS["User-Agent"]
        assert session.cache_manager is cache


class TestPrepareRequest:
    def test_sets_timeout_and_referer(self):
        session = SimpleNamespace(cache_manager=None)
        kwargs, cache_manager = _prepare_request(session, "https://example.gov/a/b", 15, {})
        assert cache_manager is None
        assert kwargs["timeout"] == 15
        assert kwargs["headers"]["Referer"] == "https://example.gov"

    def test_does_not_mutate_caller_kwargs(self):
        session = SimpleNamespace(cache_manager=None)
        original = {"headers": {"X-Test": "1"}}
        kwargs, _ = _prepare_request(session, "https://example.gov/a", 15, original)
        assert original == {"headers": {"X-Test": "1"}}
        assert kwargs["headers"]["X-Test"] == "1"


class TestSgetWithRetry:
    def test_success_first_try(self):
        session = FakeSession([_response()])
        resp, path = sget_with_retry(session, "https://example.gov/x", path_hint="ics")
        assert resp.status_code == 200
        assert path == "ics"
        assert len(session.calls) == 1

    @patch("economic_calendar.http.time.sleep")
    def test_retries_then_succeeds(self, _sleep):
        session = FakeSession([requests.ConnectionError("down"), _response()])
        resp, path = sget_with_retry(session, "https://example.gov/x", budget=RetryBudget(attempts=2))
        assert resp is not None
        assert path == "dom"

    @patch("economic_calendar.http.time.sleep")
    def test_terminal_failure_returns_none(self, _sleep):
        session = FakeSession([requests.ConnectionError("down")] * 3)
        resp, path = sget_with_retry(session, "https://example.gov/x", budget=RetryBudget(attempts=3))
        assert resp is None
        assert path == "none"

    def test_open_breaker_short_circuits(self):
        breaker = CircuitBreaker(failures_before_open=1, cooldown_seconds=999)
        breaker.on_failure()
        session = FakeSession([])
        resp, path = sget_with_retry(session, "https://example.gov/x", breaker=breaker)
        assert resp is None
        assert path == "breaker_open"
        assert session.calls == []

    @patch("economic_calendar.http.time.sleep")
    def test_failure_feeds_breaker(self, _sleep):
        breaker = CircuitBreaker(failures_before_open=2, cooldown_seconds=999)
        session = FakeSession([requests.ConnectionError("down")] * 2)
        sget_with_retry(session, "https://example.gov/x", budget=RetryBudget(attempts=2), breaker=breaker)
        assert not breaker.allow()
