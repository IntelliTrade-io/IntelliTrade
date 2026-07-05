"""HTTP fetch framework: cache managers, session builder, retry + circuit breaker.

Moved verbatim from the monolith (plan 6.3); only formatting normalized.
Logs to the monolith's logger name so its handler keeps receiving records.
"""

from __future__ import annotations

import hashlib
import json
import logging
import random
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, Optional
from urllib.parse import urlparse

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger("econ_calendar_complete")


class EnhancedCacheManager:
    """Enhanced cache manager with HTTP caching and failure snapshots."""

    def __init__(self, cache_dir: str = "cache", snapshots_dir: str = "failures"):
        self.cache_dir = Path(cache_dir)
        self.snapshots_dir = Path(snapshots_dir)
        self.cache_dir.mkdir(exist_ok=True)
        self.snapshots_dir.mkdir(exist_ok=True)
        self.robots_cache = {}
        self.last_request = {}  # domain -> timestamp

    def get_cache_path(self, url: str) -> tuple[Path, Path]:
        """Get cache file paths for URL."""
        url_hash = hashlib.sha256(url.encode()).hexdigest()[:16]
        content_path = self.cache_dir / f"{url_hash}.content"
        meta_path = self.cache_dir / f"{url_hash}.meta.json"
        return content_path, meta_path

    def load_cache_meta(self, meta_path: Path) -> Dict[str, Any]:
        """Load cache metadata."""
        if not meta_path.exists():
            return {}
        try:
            with open(meta_path, 'r') as f:
                return json.load(f)
        except Exception:
            return {}

    def save_cache(self, url: str, response: requests.Response):
        """Save response to cache with metadata."""
        content_path, meta_path = self.get_cache_path(url)
        # Save content
        with open(content_path, 'wb') as f:
            f.write(response.content)
        # Save metadata
        meta = {
            "url": url,
            "status_code": response.status_code,
            "headers": dict(response.headers),
            "timestamp": datetime.now().isoformat(),
            "etag": response.headers.get("ETag"),
            "last_modified": response.headers.get("Last-Modified")
        }
        with open(meta_path, 'w') as f:
            json.dump(meta, f, indent=2)

    def load_cached_content(self, url: str) -> Optional[bytes]:
        """Load cached content if available."""
        content_path, _ = self.get_cache_path(url)
        if content_path.exists():
            with open(content_path, 'rb') as f:
                return f.read()
        return None

    def get_conditional_headers(self, url: str) -> Dict[str, str]:
        """Get conditional headers for HTTP caching."""
        _, meta_path = self.get_cache_path(url)
        meta = self.load_cache_meta(meta_path)
        headers = {}
        if meta.get("etag"):
            headers["If-None-Match"] = meta["etag"]
        if meta.get("last_modified"):
            headers["If-Modified-Since"] = meta["last_modified"]
        return headers

    def save_snapshot(self, source: str, content: bytes, error: str = ""):
        """Save failure snapshot for debugging."""
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        source_dir = self.snapshots_dir / source
        source_dir.mkdir(exist_ok=True)
        snapshot_path = source_dir / f"{timestamp}.html"
        with open(snapshot_path, "wb") as f:
            f.write(content)
        if error:
            error_path = source_dir / f"{timestamp}.error"
            with open(error_path, "w") as f:
                f.write(error)
        logger.warning(f"Saved failure snapshot: {snapshot_path}")

    def respect_robots(self, url: str) -> float:
        """Get crawl delay from robots.txt."""
        domain = urlparse(url).netloc
        if domain in self.robots_cache:
            return self.robots_cache[domain]
        try:
            robots_url = f"https://{domain}/robots.txt"
            resp = requests.get(robots_url, timeout=10)
            if resp.ok:
                for line in resp.text.splitlines():
                    if line.lower().startswith("crawl-delay:"):
                        delay = float(line.split(":", 1)[1].strip())
                        self.robots_cache[domain] = delay
                        return delay
        except Exception:
            pass
        # Default delays by domain
        defaults = {
            "abs.gov.au": 2.0,
            "ons.gov.uk": 1.5,
            "bls.gov": 1.0,
            "stats.govt.nz": 1.0
        }
        delay = defaults.get(domain, 0.5)
        self.robots_cache[domain] = delay
        return delay

    def throttle_request(self, url: str):
        """Throttle requests per domain."""
        domain = urlparse(url).netloc
        now = time.time()
        if domain in self.last_request:
            elapsed = now - self.last_request[domain]
            min_delay = self.respect_robots(url)
            if elapsed < min_delay:
                sleep_time = min_delay - elapsed + random.uniform(0.1, 0.3)
                time.sleep(sleep_time)
        self.last_request[domain] = now


# ---------------------------------------------------------------------------
# Enhanced HTTP session with caching

DEFAULT_HEADERS = {
    "User-Agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                   "AppleWebKit/537.36 (KHTML, like Gecko) "
                   "Chrome/124.0.0.0 Safari/537.36"),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,application/rss+xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en-US;q=0.9,en;q=0.8",
    "Cache-Control": "no-cache",
    "Pragma": "no-cache",
    "Connection": "keep-alive",
}


def build_session(cache_manager: EnhancedCacheManager) -> requests.Session:
    """Build a robust HTTP session with caching and retries."""
    session = requests.Session()
    session.headers.update(DEFAULT_HEADERS)
    session.cache_manager = cache_manager
    retry_strategy = Retry(
        total=3,
        backoff_factor=0.5,
        status_forcelist=[403, 408, 429, 500, 502, 503, 504],
        allowed_methods=["HEAD", "GET", "OPTIONS"],
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry_strategy, pool_connections=20, pool_maxsize=20)
    session.mount("http://", adapter)
    session.mount("https://", adapter)
    return session


# --- Retry + Circuit Breaker ----------------------------------------------
@dataclass
class RetryBudget:
    attempts: int = 3
    backoff_seconds: float = 0.75
    max_backoff_seconds: float = 4.0
    jitter: float = 0.35  # +/- 35%


class CircuitBreaker:
    def __init__(self, failures_before_open: int = 3, cooldown_seconds: float = 30.0):
        self.failures_before_open = failures_before_open
        self.cooldown_seconds = cooldown_seconds
        self._failures = 0
        self._opened_at: Optional[float] = None

    def allow(self) -> bool:
        if self._opened_at is None:
            return True
        return (time.monotonic() - self._opened_at) >= self.cooldown_seconds

    def on_success(self) -> None:
        self._failures = 0
        self._opened_at = None

    def on_failure(self) -> None:
        self._failures += 1
        if self._failures >= self.failures_before_open:
            self._opened_at = time.monotonic()


SOURCE_BREAKERS: Dict[str, CircuitBreaker] = {}


def get_source_breaker(source_key: str) -> CircuitBreaker:
    normalized = source_key.upper()
    breaker = SOURCE_BREAKERS.get(normalized)
    if breaker is None:
        breaker = CircuitBreaker()
        SOURCE_BREAKERS[normalized] = breaker
    return breaker


def source_sget(
    session: requests.Session,
    source_key: str,
    url: str,
    *,
    timeout: float = 20,
    budget: Optional[RetryBudget] = None,
    path_hint: str = "dom",
    **kwargs: Any,
) -> tuple[Optional[requests.Response], str]:
    breaker = get_source_breaker(source_key)
    use_budget = budget or RetryBudget()
    return sget_with_retry(
        session,
        url,
        timeout=timeout,
        budget=use_budget,
        breaker=breaker,
        path_hint=path_hint,
        **kwargs,
    )


def _clone_request_kwargs(kwargs: Dict[str, Any]) -> Dict[str, Any]:
    cloned = dict(kwargs)
    headers = cloned.get("headers")
    if headers:
        cloned["headers"] = dict(headers)
    return cloned


def _prepare_request(session: requests.Session, url: str, timeout: float, kwargs: Dict[str, Any]) -> tuple[Dict[str, Any], Optional[EnhancedCacheManager]]:
    request_kwargs = _clone_request_kwargs(kwargs)
    request_kwargs.setdefault("timeout", timeout)
    cache_manager: Optional[EnhancedCacheManager] = getattr(session, "cache_manager", None)
    headers = request_kwargs.setdefault("headers", {})
    if cache_manager:
        cache_manager.throttle_request(url)
        headers.update(cache_manager.get_conditional_headers(url))
    if "://" in url:
        base_url = "/".join(url.split("/")[:3])
        headers.setdefault("Referer", base_url)
    return request_kwargs, cache_manager


def _apply_cache_response(cache_manager: Optional[EnhancedCacheManager], url: str, resp: Optional[requests.Response]) -> Optional[requests.Response]:
    if not cache_manager or resp is None:
        return resp
    if resp.status_code == 304:
        cached_content = cache_manager.load_cached_content(url)
        if cached_content:
            resp._content = cached_content
            resp.status_code = 200
            logger.debug("Using cached content for %s", url)
    if resp.ok:
        cache_manager.save_cache(url, resp)
    return resp


def _issue_single_request(session: requests.Session, url: str, request_kwargs: Dict[str, Any], cache_manager: Optional[EnhancedCacheManager]) -> Optional[requests.Response]:
    resp = session.get(url, **request_kwargs)
    resp = _apply_cache_response(cache_manager, url, resp)
    if resp is not None and resp.status_code in (403, 429):
        time.sleep(0.6 + random.random() * 0.7)
        resp = session.get(url, **request_kwargs)
        resp = _apply_cache_response(cache_manager, url, resp)
    return resp


def sget_with_retry(
    session: requests.Session,
    url: str,
    *,
    timeout: float = 20,
    budget: RetryBudget = RetryBudget(),
    breaker: Optional[CircuitBreaker] = None,
    path_hint: str = "dom",
    **kwargs: Any,
) -> tuple[Optional[requests.Response], str]:
    """
    Safe GET with retry, jitter, and optional circuit breaker.
    Returns (response, path_hint) or (None, 'none') on terminal failure.
    """
    if breaker and not breaker.allow():
        return None, "breaker_open"

    delay = budget.backoff_seconds
    for attempt in range(1, budget.attempts + 1):
        request_kwargs, cache_manager = _prepare_request(session, url, timeout, kwargs)
        try:
            resp = _issue_single_request(session, url, request_kwargs, cache_manager)
        except Exception:
            resp = None

        if resp is not None and 200 <= resp.status_code < 300 and (resp.text or resp.content):
            if breaker:
                breaker.on_success()
            return resp, path_hint

        if breaker:
            breaker.on_failure()

        if attempt == budget.attempts:
            break

        jitter = delay * budget.jitter * (2 * random.random() - 1)
        sleep_for = min(budget.max_backoff_seconds, max(0.1, delay + jitter))
        time.sleep(sleep_for)
        delay = min(budget.max_backoff_seconds, delay * 1.6)

    return None, "none"


class EphemeralCacheManager:
    """Cache manager variant that disables on-disk persistence for serverless runs."""

    def __init__(self, cache_dir: str = "cache", snapshots_dir: str = "failures"):
        self.cache_dir = Path(cache_dir)
        self.snapshots_dir = Path(snapshots_dir)
        self.robots_cache: Dict[str, float] = {}
        self.last_request: Dict[str, float] = {}

    def get_cache_path(self, url: str) -> tuple[Path, Path]:
        url_hash = hashlib.sha256(url.encode()).hexdigest()[:16]
        content_path = self.cache_dir / f"{url_hash}.content"
        meta_path = self.cache_dir / f"{url_hash}.meta.json"
        return content_path, meta_path

    def load_cache_meta(self, meta_path: Path) -> Dict[str, Any]:
        return {}

    def save_cache(self, url: str, response: requests.Response) -> None:
        return

    def load_cached_content(self, url: str) -> Optional[bytes]:
        return None

    def get_conditional_headers(self, url: str) -> Dict[str, str]:
        return {}

    def save_snapshot(self, source: str, content: bytes, error: str = "") -> None:
        logger.debug("Ephemeral cache skipping snapshot for %s", source)

    def respect_robots(self, url: str) -> float:
        return 0.0

    def throttle_request(self, url: str) -> None:
        self.last_request[urlparse(url).netloc] = time.time()


def sget_retry_alt(
    session: requests.Session,
    urls,
    headers=None,
    tries: int = 4,
    timeout: int = 25,
    *,
    budget: RetryBudget | None = None,
    breaker: Optional[CircuitBreaker] = None,
    path_hint: str = "dom",
):
    """Try a sequence of URLs with basic backoff/jitter and return the first successful response."""
    if isinstance(urls, str):
        url_list = [urls]
    else:
        url_list = list(urls)

    if not url_list:
        return None

    hdrs = headers.copy() if headers else {}
    hdrs.setdefault("User-Agent", DEFAULT_HEADERS.get("User-Agent", "Mozilla/5.0"))

    last_resp = None
    request_budget = budget or RetryBudget()

    for attempt in range(tries):
        for url in url_list:
            resp, _ = sget_with_retry(
                session,
                url,
                timeout=timeout,
                budget=request_budget,
                breaker=breaker,
                path_hint=path_hint,
                headers=hdrs,
            )
            if resp is not None:
                last_resp = resp
                if getattr(resp, "ok", False):
                    return resp
        time.sleep(0.6 * (1.8**attempt) + (random.random() * 0.4))

    return last_resp
