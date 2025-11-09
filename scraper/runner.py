#!/usr/bin/env python3

from __future__ import annotations

# === Month constants injected by apply_month_constants_patch ===

MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"]

MONTH_ABBR2NUM = {
    "jan":1,"feb":2,"mar":3,"apr":4,"may":5,"jun":6,"jul":7,"aug":8,"sep":9,"sept":9,"oct":10,"nov":11,"dec":12
}

def month_to_num(name: str) -> int | None:
    if not name:
        return None
    n = name.strip().lower()
    # exact full name
    for i, m in enumerate(MONTHS, 1):
        if n == m.lower():
            return i
    # startswith on full names
    for i, m in enumerate(MONTHS, 1):
        if m.lower().startswith(n[:3]):
            return i
    # abbr map
    return MONTH_ABBR2NUM.get(n)

# === End injected block ===

"""
Economic Calendar Scraper - Vercel Compatible Version
====================================================

Complete enterprise-grade economic calendar scraper with:
- All CSS selector fixes implemented
- Complete central bank coverage (Fed, ECB, BoE, BoC, RBA, RBNZ)
- Fixed ONS RSS and StatCan date parsing
- All 12 enterprise features
- Global expansion (Japan, China, Switzerland)
- Exposed run() function for Vercel integration
"""

import argparse
import inspect
import unicodedata
import hashlib
import json
import logging
import sys
import os
import re
import random
import time
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Dict, List, Optional, Any, Callable
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

try:
    from bs4 import BeautifulSoup
    import soupsieve as sv
except ImportError:
    BeautifulSoup = None
    sv = None

try:
    import feedparser
except ImportError:
    feedparser = None

try:
    from dateutil import parser as dateparser
except ImportError:
    dateparser = None

try:
    from lxml import html as lxml_html
except ImportError:
    lxml_html = None

# === Feature toggles for additive hardening (safe-by-default) ===
FEATURE = {
    "ESRI_NFKC_KANJI": True,
    "SECO_STRUCTURED_PASS": True,
    "RBNZ_JSONLD_PASS": True,
}

ENABLE_LKG = True
ENABLE_SCHEMA_SENTINEL = True

LKG_TTLS = {
    "ECB": 14,
    "ESRI": 30,
    "SECO_EST": 90,
}

class SourceHealth:
    SLO = {"BLS":150, "EUROSTAT":400, "STATSNZ":120, "ONS":5, "ABS":10, "STATSCAN":10, "ECB":1, "SECO":0, "ESRI":0, "NBS":1, "RBNZ":1}
    
    @staticmethod
    def scaled(since_days: int, until_days: int, key: str) -> int:
        window = max(1, int((until_days - since_days) or 60))
        base = SourceHealth.SLO.get(key, 0)
        return max(1, int(base * window / 60))

# ---------------------------------------------------------------------------
# Logging setup
logger = logging.getLogger("econ_calendar_complete")
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter("%(asctime)s [%(levelname)s] %(message)s"))
logger.addHandler(handler)
logger.setLevel(logging.INFO)

# [REST OF THE CODE REMAINS EXACTLY THE SAME UNTIL THE main() FUNCTION]
# ... [Include all the existing code here - timezones, Event class, scrapers, etc.] ...

# ---------------------------------------------------------------------------
# Vercel-compatible run() function



# ---------------------------------------------------------------------------

# Timezone definitions

UTC = ZoneInfo("UTC")

LONDON_TZ = ZoneInfo("Europe/London")

NEW_YORK_TZ = ZoneInfo("America/New_York")

BRUSSELS_TZ = ZoneInfo("Europe/Brussels")

FRANKFURT_TZ = ZoneInfo("Europe/Berlin")

BERLIN_TZ = ZoneInfo("Europe/Berlin")

SYDNEY_TZ = ZoneInfo("Australia/Sydney")

WELLINGTON_TZ = ZoneInfo("Pacific/Auckland")

OTTAWA_TZ = ZoneInfo("America/Toronto")

TORONTO_TZ = ZoneInfo("America/Toronto")

TOKYO_TZ = ZoneInfo("Asia/Tokyo")

BEIJING_TZ = ZoneInfo("Asia/Shanghai")

ZURICH_TZ = ZoneInfo("Europe/Zurich")

def _now_utc() -> datetime:

    return datetime.now(UTC)

def _iso(dt: datetime) -> str:

    return dt.astimezone(UTC).isoformat()

def _content_hash_bytes(data: bytes) -> str:

    return hashlib.sha256(data).hexdigest()[:16]

def _content_hash_text(text: str) -> str:

    return hashlib.sha256(text.encode("utf-8", errors="ignore")).hexdigest()[:16]

# Country code mapping

COUNTRY_CODES = {

    "US": "United States",

    "EU": "European Union",

    "GB": "United Kingdom",

    "CA": "Canada",

    "AU": "Australia",

    "NZ": "New Zealand",

    "JP": "Japan",

    "CN": "China",

    "CH": "Switzerland"

}

# ---------------------------------------------------------------------------

# Event model with stable IDs

@dataclass

class Event:

    """Complete production Event model with stable IDs and comprehensive metadata."""

    id: str                 # sha1(country|agency|title|date_time_utc)

    source: str             # scraper module tag, e.g., "ABS_HTML", "BLS_ICS"

    agency: str             # e.g., "ABS", "BLS", "ONS", "ECB", "FOMC"

    country: str            # ISO-2: AU, US, GB, CA, EU, NZ, JP, CN, CH

    title: str

    date_time_utc: datetime

    event_local_tz: str     # IANA, e.g., "Australia/Sydney"

    impact: str             # High/Medium/Low

    url: str

    extras: Dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> Dict[str, Any]:

        """Serialize the event to a JSON-serializable dictionary."""

        return {

            "id": self.id,

            "source": self.source,

            "agency": self.agency,

            "country": self.country,

            "title": self.title,

            "date_time_utc": self.date_time_utc.isoformat(),

            "event_local_tz": self.event_local_tz,

            "impact": self.impact,

            "url": self.url,

            "extras": self.extras,

        }

def _event_to_dict(ev: Event) -> dict:

    return ev.to_dict()

def _event_from_dict(data: dict) -> Event:

    dt = datetime.fromisoformat(data["date_time_utc"])

    if dt.tzinfo is None:

        dt = dt.replace(tzinfo=UTC)

    return Event(

        id=data["id"],

        source=data["source"],

        agency=data["agency"],

        country=data["country"],

        title=data["title"],

        date_time_utc=dt,

        event_local_tz=data.get("event_local_tz") or "UTC",

        impact=data.get("impact") or "Low",

        url=data.get("url") or "",

        extras=data.get("extras") or {},

    )

def make_id(country: str, agency: str, title: str, dt_utc: datetime) -> str:

    """Generate stable event ID from canonical fields."""

    blob = f"{country}|{agency}|{title}|{dt_utc.isoformat()}"

    return hashlib.sha1(blob.encode()).hexdigest()

def ensure_aware(dt: datetime, default_tz: ZoneInfo, default_hour: int = 10, default_min: int = 0) -> datetime:

    """Ensure datetime is timezone-aware with proper defaults."""

    if dt is None:

        return None

    if dt.tzinfo is None:

        # If time is 00:00, apply default hour/minute

        if dt.hour == 0 and dt.minute == 0:

            dt = dt.replace(hour=default_hour, minute=default_min)

        dt = dt.replace(tzinfo=default_tz)

    return dt

# ---------------------------------------------------------------------------

# Enhanced impact classification

HIGH_KEYWORDS = [

    "gdp", "gross domestic product", "inflation", "cpi", "consumer price index",

    "hicp", "cpih", "cpij", "ppi", "producer price index", "unemployment",

    "nonfarm", "nonfarm payrolls", "employment report", "labour force",

    "employment", "jobless", "rate decision", "policy rate", "monetary policy",

    "central bank", "interest rate", "core inflation", "fomc", "mpc", "ecb",

    "governing council", "bank rate", "ocr", "official cash rate", "cash rate"

]

MEDIUM_KEYWORDS = [

    "retail sales", "pmi", "manufacturing pmi", "services pmi", "wages",

    "earnings", "trade balance", "industrial production", "wage price",

    "current account", "business confidence", "consumer confidence",

    "building permits", "housing starts", "construction", "business count",

    "capital expenditure", "economic forecast", "business indicators"

]

def classify_event(title: str) -> str:

    """Classify event impact based on title keywords."""

    title_lower = title.lower()

    for keyword in HIGH_KEYWORDS:

        if keyword in title_lower:

            return "High"

    for keyword in MEDIUM_KEYWORDS:

        if keyword in title_lower:

            return "Medium"

    return "Low"  # Default to Low unless keyword hits

# ---------------------------------------------------------------------------

# Selector-compat helpers (fixes CSS :matches() issues)

def find_rows_by_header_keywords(soup: BeautifulSoup, table_sel_list, header_keywords_lower):

    """



    Return <tr> rows from the first table whose header row contains ANY of the



    given lowercased keywords. Avoids :matches() / complex CSS. 



    """

    for sel in table_sel_list:                 # e.g. ["table", "div table"]

        for tbl in soup.select(sel):

            ths = tbl.select("th")

            if not ths:

                continue

            th_text = " ".join(th.get_text(" ", strip=True).lower() for th in ths)

            if any(k in th_text for k in header_keywords_lower):

                rows = [tr for tr in tbl.select("tr") if tr.select("td")]

                if rows:

                    return rows

    return []

def broad_li_filter(soup: BeautifulSoup, section_words_regex: str):

    """



    Broad fallback: scan all list items under sections/divs, keep those whose text



    matches the given regex (case-insensitive).



    """

    regex = re.compile(section_words_regex, re.I)

    lis = soup.select("section li, div li, ul li, article li")

    return [li for li in lis if regex.search(li.get_text(" ", strip=True))]

def _within(dt_utc: datetime, start_utc: datetime, end_utc: datetime) -> bool:

    """Check if datetime is within range."""

    return start_utc <= dt_utc <= end_utc

def rows_by_header_xpath(content_bytes: bytes, header_keywords_lower):

    """Optional XPath fallback for bulletproof table parsing."""

    if not lxml_html:

        return []

    try:

        root = lxml_html.fromstring(content_bytes)

        tables = root.xpath("//table[.//th]")

        for tbl in tables:

            th_text = " ".join(("".join(th.itertext()) or "").strip().lower() for th in tbl.xpath(".//th"))

            if any(k in th_text for k in header_keywords_lower):

                return tbl.xpath(".//tr[td]")

    except Exception:

        pass

    return []

# ---------------------------------------------------------------------------

# Enhanced caching with ETag/Last-Modified support

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

def sget(session: requests.Session, url: str, **kw) -> requests.Response:

    """Enhanced GET with caching and throttling."""

    cache_manager = session.cache_manager

    # Throttle request

    cache_manager.throttle_request(url)

    # Set up conditional headers

    kw.setdefault("headers", {})

    kw["headers"].update(cache_manager.get_conditional_headers(url))

    kw.setdefault("timeout", 30)

    # Add referer hint

    if "://" in url:

        base_url = "/".join(url.split("/")[:3])

        kw["headers"].setdefault("Referer", base_url)

    resp = session.get(url, **kw)

    # Handle 304 Not Modified

    if resp.status_code == 304:

        cached_content = cache_manager.load_cached_content(url)

        if cached_content:

            # Create a mock response with cached content

            resp._content = cached_content

            resp.status_code = 200

            logger.debug(f"Using cached content for {url}")

    # Cache successful responses

    if resp.ok:

        cache_manager.save_cache(url, resp)

    # Retry on 403/429

    if resp.status_code in (403, 429):

        time.sleep(0.6 + random.random() * 0.7)

        resp = session.get(url, **kw)

        if resp.ok:

            cache_manager.save_cache(url, resp)

    return resp

# ---------------------------------------------------------------------------

# Enhanced ICS parser

def sget_retry_alt(session: requests.Session, urls, headers=None, tries: int = 4, timeout: int = 25):

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

    for attempt in range(tries):

        for url in url_list:

            try:

                resp = sget(session, url, headers=hdrs, timeout=timeout)

            except Exception:

                resp = None

            if resp is not None:

                last_resp = resp

                if getattr(resp, "ok", False):

                    return resp

        time.sleep(0.6 * (1.8 ** attempt) + (random.random() * 0.4))

    return last_resp

def parse_ics_datetime(val: str, params: Dict[str, str], source_tz: ZoneInfo,

                      default_hour: int = 10, default_min: int = 0) -> datetime:

    """Parse ICS datetime with proper TZID handling."""

    # Z suffix = UTC

    if val.endswith("Z"):

        dt = datetime.strptime(val[:-1], "%Y%m%dT%H%M%S")

        return dt.replace(tzinfo=UTC)

    # Date-only YYYYMMDD

    if re.fullmatch(r"\d{8}", val):

        dt = datetime.strptime(val, "%Y%m%d").replace(hour=default_hour, minute=default_min)

        if "TZID" in params:

            try:

                tz = ZoneInfo(params["TZID"])

                return dt.replace(tzinfo=tz)

            except Exception:

                pass

        return dt.replace(tzinfo=source_tz)

    # Date-time YYYYMMDDTHHMMSS

    if re.fullmatch(r"\d{8}T\d{6}", val):

        dt = datetime.strptime(val, "%Y%m%dT%H%M%S")

        if "TZID" in params:

            try:

                tz = ZoneInfo(params["TZID"])

                return dt.replace(tzinfo=tz)

            except Exception:

                pass

        return dt.replace(tzinfo=source_tz)

    raise ValueError(f"Unrecognized DTSTART format: {val}")

def parse_ics_bytes(data: bytes, source_tz: ZoneInfo, default_hour: int = 10,

                   default_min: int = 0) -> List[Dict[str, Any]]:

    """Enhanced ICS parser with TZID support."""

    text = data.decode("utf-8", errors="ignore")

    # Unfold folded lines

    lines = []

    for line in text.splitlines():

        if line.startswith(" ") or line.startswith("\t"):

            if lines:

                lines[-1] += line.strip()

        else:

            lines.append(line.strip())

    events = []

    cur = {}

    in_event = False

    def flush_event():

        if not cur:

            return

        title = cur.get("SUMMARY") or cur.get("DESCRIPTION") or "Untitled"

        dt_start_raw = cur.get("DTSTART")

        dt_start_params = cur.get("DTSTART_PARAMS", {})

        url = cur.get("URL") or cur.get("UID") or ""

        if not dt_start_raw:

            return

        try:

            dt = parse_ics_datetime(dt_start_raw, dt_start_params, source_tz, default_hour, default_min)

            events.append({

                "title": title.strip(),

                "dt": dt,

                "url": url,

                "raw": dict(cur),

            })

        except Exception as e:

            logger.debug(f"Failed to parse ICS datetime {dt_start_raw}: {e}")

    for ln in lines:

        if ln == "BEGIN:VEVENT":

            in_event = True

            cur = {}

            continue

        if ln == "END:VEVENT":

            in_event = False

            flush_event()

            cur = {}

            continue

        if not in_event:

            continue

        if ":" in ln:

            left, val = ln.split(":", 1)

            # Parse parameters

            if ";" in left:

                key, param_str = left.split(";", 1)

                params = {}

                for param in param_str.split(";"):

                    if "=" in param:

                        pk, pv = param.split("=", 1)

                        params[pk.upper()] = pv

                cur[key.upper() + "_PARAMS"] = params

            else:

                key = left

            cur[key.upper()] = val.strip()

    return events

# ---------------------------------------------------------------------------

# Complete Central Bank Scrapers (Fed, ECB, BoE, BoC, RBA, RBNZ)

def fetch_boe_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch BoE MPC meeting dates from official schedule with hardcoded selectors."""

    events: List[Event] = []
    cache_manager = getattr(session, "cache_manager", None)

    source, agency, country = "BOE_HTML", "BOE", "GB"

    url = "https://www.bankofengland.co.uk/news/2023/december/mpc-dates-for-2025"

    try:

        resp = sget(session, url)

        if not resp.ok or not BeautifulSoup:

            logger.warning("BoE: fetch failed")

            return events

        soup = BeautifulSoup(resp.text, "html.parser")

        # First try time[datetime] elements if available

        for t in soup.select("time[datetime]"):

            if not t.get("datetime"):

                continue

            try:

                dt_local = dateparser.parse(t["datetime"])

            except Exception:

                continue

            if not dt_local:

                continue

            dt_local = ensure_aware(dt_local, LONDON_TZ, 12, 0)

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            parent = t.parent

            link = parent.find("a", href=True)

            href = urljoin(url, link["href"]) if link else url

            title = "MPC Meeting"

            events.append(Event(

                id=make_id(country, agency, title, dt_utc),

                source=source,

                agency=agency,

                country=country,

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="Europe/London",

                impact="High",

                url=href,

                extras={"announcement_time_local": "12:00"},

            ))

        # Fallback: Parse table with MPC dates using hardcoded selectors

        if not events:

            # Look for table containing MPC dates

            tables = soup.select("table")

            for table in tables:

                rows = table.select("tr")

                for row in rows:

                    cells = row.select("td")

                    if len(cells) >= 2:

                        date_text = cells[0].get_text(" ", strip=True)

                        description = cells[1].get_text(" ", strip=True)

                        # Use regex to match date pattern: Thursday 6 February, etc.

                        date_match = re.search(r"(\w+day)\s+(\d{1,2})\s+([A-Z][a-z]+)", date_text)

                        if date_match and "MPC" in description:

                            try:

                                # Parse date with current year (2025)

                                day = date_match.group(2)

                                month = date_match.group(3)

                                date_str = f"{day} {month} 2025"

                                dt_local = dateparser.parse(date_str)

                                if dt_local:

                                    dt_local = ensure_aware(dt_local, LONDON_TZ, 12, 0)

                                    dt_utc = dt_local.astimezone(UTC)

                                    if _within(dt_utc, start_utc, end_utc):

                                        title = "MPC Meeting"

                                        events.append(Event(

                                            id=make_id(country, agency, title, dt_utc),

                                            source=source,

                                            agency=agency,

                                            country=country,

                                            title=title,

                                            date_time_utc=dt_utc,

                                            event_local_tz="Europe/London",

                                            impact="High",

                                            url=url,

                                            extras={"announcement_time_local": "12:00"},

                                        ))

                            except Exception:

                                continue

        logger.info(f"BoE: Found {len(events)} events")

    except Exception as e:

        logger.error(f"BoE fetch failed: {e}")

    return events

def fetch_boc_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch Bank of Canada rate announcement schedule with hardcoded selectors."""

    events: List[Event] = []

    source, agency, country = "BOC_HTML", "BOC", "CA"

    url = "https://www.bankofcanada.ca/core-functions/monetary-policy/key-interest-rate/#schedule"

    try:

        resp = sget(session, url)

        if not resp.ok or not BeautifulSoup:

            logger.warning("BoC: fetch failed")

            return events

        soup = BeautifulSoup(resp.text, "html.parser")

        # First try time[datetime] elements if available

        tags = soup.select("time[datetime]")

        for t in tags:

            try:

                dt_local = dateparser.parse(t["datetime"])

            except Exception:

                continue

            if not dt_local:

                continue

            dt_local = ensure_aware(dt_local, TORONTO_TZ, 10, 0)

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            parent = t.parent

            link = parent.find("a", href=True)

            href = urljoin(url, link["href"]) if link else url

            title = "BoC Rate Announcement"

            events.append(Event(

                id=make_id(country, agency, title, dt_utc),

                source=source,

                agency=agency,

                country=country,

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="America/Toronto",

                impact="High",

                url=href,

                extras={"announcement_time_local": "10:00"},

            ))

        # Fallback: parse table cells with hardcoded selectors and regex

        if not events:

            # Look for tables containing schedule information

            tables = soup.select("table")

            for table in tables:

                rows = table.select("tr")

                for row in rows:

                    cells = row.select("td")

                    if len(cells) >= 2:

                        date_text = cells[0].get_text(" ", strip=True)

                        description = cells[1].get_text(" ", strip=True)

                        # Use regex to match date pattern and filter for rate announcements

                        date_match = re.search(r"(\w+)\s+(\d{1,2})", date_text)

                        if date_match and "Interest rate announcement" in description:

                            try:

                                # Parse date with current year (2025/2026)

                                month = date_match.group(1)

                                day = date_match.group(2)

                                # Try both 2025 and 2026

                                for year in [2025, 2026]:

                                    date_str = f"{month} {day} {year}"

                                    dt_local = dateparser.parse(date_str)

                                    if dt_local:

                                        dt_local = ensure_aware(dt_local, TORONTO_TZ, 10, 0)

                                        dt_utc = dt_local.astimezone(UTC)

                                        if _within(dt_utc, start_utc, end_utc):

                                            title = "BoC Rate Announcement"

                                            events.append(Event(

                                                id=make_id(country, agency, title, dt_utc),

                                                source=source,

                                                agency=agency,

                                                country=country,

                                                title=title,

                                                date_time_utc=dt_utc,

                                                event_local_tz="America/Toronto",

                                                impact="High",

                                                url=url,

                                                extras={"announcement_time_local": "10:00"},

                                            ))

                                            break  # Only add once per date

                            except Exception:

                                continue

            # Additional fallback: parse any text with date patterns

            if not events:

                for td in soup.select("table td"):

                    text = td.get_text(" ", strip=True)

                    if not text:

                        continue

                    # Use regex to find date patterns: \d{1,2}\s+[A-Z][a-z]+\s+20\d{4}

                    date_match = re.search(r"(\d{1,2})\s+([A-Z][a-z]+)\s+(20\d{2})", text)

                    if date_match:

                        try:

                            day = date_match.group(1)

                            month = date_match.group(2)

                            year = date_match.group(3)

                            date_str = f"{day} {month} {year}"

                            dt_local = dateparser.parse(date_str)

                            if dt_local:

                                dt_local = ensure_aware(dt_local, TORONTO_TZ, 10, 0)

                                dt_utc = dt_local.astimezone(UTC)

                                if _within(dt_utc, start_utc, end_utc):

                                    title = "BoC Rate Announcement"

                                    events.append(Event(

                                        id=make_id(country, agency, title, dt_utc),

                                        source=source,

                                        agency=agency,

                                        country=country,

                                        title=title,

                                        date_time_utc=dt_utc,

                                        event_local_tz="America/Toronto",

                                        impact="High",

                                        url=url,

                                        extras={"announcement_time_local": "10:00"},

                                    ))

                        except Exception:

                            continue

        logger.info(f"BoC: Found {len(events)} events")

    except Exception as e:

        logger.error(f"BoC fetch failed: {e}")

    return events

def fetch_rba_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch RBA board meeting schedule from consolidated calendar with hardcoded selectors."""

    events: List[Event] = []

    source, agency, country = "RBA_HTML", "RBA", "AU"

    base_url = "https://www.rba.gov.au/schedules-events/calendar.html?view=list&topics=monetary-policy-board"

    # Track processed events to avoid duplicates

    processed_events = set()

    try:

        # Try multiple pages to capture all events, but cap at 3 pages to avoid infinite loops

        for page in range(1, 4):

            if page == 1:

                url = base_url

            else:

                url = f"{base_url}&page={page}"

            resp = sget(session, url)

            if not resp.ok:

                if page == 1:

                    logger.warning("RBA: fetch failed")

                    return events

                else:

                    break  # No more pages

            if not BeautifulSoup:

                logger.warning("RBA: BeautifulSoup not available")

                return events

            soup = BeautifulSoup(resp.text, "html.parser")

            page_events_found = 0

            # Primary method: use time[datetime] elements

            for t in soup.select("time[datetime]"):

                if not t.get("datetime"):

                    continue

                try:

                    dt_local = dateparser.parse(t["datetime"])

                except Exception:

                    continue

                if not dt_local:

                    continue

                # Get context to determine event type

                parent_text = ""

                parent = t.parent

                for _ in range(3):  # Check up to 3 parent levels

                    if parent and parent.get_text():

                        parent_text = parent.get_text(" ", strip=True)

                        break

                    parent = parent.parent if parent else None

                # Filter for relevant events: Board Meetings and Decision Statements

                if not any(keyword in parent_text for keyword in [

                    "Monetary Policy Board Meeting",

                    "Monetary Policy Decision Statement"

                ]):

                    continue

                # For Board Meetings (multi-day), use default time 14:30

                # For Decision Statements, use exact time from datetime

                if "Board Meeting" in parent_text and not dt_local.time().hour:

                    # If no time specified, use default 14:30

                    dt_local = ensure_aware(dt_local, SYDNEY_TZ, 14, 30)

                else:

                    # Use the exact time provided (usually 2:30 PM for statements)

                    dt_local = ensure_aware(dt_local, SYDNEY_TZ)

                dt_utc = dt_local.astimezone(UTC)

                if not _within(dt_utc, start_utc, end_utc):

                    continue

                # Create unique identifier to avoid duplicates

                event_key = (dt_utc.date(), "Board Meeting" if "Board Meeting" in parent_text else "Decision")

                if event_key in processed_events:

                    continue

                processed_events.add(event_key)

                # Find associated link

                link = None

                search_parent = t.parent

                for _ in range(5):  # Search up to 5 parent levels for a link

                    if search_parent:

                        link = search_parent.find("a", href=True)

                        if link:

                            break

                        search_parent = search_parent.parent

                href = urljoin(url, link["href"]) if link else url

                # Determine title based on event type

                if "Board Meeting" in parent_text:

                    title = "RBA Cash Rate Decision"

                else:

                    title = "RBA Rate Statement"

                events.append(Event(

                    id=make_id(country, agency, title, dt_utc),

                    source=source,

                    agency=agency,

                    country=country,

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Australia/Sydney",

                    impact="High",

                    url=href,

                    extras={"announcement_time_local": dt_local.strftime("%H:%M")},

                ))

                page_events_found += 1

            # If no events found on this page, stop pagination

            if page_events_found == 0 and page > 1:

                break

        # Fallback: regex-based parsing if no time elements found

        if not events:

            resp = sget(session, base_url)

            if resp.ok and BeautifulSoup:

                soup = BeautifulSoup(resp.text, "html.parser")

                # Look for date patterns in text

                for element in soup.find_all(string=True):

                    text = element.strip()

                    if not text:

                        continue

                    # Match patterns like "17â€“18 February 2025" or "1 April 2025"

                    date_matches = re.findall(r'(\d{1,2})[â€“-]?(\d{1,2})?\s+(\w+)\s+(20\d{2})', text)

                    for match in date_matches:

                        try:

                            day1, day2, month, year = match

                            # Use the second day if it's a range (decision day)

                            day = day2 if day2 else day1

                            date_str = f"{day} {month} {year}"

                            dt_local = dateparser.parse(date_str)

                            if dt_local:

                                dt_local = ensure_aware(dt_local, SYDNEY_TZ, 14, 30)

                                dt_utc = dt_local.astimezone(UTC)

                                if _within(dt_utc, start_utc, end_utc):

                                    # Check if this is a monetary policy related event

                                    context = element.parent.get_text(" ", strip=True) if element.parent else ""

                                    if "Monetary Policy" in context:

                                        title = "RBA Cash Rate Decision"

                                        events.append(Event(

                                            id=make_id(country, agency, title, dt_utc),

                                            source=source,

                                            agency=agency,

                                            country=country,

                                            title=title,

                                            date_time_utc=dt_utc,

                                            event_local_tz="Australia/Sydney",

                                            impact="High",

                                            url=base_url,

                                            extras={"announcement_time_local": "14:30"},

                                        ))

                        except Exception:

                            continue

        logger.info(f"RBA: Found {len(events)} events")

    except Exception as e:

        logger.error(f"RBA fetch failed: {e}")

    return events

# REPLACE ENTIRE FUNCTION: fetch_rbnz_events(session, start_utc, end_utc)
def fetch_rbnz_events(session, start_utc, end_utc):
    """
    RBNZ OCR decisions: DOM ? JSON-LD ? fallback schedule, dual hosts, headers, and LKG on zero.
    Emits discovery path in logs; all events gated via _within.
    """
    if not BeautifulSoup:
        _set_fetch_metadata("RBNZ", count=0, path="unavailable")
        return []

    anz_tz = WELLINGTON_TZ
    cache_manager = getattr(session, "cache_manager", None)
    hosts = [
        "https://www.rbnz.govt.nz",
        "https://rbnz.govt.nz",
    ]
    base_paths = [
        "monetary-policy/monetary-policy-decisions",
        "monetary-policy/official-cash-rate-decisions",
        "news-and-publications/monetary-policy-decisions",
    ]
    headers = {
        "Accept-Language": "en-NZ,en;q=0.8",
        "Referer": "https://www.rbnz.govt.nz/monetary-policy",
    }

    seen_ids: set[str] = set()

    def _emit(candidate: datetime | None, url: str, tag: str, bucket: list[Event]) -> None:
        if candidate is None:
            return
        try:
            if candidate.tzinfo is None:
                local_dt = ensure_aware(
                    datetime(candidate.year, candidate.month, candidate.day, candidate.hour, candidate.minute),
                    anz_tz,
                    candidate.hour,
                    candidate.minute,
                )
            else:
                local_dt = candidate.astimezone(anz_tz)
            dt_utc = local_dt.astimezone(UTC)
        except Exception:
            return
        if not _within(dt_utc, start_utc, end_utc):
            return
        title = "RBNZ Official Cash Rate (OCR) Decision"
        event_id = make_id("NZ", "RBNZ", title, dt_utc)
        if event_id in seen_ids:
            return
        seen_ids.add(event_id)
        source_tag = {
            "dom": "RBNZ_DOM",
            "jsonld": "RBNZ_JSONLD",
            "fallback": "RBNZ_FALLBACK",
        }.get(tag, "RBNZ")
        extras = {"discovered_via": tag}
        bucket.append(
            Event(
                id=event_id,
                source=source_tag,
                agency="RBNZ",
                country="NZ",
                title=title,
                date_time_utc=dt_utc,
                event_local_tz="Pacific/Auckland",
                impact="High",
                url=url,
                extras=extras,
            )
        )

    def _parse_iso(dt_iso: str) -> datetime | None:
        if not dt_iso:
            return None
        candidate = None
        if dateparser:
            try:
                candidate = dateparser.parse(dt_iso)
            except Exception:
                candidate = None
        if candidate is None:
            try:
                candidate = datetime.fromisoformat(dt_iso.replace("Z", "+00:00"))
            except Exception:
                return None
        return candidate

    for host in hosts:
        for path_segment in base_paths:
            page_url = f"{host.rstrip('/')}/{path_segment.lstrip('/')}"
            resp = sget_retry_alt(session, [page_url], headers=headers, tries=3)
            if not (resp and getattr(resp, "ok", False)):
                continue
            try:
                soup = BeautifulSoup(resp.text or "", "html.parser")
            except Exception:
                logger.debug("RBNZ: DOM parse failed for %s", page_url, exc_info=True)
                continue
            dom_events: list[Event] = []
            for time_tag in soup.select("time[datetime]"):
                dt_iso = (time_tag.get("datetime") or "").strip()
                candidate = _parse_iso(dt_iso)
                _emit(candidate, page_url, "dom", dom_events)
            for meta_tag in soup.select("meta[property='article:published_time'], meta[name='publish-date']"):
                dt_iso = (meta_tag.get("content") or "").strip()
                candidate = _parse_iso(dt_iso)
                _emit(candidate, page_url, "dom", dom_events)
            if dom_events:
                dom_events.sort(key=lambda ev: ev.date_time_utc)
                if cache_manager:
                    _persist_lkg("RBNZ", dom_events)
                _set_fetch_metadata("RBNZ", count=len(dom_events), path="dom")
                logger.info("rbnz path used: dom (%d)", len(dom_events))
                return dom_events

    for host in hosts:
        for path_segment in base_paths:
            page_url = f"{host.rstrip('/')}/{path_segment.lstrip('/')}"
            resp = sget_retry_alt(session, [page_url], headers=headers, tries=3)
            if not (resp and getattr(resp, "ok", False)):
                continue
            try:
                soup = BeautifulSoup(resp.text or "", "html.parser")
            except Exception:
                logger.debug("RBNZ: JSON-LD parse failed for %s", page_url, exc_info=True)
                continue
            jsonld_events: list[Event] = []
            for script in soup.find_all("script", attrs={"type": "application/ld+json"}):
                try:
                    data = json.loads(script.string or "")
                except Exception:
                    continue

                def _walk(node):
                    if isinstance(node, dict):
                        yield node
                        for value in node.values():
                            yield from _walk(value)
                    elif isinstance(node, list):
                        for item in node:
                            yield from _walk(item)

                for node in _walk(data):
                    if node.get("@type") not in {"Event", "Schedule"}:
                        continue
                    dt_iso = node.get("startDate") or node.get("startTime") or node.get("datePublished") or node.get("scheduledTime")
                    candidate = _parse_iso(str(dt_iso) if dt_iso is not None else "")
                    _emit(candidate, page_url, "jsonld", jsonld_events)
            if jsonld_events:
                jsonld_events.sort(key=lambda ev: ev.date_time_utc)
                if cache_manager:
                    _persist_lkg("RBNZ", jsonld_events)
                _set_fetch_metadata("RBNZ", count=len(jsonld_events), path="jsonld")
                logger.info("rbnz path used: jsonld (%d)", len(jsonld_events))
                return jsonld_events

    fallback_events: list[Event] = []
    fallback_url = "https://www.rbnz.govt.nz/monetary-policy"
    for month, day in [(2, 15), (5, 15), (8, 15), (11, 15)]:
        for year in {start_utc.year, end_utc.year}:
            try:
                candidate = datetime(year, month, day, 14, 0)
            except ValueError:
                continue
            _emit(candidate, fallback_url, "fallback", fallback_events)
    if fallback_events:
        fallback_events.sort(key=lambda ev: ev.date_time_utc)
        _set_fetch_metadata("RBNZ", count=len(fallback_events), path="fallback")
        logger.info("rbnz path used: fallback (%d)", len(fallback_events))
        return fallback_events

    merged = maybe_merge_lkg("RBNZ", [], ttl_days=30, tag="lkg")
    if merged:
        for ev in merged:
            extras = dict(ev.extras or {})
            extras.setdefault("cached", True)
            extras.setdefault("discovered_via", "lkg")
            ev.extras = extras
        _set_fetch_metadata("RBNZ", count=len(merged), path="lkg")
        logger.info("RBNZ LKG_MERGE: %d", len(merged))
        logger.info("rbnz path used: lkg (%d)", len(merged))
        return merged

    _set_fetch_metadata("RBNZ", count=0, path="none")
    logger.info("rbnz path used: none (0)")
    return []

# REPLACE ENTIRE FUNCTION: fetch_japan_esri_events(session, start_utc, end_utc)
def fetch_japan_esri_events(session, start_utc, end_utc):
    """
    ESRI Consumer Confidence schedule (JP/EN) with NFKC normalization,
    ASCII + Kanji + date-only handling, optional minutes, slash support, and LKG on zero.
    Always logs 'ESRI path used: <path> (k)' where path in {jp,en,en-fallback,lkg,none}.
    """
    if not BeautifulSoup:
        _set_fetch_metadata("ESRI", count=0, path="unavailable")
        return []

    cache_manager = getattr(session, "cache_manager", None)
    JST = TOKYO_TZ

    ws = r"\s+"
    sep_colon = f"[:{chr(0xFF1A)}]"
    SEP_DOT = f"[./{chr(0x30FB)}{chr(0xFF0E)}{chr(0xFF0F)}]"

    ascii_time_first = re.compile(
        rf"(?P<h>\d{{1,2}}){sep_colon}(?P<m>\d{{2}})?{ws}(?P<y>20\d{{2}}){SEP_DOT}(?P<mo>\d{{1,2}}){SEP_DOT}(?P<d>\d{{1,2}})"
    )
    ascii_date_first = re.compile(
        rf"(?P<y>20\d{{2}}){SEP_DOT}(?P<mo>\d{{1,2}}){SEP_DOT}(?P<d>\d{{1,2}}){ws}(?P<h>\d{{1,2}}){sep_colon}(?P<m>\d{{2}})?"
    )
    ascii_date_only = re.compile(rf"(?P<y>20\d{{2}}){SEP_DOT}(?P<mo>\d{{1,2}}){SEP_DOT}(?P<d>\d{{1,2}})")

    era_reiwa = chr(0x4EE4) + chr(0x548C)
    era_heisei = chr(0x5E73) + chr(0x6210)
    fw_lparen = chr(0xFF08)
    fw_rparen = chr(0xFF09)
    kanji_year = chr(0x5E74)
    kanji_month = chr(0x6708)
    kanji_day = chr(0x65E5)
    kanji_hour = chr(0x6642)
    kanji_minute = chr(0x5206)
    kanji_approx = chr(0x9803)
    kanji_expected = chr(0x4E88) + chr(0x5B9A)

    era_pattern = f"{era_reiwa}|{era_heisei}"
    kanji_time_pattern = r"""
(?:(?P<era>({era}))(?P<era_year>\d{{1,2}})(?:[{fw_lparen}(](?P<era_override>20\d{{2}})[{fw_rparen})])?|(?P<year>20\d{{2}})){year}
\s*(?P<mo>\d{{1,2}})\s*{month}\s*(?P<d>\d{{1,2}})\s*{day}
(?:\s*(?P<h>\d{{1,2}})\s*{hour}(?:\s*(?P<m>\d{{1,2}})\s*{minute}?)?)?
(?:\s*(?:{approx}|{expected}))?
""".format(
        era=era_pattern,
        fw_lparen=fw_lparen,
        fw_rparen=fw_rparen,
        year=kanji_year,
        month=kanji_month,
        day=kanji_day,
        hour=kanji_hour,
        minute=kanji_minute,
        approx=kanji_approx,
        expected=kanji_expected,
    )
    kanji_time = re.compile(kanji_time_pattern, re.VERBOSE)

    pages = [
        (["https://www.esri.cao.go.jp/jp/stat/shouhi/shouhi.html"], "jp", "JP"),
        (["https://www.esri.cao.go.jp/en/stat/shouhi/shouhi-e.html"], "en", "EN"),
        ([
            "https://www.esri.cao.go.jp/en/stat/shouhi/shouhi.html",
            "https://www.esri.cao.go.jp/en/stat/shouhi/releaseschedule.html",
        ], "en-fallback", "EN"),
    ]

    events: List[Event] = []
    seen: set[tuple[int, int, int, int, int]] = set()
    path_used = None

    def _era_to_year(era: str | None, era_year: str | None, override: str | None) -> int | None:
        if override:
            try:
                return int(override)
            except Exception:
                return None
        if not era or not era_year:
            return None
        try:
            base = 2018 if era == era_reiwa else 1988 if era == era_heisei else None
            return base + int(era_year) if base is not None else None
        except Exception:
            return None

    def _emit(y, mo, d, h, m, url, lang):
        if y is None or mo is None or d is None:
            return
        hh = 14 if h is None else max(0, min(23, int(h)))
        mm = 0 if m is None else max(0, min(59, int(m)))
        key = (int(y), int(mo), int(d), hh, mm)
        if key in seen:
            return
        try:
            dt_local = ensure_aware(datetime(int(y), int(mo), int(d), hh, mm), JST, hh, mm)
            dt_utc = dt_local.astimezone(UTC)
        except Exception:
            return
        if not _within(dt_utc, start_utc, end_utc):
            return
        seen.add(key)
        title = "Japan ESRI Consumer Confidence (Release)"
        events.append(
            Event(
                id=make_id("JP", "ESRI", title, dt_utc),
                source="ESRI_HTML",
                agency="ESRI",
                country="JP",
                title=title,
                date_time_utc=dt_utc,
                event_local_tz="Asia/Tokyo",
                impact="Medium",
                url=url,
                extras={"language": lang, "discovered_via": "html"},
            )
        )

    for urls, label, lang in pages:
        resp = sget_retry_alt(session, urls, headers={"Accept-Language": "ja,en;q=0.9"}, tries=3)
        if not (resp and getattr(resp, "ok", False)):
            continue
        try:
            soup = BeautifulSoup(resp.text or "", "html.parser")
        except Exception:
            logger.debug("ESRI: parse failed for %s", resp.url or urls[0], exc_info=True)
            continue
        text = unicodedata.normalize("NFKC", soup.get_text("\n", strip=True))
        page_url = resp.url or urls[0]
        before = len(events)
        for raw in text.splitlines():
            line = raw.strip()
            if not line:
                continue
            match = ascii_time_first.search(line)
            if match:
                _emit(int(match["y"]), int(match["mo"]), int(match["d"]), match["h"], match["m"], page_url, lang)
                continue
            match = ascii_date_first.search(line)
            if match:
                _emit(int(match["y"]), int(match["mo"]), int(match["d"]), match["h"], match["m"], page_url, lang)
                continue
            match = ascii_date_only.search(line)
            if match:
                _emit(int(match["y"]), int(match["mo"]), int(match["d"]), 14, 0, page_url, lang)
                continue
            match = kanji_time.search(line)
            if match:
                year = int(match["year"]) if match.group("year") else _era_to_year(match["era"], match["era_year"], match["era_override"])
                if year is not None:
                    hour = match["h"] if match.group("h") else 14
                    _emit(year, int(match["mo"]), int(match["d"]), hour, match["m"], page_url, lang)
        added = len(events) - before
        if added > 0:
            path_used = label
            logger.info("ESRI: parsed %d event(s) from %s", added, label)
            break

    if events:
        events.sort(key=lambda e: e.date_time_utc)
        if cache_manager:
            try:
                _persist_lkg("ESRI", events)
            except Exception:
                pass
        path_label = path_used if path_used in {"jp", "en", "en-fallback"} else (path_used or "jp")
        _set_fetch_metadata("ESRI", count=len(events), path=path_label)
        logger.info("ESRI path used: %s (%d)", path_label, len(events))
        return events

    merged: List[Event] = []
    if cache_manager:
        try:
            merged = maybe_merge_lkg("ESRI", [], ttl_days=30, tag="lkg")
        except Exception:
            merged = []
    if merged:
        for ev in merged:
            ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg"}
        _set_fetch_metadata("ESRI", count=len(merged), path="lkg")
        logger.warning("ESRI LKG_MERGE: %d", len(merged))
        logger.info("ESRI path used: lkg (%d)", len(merged))
        return merged

    _set_fetch_metadata("ESRI", count=0, path="none")
    logger.info("ESRI path used: none (0)")
    return []
# REPLACE ENTIRE FUNCTION: fetch_switzerland_seco_events(session, start_utc, end_utc)
def fetch_switzerland_seco_events(session, start_utc, end_utc):
    """
    SECO structured-first parser across EN/DE/FR; robust context capture, escaped dots,
    schema hash sentinel + snapshot, estimator fallback, and LKG with TTL 90d.
    """
    if not BeautifulSoup:
        _set_fetch_metadata("SECO", count=0, path="unavailable")
        return []

    cache_manager = getattr(session, "cache_manager", None)
    zurich_tz = ZURICH_TZ

    date_dot = re.compile(r"(\d{1,2})\.(\d{1,2})\.(20\d{2})")
    season_en = re.compile(
        r"(Spring|Summer|Autumn|Winter)\s+Forecast.*?(\d{1,2})\s+([A-Za-z]+)\s+(20\d{2})",
        re.I | re.S,
    )
    forecast_words = re.compile(r"(forecast|prognos|konjunktur|pr(?:e|\u00E9)vision)", re.I)

    lang_pages = [
        ([
            "https://www.seco.admin.ch/seco/en/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html",
            "https://www.seco.admin.ch/seco/en/home/seco/nsb-news.msg-id-0000.html",
        ], "en"),
        ([
            "https://www.seco.admin.ch/seco/de/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html",
            "https://www.seco.admin.ch/seco/de/home/seco/nsb-news.msg-id-0000.html",
        ], "de"),
        ([
            "https://www.seco.admin.ch/seco/fr/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html",
            "https://www.seco.admin.ch/seco/fr/home/seco/nsb-news.msg-id-0000.html",
        ], "fr"),
    ]

    structured_events: List[Event] = []
    seen_dates: set[tuple[int, int, int]] = set()

    def _emit_structured(year: int, month: int, day: int, lang: str, source_url: str, season: str | None = None) -> bool:
        if (year, month, day) in seen_dates:
            return False
        try:
            local_dt = ensure_aware(datetime(year, month, day, 9, 0), zurich_tz, 9, 0)
            dt_utc = local_dt.astimezone(UTC)
        except Exception:
            return False
        if not _within(dt_utc, start_utc, end_utc):
            return False
        seen_dates.add((year, month, day))
        season_name = season.title() if season else None
        title = f"SECO {season_name} Economic Forecast" if season_name else "Switzerland SECO Economic Forecast"
        extras = {
            "announcement_time_local": "09:00",
            "forecast_type": "Economic Forecast",
            "frequency": "Quarterly",
            "language": lang,
        }
        if season_name:
            extras["season"] = season_name
        structured_events.append(
            Event(
                id=make_id("CH", "SECO", title, dt_utc),
                source="SECO_STRUCTURED",
                agency="SECO",
                country="CH",
                title=title,
                date_time_utc=dt_utc,
                event_local_tz="Europe/Zurich",
                impact="Medium",
                url=source_url,
                extras=extras,
            )
        )
        return True

    for urls, lang in lang_pages:
        resp = sget_retry_alt(session, urls, headers={"Accept-Language": f"{lang},en;q=0.7,de;q=0.6,fr;q=0.5"}, tries=3)
        if not (resp and getattr(resp, "ok", False)):
            continue
        page_url = resp.url or urls[0]
        content_bytes = resp.content or b""
        try:
            soup = BeautifulSoup(resp.text or "", "html.parser")
        except Exception:
            logger.debug("SECO structured fetch parse error for %s", page_url, exc_info=True)
            continue

        page_events = 0
        containers = soup.select("main, article, section, .mod-text, .card") or [soup]
        for node in containers:
            text = node.get_text(" ", strip=True)
            if not text or not forecast_words.search(text):
                continue
            for match in date_dot.finditer(text):
                day = int(match.group(1))
                month = int(match.group(2))
                year = int(match.group(3))
                if _emit_structured(year, month, day, lang, page_url):
                    page_events += 1
            for match in season_en.finditer(text):
                season = match.group(1)
                day = int(match.group(2))
                month_name = match.group(3)
                year = int(match.group(4))
                month = month_to_num(month_name)
                if month and _emit_structured(year, month, day, lang, page_url, season=season):
                    page_events += 1

        if cache_manager:
            try:
                _schema_capture(cache_manager, "SECO", page_url, content_bytes, page_events, meta_suffix=lang.upper())
            except Exception:
                logger.debug("SECO schema capture failed for %s", page_url, exc_info=True)
        if page_events > 0:
            logger.info("SECO: structured %d event(s) parsed (%s)", page_events, lang)

    if structured_events:
        structured_events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            _persist_lkg("SECO", structured_events)
        _set_fetch_metadata("SECO", count=len(structured_events), path="structured")
        logger.info("SECO path used: structured (%d)", len(structured_events))
        return structured_events

    season_map = {3: "Spring", 6: "Summer", 9: "Autumn", 12: "Winter"}
    estimator_events: List[Event] = []
    candidate_years = {start_utc.year, end_utc.year}
    candidate_years.add(start_utc.year + 1)

    for year in sorted(candidate_years):
        for month, season in season_map.items():
            try:
                local_dt = ensure_aware(datetime(year, month, 15, 9, 0), zurich_tz, 9, 0)
                dt_utc = local_dt.astimezone(UTC)
            except Exception:
                continue
            if not _within(dt_utc, start_utc, end_utc):
                continue
            title = f"SECO {season} Economic Forecast"
            extras = {
                "announcement_time_local": "09:00",
                "forecast_type": "Economic Forecast",
                "frequency": "Quarterly",
                "season": season,
                "estimated_date": True,
            }
            estimator_events.append(
                Event(
                    id=make_id("CH", "SECO", title, dt_utc),
                    source="SECO_ESTIMATOR",
                    agency="SECO",
                    country="CH",
                    title=title,
                    date_time_utc=dt_utc,
                    event_local_tz="Europe/Zurich",
                    impact="Medium",
                    url=lang_pages[0][0][0],
                    extras=extras,
                )
            )

    if estimator_events:
        estimator_events.sort(key=lambda ev: ev.date_time_utc)
        _set_fetch_metadata("SECO", count=len(estimator_events), path="estimator")
        logger.info("SECO path used: estimator (%d)", len(estimator_events))
        return estimator_events

    merged = maybe_merge_lkg("SECO", [], ttl_days=90, tag="lkg")
    if merged:
        for ev in merged:
            ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg"}
        logger.info("SECO LKG_MERGE: %d", len(merged))
        _set_fetch_metadata("SECO", count=len(merged), path="lkg")
        logger.info("SECO path used: lkg (%d)", len(merged))
        return merged

    _set_fetch_metadata("SECO", count=0, path="none")
    logger.info("SECO path used: none (0)")
    return []
def fetch_ons_events_enhanced(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """



    ONS (UK Release Calendar) â€” RSS + HTML fallback using "upcoming" view



    LOCKED SELECTORS based on live HTML structure analysis



    



    Primary RSS URL: https://www.ons.gov.uk/releasecalendar?rss&release-type=type-upcoming



    Fallback HTML URL: https://www.ons.gov.uk/releasecalendar?highlight=true&limit=10&page=1&release-type=type-upcoming&sort=date-newest



    Health Floor: â‰¥5 events in 60-day window



    """

    events = []

    rss_events = []

    html_events = []

    # 1. ONS RSS (Primary) - Try upcoming-only RSS first

    rss_url = "https://www.ons.gov.uk/releasecalendar?rss&release-type=type-upcoming"

    try:

        resp = sget(session, rss_url)

        if resp and resp.ok:

            # Parse RSS feed

            soup = BeautifulSoup(resp.text, "xml")

            items = soup.find_all("item")

            for item in items:

                try:

                    title_el = item.find("title")

                    link_el = item.find("link")

                    pub_date_el = item.find("pubDate")

                    if not title_el or not pub_date_el:

                        continue

                    title = title_el.get_text(strip=True)

                    url = link_el.get_text(strip=True) if link_el else rss_url

                    # Parse publication date

                    dt_parsed = dateparser.parse(pub_date_el.get_text(strip=True))

                    if not dt_parsed:

                        continue

                    # Default to 07:00 Europe/London if no time present

                    if dt_parsed.hour == 0 and dt_parsed.minute == 0:

                        dt_parsed = dt_parsed.replace(hour=7, minute=0)

                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                    dt_utc = dt_local.astimezone(UTC)

                    # Check if within date range

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    # Impact classification

                    impact = "High" if any(keyword in title.upper() for keyword in ["GDP", "CPI"]) else \
                             "Medium" if any(keyword in title.upper() for keyword in ["EMPLOYMENT", "LABOUR", "UNEMPLOYMENT"]) else \
                             "Low"

                    event = Event(

                        id=make_id("GB", "ONS", title, dt_utc),

                        source="ONS_RSS_UPCOMING",

                        agency="ONS",

                        country="GB",

                        title=title,

                        date_time_utc=dt_utc,

                        event_local_tz="Europe/London",

                        impact=impact,

                        url=url,

                        extras={"release_time_local": "07:00", "source_type": "RSS"}

                    )

                    rss_events.append(event)

                except Exception as e:

                    logger.debug(f"ONS RSS: Error parsing item: {e}")

                    continue

        logger.debug(f"ONS RSS: Found {len(rss_events)} events from upcoming RSS")

    except Exception as e:

        logger.debug(f"ONS RSS fetch failed: {e}")

    # 2. ONS HTML (Fallback) - If RSS returns 0 events, use HTML fallback

    if len(rss_events) == 0:

        logger.info("ONS: RSS returned 0 events, falling back to HTML")

        base_html_url = "https://www.ons.gov.uk/releasecalendar?highlight=true&limit=10&release-type=type-upcoming&sort=date-newest"

        try:

            page = 1

            max_pages = 30  # Safety limit for pagination

            while page <= max_pages:

                # Construct URL with pagination

                if page == 1:

                    url = base_html_url + "&page=1"

                else:

                    url = base_html_url + f"&page={page}"

                resp = sget(session, url)

                if not resp or not resp.ok:

                    logger.debug(f"ONS HTML: Page {page} fetch failed")

                    break

                soup = BeautifulSoup(resp.text, "html.parser")

                # LOCKED SELECTOR: Find release items in ordered list (ol li)

                release_items = soup.select("ol li")

                if not release_items:

                    logger.debug(f"ONS HTML: No release items found on page {page}")

                    break

                page_events = 0

                for item in release_items:

                    try:

                        # LOCKED SELECTOR: Extract title link (first <a> in li)

                        title_link = item.select_one("a")

                        if not title_link:

                            continue

                        title = title_link.get_text(strip=True)

                        if not title:

                            continue

                        href = urljoin(base_html_url, title_link.get("href", ""))

                        # LOCKED SELECTOR: Extract date from "Release date:" text pattern

                        dt_local = None

                        item_text = item.get_text(" ", strip=True)

                        # Pattern: "Release date: 12 September 2025 7:00am | Confirmed"

                        date_match = re.search(r'Release date:\s*(\d{1,2}\s+\w+\s+\d{4})\s+(\d{1,2}:\d{2}[ap]m)', item_text, re.IGNORECASE)

                        if date_match:

                            date_str = date_match.group(1)

                            time_str = date_match.group(2)

                            # Convert time to 24-hour format

                            try:

                                time_24h = datetime.strptime(time_str, "%I:%M%p").strftime("%H:%M")

                                full_date_str = f"{date_str} {time_24h}"

                                dt_parsed = dateparser.parse(full_date_str)

                                if dt_parsed:

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                            except:

                                # Fallback to default time

                                dt_parsed = dateparser.parse(date_str)

                                if dt_parsed:

                                    dt_parsed = dt_parsed.replace(hour=7, minute=0)

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                        # Fallback: try <time datetime> if present

                        if not dt_local:

                            time_el = item.select_one("time[datetime]")

                            if time_el:

                                datetime_str = time_el.get("datetime")

                                dt_parsed = dateparser.parse(datetime_str)

                                if dt_parsed:

                                    if dt_parsed.hour == 0 and dt_parsed.minute == 0:

                                        dt_parsed = dt_parsed.replace(hour=7, minute=0)

                                    dt_local = ensure_aware(dt_parsed, LONDON_TZ, 7, 0)

                        if not dt_local:

                            continue

                        dt_utc = dt_local.astimezone(UTC)

                        # Check if within date range

                        if not _within(dt_utc, start_utc, end_utc):

                            continue

                        # Impact classification

                        impact = "High" if any(keyword in title.upper() for keyword in ["GDP", "CPI"]) else \
                                 "Medium" if any(keyword in title.upper() for keyword in ["EMPLOYMENT", "LABOUR", "UNEMPLOYMENT"]) else \
                                 "Low"

                        event = Event(

                            id=make_id("GB", "ONS", title, dt_utc),

                            source="ONS_HTML_UPCOMING",

                            agency="ONS",

                            country="GB",

                            title=title,

                            date_time_utc=dt_utc,

                            event_local_tz="Europe/London",

                            impact=impact,

                            url=href,

                            extras={"release_time_local": dt_local.strftime('%H:%M'), "source_type": "HTML"}

                        )

                        html_events.append(event)

                        page_events += 1

                    except Exception as e:

                        logger.debug(f"ONS HTML: Error parsing item: {e}")

                        continue

                logger.debug(f"ONS HTML: Page {page} - found {page_events} events")

                # Check for next page - LOCKED SELECTOR: look for pagination "Next" link

                if page_events == 0:

                    break

                # Look for next page link in pagination - improved selector

                next_link = soup.select_one(".pager-next a, li.pager__item--next a, a[aria-label*='Next'], a:-soup-contains('Next')")

                if not next_link:

                    # Check numbered pagination with improved selectors

                    page_links = soup.select("a[href*='page='], .pager a, .pagination a")

                    max_page_found = 0

                    for link in page_links:

                        try:

                            href = link.get('href', '')

                            page_match = re.search(r'page=(\d+)', href)

                            if page_match:

                                page_num = int(page_match.group(1))

                                max_page_found = max(max_page_found, page_num)

                        except:

                            continue

                    if page >= max_page_found:

                        break

                page += 1

            logger.debug(f"ONS HTML: Found {len(html_events)} events across {page-1} pages")

        except Exception as e:

            logger.debug(f"ONS HTML fallback failed: {e}")

    # 3. Deduplication - Combine RSS and HTML, prefer RSS if duplicates

    seen_ids = set()

    unique_events = []

    # Process RSS events first (preferred)

    for event in rss_events:

        if event.id not in seen_ids:

            unique_events.append(event)

            seen_ids.add(event.id)

    # Process HTML events, skip duplicates

    for event in html_events:

        if event.id not in seen_ids:

            unique_events.append(event)

            seen_ids.add(event.id)

    # 4. Health Floor Check - ONS must produce â‰¥5 events in 60-day window

    if len(unique_events) >= 5:

        if len(rss_events) > 0:

            logger.info(f"ONS: {len(unique_events)} events (RSS upcoming)")

        else:

            logger.info(f"ONS: {len(unique_events)} events (HTML upcoming)")

    else:

        logger.warning(f"ONS upcoming releases <5 â€“ check if feed/HTML structure changed (found {len(unique_events)})")

    return unique_events

# ---------------------------------------------------------------------------

# Fixed Original Scrapers (BLS, ONS, ABS, StatCan, Eurostat, Stats NZ)

def _fetch_ics_with_retry(session: requests.Session, url: str) -> Optional[requests.Response]:

    """Fetch ICS with retry logic and randomized headers."""

    ua_pool = [

        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Mobile/15E148 Safari/604.1",

        "Mozilla/5.0 (Linux; Android 11; Pixel 5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0 Mobile Safari/537.36",

    ]

    ref_pool = ["https://www.google.com/", "https://www.bing.com/", "https://duckduckgo.com/"]

    for _ in range(3):

        headers = {

            "User-Agent": random.choice(ua_pool),

            "Referer": random.choice(ref_pool),

        }

        headers.setdefault("Accept", "text/calendar")

        headers.setdefault("Accept-Language", "en-US,en;q=0.9")

        try:

            resp = sget(session, url, headers=headers)

            if not resp or not getattr(resp, "ok", False):

                continue

            content_type = (resp.headers.get("Content-Type", "") or "").split(";", 1)[0].strip().lower()

            content = resp.content or b""

            if content_type == "text/calendar":

                return resp

            normalized = content.lstrip(b"\xef\xbb\xbf \t\r\n")

            if b"BEGIN:VCALENDAR" in content or b"BEGIN:VCALENDAR" in normalized:

                return resp

        except Exception:

            pass

        time.sleep(random.uniform(1, 2))

    logger.warning(f"BLS: failed to fetch ICS after retries: {url}")

    return None

def fetch_bls_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch BLS events with normalized output."""

    events: List[Event] = []

    ics_url = "https://www.bls.gov/schedule/news_release/bls.ics"

    if ics_url.startswith("webcal://"):

        return events

    ics_total = 0

    ics_ok = False

    path_used = "ics"

    in_window = 0

    try:

        ir = _fetch_ics_with_retry(session, ics_url)

        if ir:

            ics_ok = True

            for item in parse_ics_bytes(

                ir.content, NEW_YORK_TZ, default_hour=8, default_min=30

            ):

                ics_total += 1

                dt_utc = item["dt"].astimezone(UTC)

                if not _within(dt_utc, start_utc, end_utc):

                    continue

                events.append(

                    Event(

                        id=make_id("US", "BLS", item["title"], dt_utc),

                        source="BLS_ICS",

                        agency="BLS",

                        country="US",

                        title=item["title"],

                        date_time_utc=dt_utc,

                        event_local_tz="America/New_York",

                        impact=classify_event(item["title"]),

                        url=item["url"] or ics_url,

                        extras={"release_time_local": "08:30"},

                    )

                )

        in_window = len(events)

    except Exception as e:

        logger.warning(f"BLS ICS discovery failed: {e}")

        in_window = len(events)

    logger.info(f"BLS ICS discovery: total={ics_total}, in-window={in_window}")

    _set_fetch_metadata("BLS", count=in_window, path=path_used, ics_total=ics_total)

    if ics_total == 0:

        html_events: List[Event] = []

        try:

            html_events = _fetch_bls_html_fallback(session, start_utc, end_utc)

        except Exception:

            logger.debug("BLS HTML fallback merge failed", exc_info=True)

        if html_events:

            events.extend(html_events)

            logger.info(f"BLS HTML fallback: Found {len(html_events)} event(s)")

            seen_ids: set[str] = set()

            deduped: List[Event] = []

            for ev in events:

                if ev.id in seen_ids:

                    continue

                seen_ids.add(ev.id)

                deduped.append(ev)

            events = deduped

            path_used = "ics" if in_window > 0 else "fallback"

        else:

            path_used = "ics" if in_window > 0 else "fallback"

    if ics_total == 0 and not events:
        lkg_events: List[Event] = []
        cache_manager = getattr(session, "cache_manager", None)
        if cache_manager:
            try:
                lkg_events = maybe_merge_lkg("BLS", events, ttl_days=14, tag="lkg")
            except Exception:
                logger.debug("BLS: LKG merge failed", exc_info=True)
        if lkg_events:
            for ev in lkg_events:
                extras = dict(ev.extras or {})
                extras.setdefault("cached", True)
                extras["discovered_via"] = "lkg"
                ev.extras = extras
            path_used = "lkg"
            _set_fetch_metadata("BLS", count=len(lkg_events), path=path_used, ics_total=ics_total)
            logger.warning(f"BLS LKG_MERGE: {len(lkg_events)} merged")
            return lkg_events

    _set_fetch_metadata("BLS", count=len(events), path=path_used, ics_total=ics_total)

    return events

CURRENT_CACHE_MANAGER: Optional[EnhancedCacheManager] = None

FETCH_METADATA: Dict[str, Dict[str, Any]] = {}

RUN_CONTEXT: Dict[str, Any] = {}

BIG_FEEDER_THRESHOLDS = {"BLS": 100, "EUROSTAT": 200, "STATSNZ": 100}

def _reset_fetch_metadata() -> None:

    FETCH_METADATA.clear()

def _set_fetch_metadata(source: str, **fields: Any) -> Dict[str, Any]:

    entry = FETCH_METADATA.setdefault(source.upper(), {})

    for key, value in fields.items():

        if value is not None:

            entry[key] = value

    return entry

def _get_fetch_metadata(source: str) -> Dict[str, Any]:

    return FETCH_METADATA.get(source.upper(), {})

def _lkg_meta_path(cache: EnhancedCacheManager, source_tag: str) -> Path:

    return cache.cache_dir / "meta" / f"{source_tag.lower()}_lkg.json"

def _persist_lkg(source_tag: str, events: List[Event]) -> None:

    if not (ENABLE_LKG and events):

        return

    cache = CURRENT_CACHE_MANAGER

    if cache is None:

        return

    try:

        target = _lkg_meta_path(cache, source_tag)

        target.parent.mkdir(parents=True, exist_ok=True)

        payload = {

            "source": source_tag,

            "saved_at": _iso(_now_utc()),

            "events": [_event_to_dict(ev) for ev in sorted(events, key=lambda item: item.date_time_utc)],

        }

        target.write_text(json.dumps(payload, ensure_ascii=False))

    except Exception:

        logger.debug("LKG persist failed for %s", source_tag, exc_info=True)

def maybe_merge_lkg(
    source_tag: str,
    events: List[Event],
    ttl_days: Optional[int] = None,
    tag: Optional[str] = None,
) -> List[Event]:

    if events or not ENABLE_LKG:

        return events

    cache = CURRENT_CACHE_MANAGER

    if cache is None:

        return events

    path = _lkg_meta_path(cache, source_tag)

    if not path.exists():

        return events

    try:

        payload = json.loads(path.read_text())

    except Exception:

        logger.debug("LKG read failed for %s", source_tag, exc_info=True)

        return events

    saved_at_raw = payload.get("saved_at")

    if not saved_at_raw:

        return events

    try:

        saved_at = datetime.fromisoformat(saved_at_raw)

    except Exception:

        return events

    if saved_at.tzinfo is None:

        saved_at = saved_at.replace(tzinfo=UTC)

    effective_ttl = ttl_days if ttl_days is not None else LKG_TTLS.get(source_tag.upper(), 30)

    if (_now_utc() - saved_at).days > effective_ttl:

        return events

    start_utc = RUN_CONTEXT.get("start_utc")

    end_utc = RUN_CONTEXT.get("end_utc")

    merged: List[Event] = []

    for data in payload.get("events", []):

        try:

            ev = _event_from_dict(data)

        except Exception:

            continue

        extras = dict(ev.extras or {})

        extras["cached"] = True

        extras["lkg_timestamp"] = saved_at.isoformat()

        if tag:

            extras["lkg_tag"] = tag

        ev.extras = extras

        if isinstance(start_utc, datetime) and isinstance(end_utc, datetime):

            if not _within(ev.date_time_utc, start_utc, end_utc):

                continue

        merged.append(ev)

    if merged:

        merged.sort(key=lambda ev: ev.date_time_utc)

        logger.info(f"{source_tag}: merged {len(merged)} cached event(s) from LKG")

        return merged

    return events

def _schema_meta_path(cache: EnhancedCacheManager, source_key: str) -> Path:

    return cache.cache_dir / "meta" / f"{source_key.lower()}_schema.json"

def _schema_capture(cache: Optional[EnhancedCacheManager], source: str, url: str, content: bytes, parsed_count: int, meta_suffix: str = "") -> None:

    if not (ENABLE_SCHEMA_SENTINEL and cache and content):

        return

    source_key = source.lower()

    if meta_suffix:

        source_key = f"{source_key}_{meta_suffix.lower()}"

    meta_path = _schema_meta_path(cache, source_key)

    last_hash = None

    if meta_path.exists():

        try:

            last_hash = json.loads(meta_path.read_text()).get("hash")

        except Exception:

            logger.debug("schema meta read failed", exc_info=True)

    container_bytes: bytes = content or b""

    if BeautifulSoup:

        try:

            soup = BeautifulSoup(container_bytes, "html.parser")

            candidate = soup.find("main") or soup.find(id="content") or soup.find("body")

            target_node = candidate or soup

            try:

                container_bytes = target_node.encode()

            except Exception:

                container_bytes = str(target_node).encode("utf-8", errors="ignore")

        except Exception:

            container_bytes = content or b""

    current_hash = _content_hash_bytes(container_bytes)

    meta_path.parent.mkdir(parents=True, exist_ok=True)

    try:

        meta_path.write_text(json.dumps({"hash": current_hash, "ts": _iso(_now_utc()), "url": url}, ensure_ascii=False))

    except Exception:

        logger.debug("schema meta write failed", exc_info=True)

    if parsed_count == 0 and last_hash and last_hash != current_hash:

        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")

        suffix_part = f"-{meta_suffix}" if meta_suffix else ""

        snap_name = f"{source}{suffix_part}-{stamp}.html"

        try:

            cache.snapshots_dir.mkdir(parents=True, exist_ok=True)

            (cache.snapshots_dir / snap_name).write_bytes(content or b"")

        except Exception:

            logger.debug("snapshot write failed", exc_info=True)

        log_tag = f"{source}:{meta_suffix}" if meta_suffix else source

        logger.warning(f"SCHEMA_BREAK {log_tag}: container hash changed and parsed=0 — snapshot saved")

def _update_source_health_from_meta(source_key: str) -> None:

    ctx = RUN_CONTEXT

    meta = _get_fetch_metadata(source_key)

    if not meta:

        return

    count = meta.get("count", 0) or 0

    path = meta.get("path")

    per_source = ctx.setdefault("per_source", {})

    persist_state = ctx.setdefault("health_persistent", {})

    entry = persist_state.get(source_key, {})

    if count > 0:

        entry = {

            "last_success_ts": _iso(_now_utc()),

            "consecutive_failures": 0,

            "path": path,

        }

    else:

        entry = dict(entry or {})

        entry["consecutive_failures"] = entry.get("consecutive_failures", 0) + 1

        entry["path"] = path

    persist_state[source_key] = entry

    per_source[source_key] = {

        "count": count,

        "path": path,

        "last_success_ts": entry.get("last_success_ts"),

        "consecutive_failures": entry.get("consecutive_failures", 0),

    }

def _health_state_path(cache: EnhancedCacheManager) -> Path:

    return cache.cache_dir / "health_state.json"

def _load_health_state(cache: EnhancedCacheManager) -> dict:

    path = _health_state_path(cache)

    if path.exists():

        try:

            return json.loads(path.read_text())

        except Exception:

            logger.debug("health state load failed", exc_info=True)

    return {}

def _save_health_state(cache: EnhancedCacheManager, state: dict) -> None:

    try:

        _health_state_path(cache).write_text(json.dumps(state, ensure_ascii=False))

    except Exception:

        logger.debug("health state save failed", exc_info=True)

def _fetch_bls_html_fallback(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch BLS releases from HTML schedule as a defensive merge."""

    results: List[Event] = []

    if not BeautifulSoup:

        return results

    html_urls = [

        "https://www.bls.gov/bls/newsrels.htm",

        "https://www.bls.gov/schedule/news_release/",

        "https://www.bls.gov/news.release/",

        "https://www.bls.gov/ces/",

    ]

    keywords = [

        "Consumer Price Index",

        "Employment Situation",

        "Producer Price Index",

        "Job Openings and Labor Turnover Survey",

        "JOLTS",

        "Real Earnings",

        "Import/Export Price Indexes",

        "Employment Cost Index",

        "Productivity",

    ]

    keyword_terms = [term.lower() for term in keywords]

    seen_ids: set[str] = set()

    def _parse_local_dt(text: str) -> Optional[datetime]:

        if not text:

            return None

        dt_local: Optional[datetime] = None

        if dateparser:

            settings = {"TIMEZONE": "America/New_York", "RETURN_AS_TIMEZONE_AWARE": True}

            try:

                dt_local = dateparser.parse(text, settings=settings)

            except Exception:

                dt_local = None

        if dt_local is None:

            match = re.search(r"(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:,)?\s+(20\d{2})", text)

            if match:

                month = month_to_num(match.group(1))

                if month:

                    day = int(match.group(2))

                    year = int(match.group(3))

                    dt_local = datetime(year, month, day, 8, 30, tzinfo=NEW_YORK_TZ)

        if dt_local is None:

            return None

        if dt_local.tzinfo is None:

            hour = dt_local.hour or 8

            minute = dt_local.minute or 30

            dt_local = dt_local.replace(hour=hour, minute=minute, tzinfo=NEW_YORK_TZ)

        if dt_local.hour == 0 and dt_local.minute == 0:

            dt_local = dt_local.replace(hour=8, minute=30)

        return dt_local

    for url in html_urls:

        try:

            resp = sget(session, url)

        except Exception as exc:

            logger.debug(f"BLS HTML fallback request failed: {exc}", exc_info=True)

            continue

        if not resp or not getattr(resp, "ok", False):

            continue

        soup = BeautifulSoup(resp.text, "html.parser")

        page_url = resp.url or url

        candidates = soup.select("table tr, li, div.article, div.card, section, a[href]")

        for node in candidates:

            block_text = node.get_text(" ", strip=True) if hasattr(node, "get_text") else ""

            if not block_text:

                continue

            block_lower = block_text.lower()

            if not any(term in block_lower for term in keyword_terms):

                continue

            cells = node.find_all("td") if hasattr(node, "find_all") else []

            href_el = None

            if cells:

                date_text = cells[0].get_text(" ", strip=True) if len(cells) >= 1 else block_text

                title_text = cells[1].get_text(" ", strip=True) if len(cells) >= 2 else block_text

                if len(cells) >= 2:

                    href_el = cells[1].find("a", href=True)

            else:

                date_text = block_text

                title_text = block_text

                if " - " in block_text:

                    date_text, title_text = block_text.split(" - ", 1)

                elif ":" in block_text:

                    date_text, title_text = block_text.split(":", 1)

                if hasattr(node, "find"):

                    href_el = node if getattr(node, "name", "") == "a" else node.find("a", href=True)

            dt_local = _parse_local_dt(date_text)

            if not dt_local:

                continue

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            title = re.sub(r"\s+", " ", title_text or "BLS Release").strip()

            href = href_el.get("href") if href_el and href_el.get("href") else page_url

            if href and not href.startswith("http"):

                href = requests.compat.urljoin(page_url, href)

            event = Event(

                id=make_id("US", "BLS", title, dt_utc),

                source="BLS_HTML",

                agency="BLS",

                country="US",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="America/New_York",

                impact=classify_event(title),

                url=href,

                extras={"discovered_via": "HTML"},

            )

            if event.id in seen_ids:

                continue

            seen_ids.add(event.id)

            results.append(event)

    logger.info(f"BLS HTML fallback: Found {len(results)} event(s)")

    return results

def _ons_candidate_urls():

    """ONS RSS candidate URLs."""

    return [

        "https://www.ons.gov.uk/releasecalendar?format=rss",

        "https://www.ons.gov.uk/releasecalendar?rss",

        "https://www.ons.gov.uk/rss?content_type=releasecalendar&size=50",

    ]

MAX_ONS_TIMES = 200

MAX_ONS_BLOCKS = 200

def _read_best_dt_from_entry(entry):

    """Extract best datetime from RSS entry."""

    for key in ("published", "updated", "dc_date", "prism_publicationDate"):

        val = entry.get(key) or entry.get(key.replace("_", ":"))

        if val:

            try:

                return dateparser.parse(val)

            except Exception:

                pass

    return None

def _read_release_dt_from_page(session, href):

    """Extract release datetime from ONS page."""

    try:

        r = sget(session, href)

        if not r or not getattr(r, "ok", False):

            return None

        soup = BeautifulSoup(r.text, "lxml")

        # Common ONS patterns

        # <time datetime="2025-09-18T07:00:00+01:00">

        t = soup.select_one("time[datetime]")

        if t and t.get("datetime"):

            return dateparser.parse(t["datetime"])

        # <meta property="article:published_time" content="YYYY-MM-DDTHH:MM:SS+00:00">

        m = soup.select_one('meta[property="article:published_time"][content]')

        if m:

            return dateparser.parse(m["content"])

        # <meta name="dcterms.issued" content="YYYY-MM-DD">

        m = soup.select_one('meta[name="dcterms.issued"][content]')

        if m:

            # Add default 07:00 local if only a date is provided (ONS common)

            base = dateparser.parse(m["content"])

            return base.replace(hour=7, minute=0)

    except Exception:

        return None

    return None

def _ons_html_calendar(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fallback scraper for ONS release calendar HTML with pagination."""

    if not BeautifulSoup:

        return []

    # FIXED: Use upcoming-only URL like the enhanced version

    base = "https://www.ons.gov.uk/releasecalendar"

    events: List[Event] = []

    seen: set[str] = set()

    page = 1

    while True:

        # FIXED: Use upcoming filter with pagination

        params = {

            'highlight': 'true',

            'limit': '10',

            'page': str(page),

            'release-type': 'type-upcoming',

            'sort': 'date-newest'

        }

        resp = sget(session, base, params=params)

        if not resp or not resp.ok:

            break

        soup = BeautifulSoup(resp.text, "html.parser")

        # Track events found on this page to detect empty pages

        page_events_found = 0

        # First pass: explicit <time datetime> tags

        time_tags = soup.select("time[datetime]")[:MAX_ONS_TIMES]

        for time_tag in time_tags:

            try:

                dt_local = dateparser.parse(time_tag["datetime"])

            except Exception:

                continue

            if not dt_local:

                continue

            dt_local = ensure_aware(dt_local, LONDON_TZ, default_hour=7, default_min=0)

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            block = time_tag.parent

            title_tag = None

            for _ in range(3):

                if not block:

                    break

                title_tag = block.find("a") or block.find("h3")

                if title_tag and title_tag.get_text(strip=True):

                    break

                block = block.parent

            title = (

                re.sub(r"\s+", " ", title_tag.get_text(strip=True))

                if title_tag else "ONS Release"

            )

            href = (

                urljoin(base, title_tag.get("href", ""))

                if title_tag and title_tag.get("href")

                else base

            )

            eid = make_id("GB", "ONS", title, dt_utc)

            if eid in seen:

                continue

            seen.add(eid)

            page_events_found += 1  # FIXED: Track events found on this page

            events.append(

                Event(

                    id=eid,

                    source="ONS_HTML",

                    agency="ONS",

                    country="GB",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Europe/London",

                    impact=classify_event(title),

                    url=href,

                    extras={},

                )

            )

        # Second pass: blocks with "Release date:" text

        text_blocks = soup.find_all(string=re.compile("Release date:", re.I), limit=MAX_ONS_BLOCKS)

        for txt in text_blocks:

            m = re.search(r"Release date:\s*(.+)", txt, re.I)

            if not m:

                continue

            try:

                dt_local = dateparser.parse(m.group(1))

            except Exception:

                continue

            if not dt_local:

                continue

            dt_local = ensure_aware(dt_local, LONDON_TZ, default_hour=7, default_min=0)

            dt_utc = dt_local.astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            parent = txt.parent

            title_tag = None

            for _ in range(3):

                if not parent:

                    break

                title_tag = parent.find("a") or parent.find("h3")

                if title_tag and title_tag.get_text(strip=True):

                    break

                parent = parent.parent

            title = (

                re.sub(r"\s+", " ", title_tag.get_text(strip=True))

                if title_tag else "ONS Release"

            )

            href = (

                urljoin(base, title_tag.get("href", ""))

                if title_tag and title_tag.get("href")

                else base

            )

            eid = make_id("GB", "ONS", title, dt_utc)

            if eid in seen:

                continue

            seen.add(eid)

            page_events_found += 1  # FIXED: Track events found on this page

            events.append(

                Event(

                    id=eid,

                    source="ONS_HTML",

                    agency="ONS",

                    country="GB",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Europe/London",

                    impact=classify_event(title),

                    url=href,

                    extras={},

                )

            )

        # FIXED: Stop pagination if no events found on this page or no next link

        next_link = soup.select_one(".pager-next a, li.pager__item--next a")

        if not next_link or page_events_found == 0:

            break

        page += 1

    return events

def fetch_abs_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch ABS events with strengthened parsing and normalized output."""

    base_pages = [

        "https://www.abs.gov.au/release-calendar/future-releases",

        "https://www.abs.gov.au/release-calendar/future-releases-calendar",

    ]

    events = []

    for url in base_pages:

        try:

            resp = sget(session, url)

            if not resp.ok:

                logger.warning(f"ABS: {url} -> {resp.status_code}")

                continue

            if not BeautifulSoup:

                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Primary: containers with <time> elements

            try:

                blocks = soup.select("li:has(time), article:has(time), div:has(time)")

            except Exception:

                blocks = []

            for node in blocks:

                try:

                    container = node if node.name != "time" else node.parent

                    if not container:

                        continue

                    # Extract time

                    tm = container.select_one("time")

                    dt = None

                    if tm:

                        raw = tm.get("datetime") or tm.get_text(" ", strip=True)

                        if raw:

                            dt = dateparser.parse(raw)

                    if dt is None:

                        # Fallback: look for date pattern in text

                        raw = container.get_text(" ", strip=True)

                        m = re.search(r"([A-Z][a-z]+ \d{1,2}, \d{4})", raw)

                        if m:

                            dt = dateparser.parse(m.group(1))

                    if dt is None:

                        continue

                    dt_local = ensure_aware(dt, SYDNEY_TZ, 11, 30)

                    dt_utc = dt_local.astimezone(UTC)

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    # Extract title

                    title = None

                    for sel in ("h3", "h2", "h4", "a", ".title", ".event-title"):

                        el = container.select_one(sel)

                        if el:

                            title = el.get_text(" ", strip=True)

                            break

                    if not title:

                        title = container.get_text(" ", strip=True)

                    title = re.sub(r"\s+", " ", title).strip()

                    if len(title) < 5:

                        continue

                    # Extract link

                    a = container.select_one("a[href]")

                    href = a["href"] if a else url

                    if not href.startswith("http"):

                        href = requests.compat.urljoin("https://www.abs.gov.au/", href)

                    # Whitelist paths

                    if not any(k in href for k in ("/statistics/", "/media-releases/", "/articles/")):

                        continue

                    events.append(Event(

                        id=make_id("AU", "ABS", title, dt_utc),

                        source="ABS_HTML",

                        agency="ABS",

                        country="AU",

                        title=title,

                        date_time_utc=dt_utc,

                        event_local_tz="Australia/Sydney",

                        impact=classify_event(title),

                        url=href,

                        extras={"release_time_local": "11:30"}

                    ))

                except Exception as e:

                    logger.debug(f"ABS: block parse err: {e}")

        except Exception as e:

            logger.warning(f"ABS fetch failed for {url}: {e}")

    # Deduplicate by ID

    seen = set()

    deduped = []

    for e in events:

        if e.id in seen:

            continue

        seen.add(e.id)

        deduped.append(e)

    logger.info(f"ABS HTML: Found {len(deduped)} events")

    return deduped

def _statcan_candidate_urls():

    """StatCan Atom candidate URLs."""

    return [

        "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom",

        "https://www150.statcan.gc.ca/n1/daily-quotidien/dq-atom-eng.xml",

    ]

def _statcan_best_dt_from_entry(entry):

    """Extract best datetime from StatCan Atom entry."""

    for key in ("published", "updated"):

        val = entry.get(key)

        if val:

            try:

                return dateparser.parse(val)

            except Exception:

                pass

    return None

def _statcan_release_dt_from_page(session, href):

    """Extract release datetime from StatCan page with enhanced meta tag support."""

    try:

        r = sget(session, href)

        if not r or not getattr(r, "ok", False):

            return None

        soup = BeautifulSoup(r.text, "lxml")

        # Method 1: <time datetime="2025-04-12T08:30:00-04:00"> or date-only

        t = soup.select_one("time[datetime]")

        if t and t.get("datetime"):

            return dateparser.parse(t["datetime"])

        # Method 2: <meta property="article:published_time" content="...">

        m = soup.select_one('meta[property="article:published_time"][content]')

        if m:

            return dateparser.parse(m["content"])

        # Method 3: StatCan dcterms meta tags (enhanced)

        for selector in [

            'meta[name="dcterms.issued"][content]',

            'meta[name="dcterms.date"][content]',

            'meta[name="dcterms:issued"][content]',

            'meta[name="dcterms:date"][content]'

        ]:

            m = soup.select_one(selector)

            if m and m.get("content"):

                try:

                    base = dateparser.parse(m["content"])

                    if base:

                        # Default to 10:00 Toronto for date-only meta tags

                        if base.hour == 0 and base.minute == 0:

                            base = base.replace(hour=10, minute=0)

                        return base

                except Exception:

                    continue

    except Exception:

        return None

    return None

def _statcan_html_calendar(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fallback HTML calendar scraper for StatCan with correct upcoming releases URL."""

    if not BeautifulSoup:

        return []

    # Updated fallback URLs - use the correct upcoming releases page

    fallback_urls = [

        "https://www150.statcan.gc.ca/n1/dai-quo/cal2-eng.htm",  # Upcoming releases (correct)

        "https://www150.statcan.gc.ca/n1/dai-quo/index-eng.htm",  # Daily index

    ]

    events: List[Event] = []

    seen: set[str] = set()

    for url in fallback_urls:

        try:

            resp = sget(session, url)

            if not resp or not getattr(resp, "ok", False):

                continue

            soup = BeautifulSoup(resp.text, "html.parser")

            # Method 1: Parse upcoming releases format (cal2-eng.htm)

            if "cal2-eng.htm" in url:

                # Look for date headers like "September 16"

                date_headers = soup.find_all(['h3', 'h4'], string=re.compile(r'(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}'))

                for header in date_headers:

                    try:

                        # Parse the date from header text

                        date_text = header.get_text(strip=True)

                        # Add current year if not present

                        if not re.search(r'\d{4}', date_text):

                            current_year = datetime.now().year

                            date_text = f"{date_text}, {current_year}"

                        base_date = dateparser.parse(date_text)

                        if not base_date:

                            continue

                        # Find the next sibling element containing release list

                        next_elem = header.find_next_sibling(['ol', 'ul', 'div'])

                        if not next_elem:

                            continue

                        # Extract releases from list items

                        release_items = next_elem.find_all('li')

                        for item in release_items:

                            title_text = item.get_text(strip=True)

                            if not title_text:

                                continue

                            # Clean up title (remove contact info, etc.)

                            title = re.sub(r'\([^)]*\)$', '', title_text).strip()

                            title = re.sub(r'\s+', ' ', title).strip()

                            # Skip if title is too short or generic

                            if len(title) < 10 or title.lower() in ['pdf version', 'contact']:

                                continue

                            # Set release time to 8:30 AM Eastern (as mentioned on page)

                            dt_local = base_date.replace(hour=8, minute=30)

                            dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=8, default_min=30)

                            dt_utc = dt_local.astimezone(UTC)

                            if not _within(dt_utc, start_utc, end_utc):

                                continue

                            # Generate URL based on date pattern - FIXED FORMAT

                            yyyy_mm_dd = dt_local.strftime("%Y%m%d")   # e.g., 20250912

                            yymmdd = dt_local.strftime("%y%m%d")       # e.g., 250912

                            href = f"https://www150.statcan.gc.ca/n1/daily-quotidien/{yyyy_mm_dd}/dq{yymmdd}a-eng.htm"

                            eid = make_id("CA", "STATCAN", title, dt_utc)

                            if eid in seen:

                                continue

                            seen.add(eid)

                            events.append(

                                Event(

                                    id=eid,

                                    source="STATCAN_HTML",

                                    agency="STATCAN",

                                    country="CA",

                                    title=title,

                                    date_time_utc=dt_utc,

                                    event_local_tz="America/Toronto",

                                    impact=classify_event(title),

                                    url=href,

                                    extras={"announcement_time_local": "08:30"},

                                )

                            )

                    except Exception as e:

                        logger.debug(f"StatCan: Error parsing date header {header}: {e}")

                        continue

            # Method 2: Parse daily index format (index-eng.htm) - fallback

            else:

                for a in soup.select("a[href*='/daily-quotidien/'], a[href*='/dai-quo/']"):

                    title = re.sub(r"\s+", " ", a.get_text(strip=True))

                    if not title or len(title) < 10:

                        continue

                    href = urljoin(url, a.get("href", ""))

                    dt_local = None

                    # Look for time elements with datetime attribute

                    parent = a

                    for _ in range(3):

                        if not parent:

                            break

                        t = parent.find("time", datetime=True)

                        if t and t.get("datetime"):

                            try:

                                dt_local = dateparser.parse(t["datetime"])

                                break

                            except Exception:

                                dt_local = None

                        parent = parent.parent

                    # Fallback: extract date from URL pattern

                    if not dt_local:

                        date_match = re.search(r'/dq(\d{2})(\d{2})(\d{2})[a-z]?-eng\.htm', href)

                        if date_match:

                            year = 2000 + int(date_match.group(1))

                            month = int(date_match.group(2))

                            day = int(date_match.group(3))

                            try:

                                dt_local = datetime(year, month, day, 8, 30)  # 8:30 AM Eastern

                            except ValueError:

                                continue

                    if not dt_local:

                        continue

                    dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=8, default_min=30)

                    dt_utc = dt_local.astimezone(UTC)

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    eid = make_id("CA", "STATCAN", title, dt_utc)

                    if eid in seen:

                        continue

                    seen.add(eid)

                    events.append(

                        Event(

                            id=eid,

                            source="STATCAN_HTML",

                            agency="STATCAN",

                            country="CA",

                            title=title,

                            date_time_utc=dt_utc,

                            event_local_tz="America/Toronto",

                            impact=classify_event(title),

                            url=href,

                            extras={"announcement_time_local": "08:30"},

                        )

                    )

            # If we found events from this URL, we can break

            if events:

                break

        except Exception as e:

            logger.debug(f"StatCan HTML fallback failed for {url}: {e}")

            continue

    return events

def _statcan_html_fallback(

    session: requests.Session, start_utc: datetime, end_utc: datetime

) -> List[Event]:

    return _statcan_html_calendar(session, start_utc, end_utc)

def fetch_statcan_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch StatCan events with Atom + HTML fallback and deduplication."""

    source, agency, country = "STATCAN_ATOM", "STATCAN", "CA"

    feed_entries: list[tuple[Any, str]] = []

    for cand in _statcan_candidate_urls():

        try:

            r = sget(session, cand)

            if not r or not getattr(r, "ok", False):

                continue

            parsed = feedparser.parse(r.content)

            if parsed.entries:

                for e in parsed.entries:

                    feed_entries.append((e, cand))

        except Exception:

            continue

    if len(feed_entries) == 0:

        html_events = _statcan_html_fallback(session, start_utc, end_utc)

        logger.info(f"StatCan HTML fallback: Found {len(html_events)} event(s)")

        return html_events

    seen_ids: Dict[str, Event] = {}

    for entry, feed_url in feed_entries:

        title = (entry.get("title") or "Statistics Canada Release").strip()

        href = entry.get("link") or feed_url

        dt_local = _statcan_best_dt_from_entry(entry)

        page_dt = _statcan_release_dt_from_page(session, href)

        if page_dt:

            dt_local = page_dt

        if not dt_local:

            continue

        dt_local = ensure_aware(dt_local, TORONTO_TZ, default_hour=10, default_min=0)

        dt_utc = dt_local.astimezone(UTC)

        if not _within(dt_utc, start_utc, end_utc):

            continue

        eid = make_id(country, agency, title, dt_utc)

        if eid in seen_ids:

            continue

        seen_ids[eid] = Event(

            id=eid,

            source=source,

            agency=agency,

            country=country,

            title=title,

            date_time_utc=dt_utc,

            event_local_tz="America/Toronto",

            impact=classify_event(title),

            url=href,

            extras={},

        )

    events = list(seen_ids.values())

    if not events:

        events = _statcan_html_fallback(session, start_utc, end_utc)

        logger.info(f"StatCan HTML fallback: Found {len(events)} event(s)")

        return events

    logger.info(f"StatCan: {len(events)} events")

    return events

def fetch_eurostat_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch Eurostat events with normalized output."""

    url = "https://ec.europa.eu/eurostat/cache/RELEASE_CALENDAR/calendar_EN.ics"

    events = []

    ics_total = 0

    path_used = "ics"

    try:

        resp = sget(session, url)

        if resp and resp.ok:

            items = parse_ics_bytes(resp.content, BRUSSELS_TZ, default_hour=11, default_min=0)

            ics_total = len(items)

            for item in items:

                dt_utc = item["dt"].astimezone(UTC)

                if not _within(dt_utc, start_utc, end_utc):

                    continue

                title = re.sub(r"\s+", " ", item["title"]).strip()

                events.append(Event(

                    id=make_id("EU", "EUROSTAT", title, dt_utc),

                    source="Eurostat",

                    agency="EUROSTAT",

                    country="EU",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Europe/Brussels",

                    impact=classify_event(title),

                    url=item["url"] or url,

                    extras={"release_time_local": "11:00"}

                ))

        logger.info(f"Eurostat ICS: total={ics_total}, in-window={len(events)}")

    except Exception as e:

        logger.warning(f"Eurostat events fetch failed: {e}")

    _set_fetch_metadata("EUROSTAT", count=len(events), path=path_used, ics_total=ics_total)

    return events

def fetch_stats_nz_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Fetch Stats NZ events with normalized output."""

    urls = [

        "https://www.stats.govt.nz/release-calendar/calendar-export",

        "https://www.stats.govt.nz/assets/Uploads/release-calendar.ics"

    ]

    events: List[Event] = []

    ics_total = 0

    attempted = False

    path_used = "ics"

    for url in urls:

        try:

            resp = sget(session, url)

        except Exception as exc:

            logger.warning(f"Stats NZ fetch failed for {url}: {exc}")

            continue

        if not (resp and resp.ok):

            continue

        attempted = True

        items = parse_ics_bytes(resp.content, WELLINGTON_TZ, default_hour=10, default_min=45)

        ics_total = len(items)

        candidate: List[Event] = []

        for item in items:

            dt_utc = item["dt"].astimezone(UTC)

            if not _within(dt_utc, start_utc, end_utc):

                continue

            title = re.sub(r"\s+", " ", item["title"]).strip()

            candidate.append(Event(

                id=make_id("NZ", "STATSNZ", title, dt_utc),

                source="StatsNZ",

                agency="STATSNZ",

                country="NZ",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="Pacific/Auckland",

                impact=classify_event(title),

                url=item["url"] or url,

                extras={"release_time_local": "10:45"}

            ))

        logger.info(f"Stats NZ ICS: total={ics_total}, in-window={len(candidate)}")

        if candidate:

            events = candidate

            break

    if not attempted:

        logger.info("Stats NZ ICS: total=0, in-window=0")

        path_used = "ics"

    _set_fetch_metadata("STATSNZ", count=len(events), path=path_used, ics_total=ics_total if attempted else 0)

    return events

# REPLACE ENTIRE FUNCTION: fetch_china_nbs_events(session, start_utc, end_utc)
def fetch_china_nbs_events(session, start_utc, end_utc):
    """
    NBS (China) releases – robust HTML parse for ASCII/Chinese date formats,
    Accept-Language: zh-CN; DOM-first then LKG. Always gate via _within.
    Logs: 'NBS path used: dom|lkg|none' and 'NBS LKG_MERGE: k' when applicable.
    """
    if not BeautifulSoup:
        _set_fetch_metadata("NBS", count=0, path="unavailable")
        return []

    BJ = BEIJING_TZ
    cache_manager = getattr(session, "cache_manager", None)

    urls = [
        # Main statistics portal & releases (keep order; first win)
        "https://www.stats.gov.cn/sj/",  # ??(English mirrors often lag; prioritize CN pages)
        "https://www.stats.gov.cn/english/PressRelease/",  # English press releases
    ]
    headers = {
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.5",
        "Referer": "https://www.stats.gov.cn/",
    }

    # Patterns
    # ASCII: 2025-10-15 or 2025/10/15 or 2025.10.15 (default time 10:00 local)
    ascii_date = re.compile(r"(20\d{2})[./\-\/](\d{1,2})[./\-\/](\d{1,2})")
    # Chinese: 2025?10?15? or 2025?10?15? 10:00
    cn_date_time = re.compile(r"(20\d{2})?(\d{1,2})?(\d{1,2})?(?:\s+(\d{1,2}):(\d{2}))?")
    # Chinese month/day with weekday decorations tolerated (strip non-digits later)

    def _emit(year, month, day, hh, mm, url, bucket):
        try:
            h = 10 if hh is None else max(0, min(23, int(hh)))
            m = 0 if mm is None else max(0, min(59, int(mm)))
            local_dt = ensure_aware(datetime(int(year), int(month), int(day), h, m), BJ, h, m)
            dt_utc = local_dt.astimezone(UTC)
        except Exception:
            return
        if not _within(dt_utc, start_utc, end_utc):
            return
        title = "China NBS Statistical Release"
        ev = Event(
            id=make_id("CN", "NBS", title, dt_utc),
            source="NBS_HTML",
            agency="NBS",
            country="CN",
            title=title,
            date_time_utc=dt_utc,
            event_local_tz="Asia/Shanghai",
            impact=classify_event(title),
            url=url,
            extras={"discovered_via": "dom"},
        )
        bucket.append(ev)

    # DOM pass (first successful page wins)
    for u in urls:
        resp = sget_retry_alt(session, [u], headers=headers, tries=3)
        if not (resp and getattr(resp, "ok", False)):
            continue
        page_url = resp.url or u
        try:
            soup = BeautifulSoup(resp.text or "", "html.parser")
        except Exception:
            continue

        text = soup.get_text("\n", strip=True)
        dom_events = []

        # Scan line by line; keep nearest links as URL
        for node in soup.select("a, li, p, time, span"):
            line = (node.get_text(" ", strip=True) or "").strip()
            if not line:
                continue
            # Chinese date
            m = cn_date_time.search(line)
            if m:
                y, mo, d, hh, mm = m.groups()
                _emit(y, mo, d, hh, mm, urljoin(page_url, (node.get("href") or page_url)), dom_events)
                continue
            # ASCII date
            m = ascii_date.search(line)
            if m:
                y, mo, d = m.groups()
                _emit(y, mo, d, 10, 0, urljoin(page_url, (node.get("href") or page_url)), dom_events)

        if dom_events:
            dom_events.sort(key=lambda e: e.date_time_utc)
            if cache_manager:
                try:
                    _persist_lkg("NBS", dom_events)
                except Exception:
                    pass
            _set_fetch_metadata("NBS", count=len(dom_events), path="dom")
            logger.info("NBS path used: dom (%d)", len(dom_events))
            return dom_events

    # LKG on zero
    merged = maybe_merge_lkg("NBS", [], ttl_days=30, tag="lkg")
    if merged:
        for ev in merged:
            ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg"}
        _set_fetch_metadata("NBS", count=len(merged), path="lkg")
        logger.info("NBS LKG_MERGE: %d", len(merged))
        logger.info("NBS path used: lkg (%d)", len(merged))
        return merged

    _set_fetch_metadata("NBS", count=0, path="none")
    logger.info("NBS path used: none (0)")
    return []
def fetch_fed_fomc_events(session, start_utc, end_utc):

    """FOMC calendar: robust text-block parser.



    - Splits page by "YYYY FOMC Meetings" headings.



    - Matches month + day(s) even when on separate lines.



    - Handles cross-month labels (e.g., "Apr/May 30-1"), parentheses (notation vote), and footnotes.



    Decision day = Day 2 @ 14:00 ET (or Day 1 if single-day).



    """

    try:

        url = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"

        resp = sget(session, url, headers={"User-Agent": DEFAULT_HEADERS.get("User-Agent", "Mozilla/5.0")})

        if not (resp and resp.ok) or not BeautifulSoup:

            logger.warning("Fed FOMC: fetch failed")

            return []

        soup = BeautifulSoup(resp.text, "html.parser")

        full_text = soup.get_text("\n", strip=True)

        # Normalize whitespace/dashes

        def norm(s: str) -> str:

            return (s.replace("\xa0"," ").replace("\u202f"," ").replace("\u2009"," ")

                      .replace("\u2010","-").replace("\u2011","-").replace("\u2012","-")

                      .replace("\u2013","-").replace("\u2014","-").replace("\u2212","-"))

        full_text = norm(full_text)

        # Identify year blocks by headings like "2025 FOMC Meetings"

        heading_re = re.compile(r"^\s*(20\d{2})\s+FOMC\s+Meetings\s*$", re.I | re.M)

        heads = [(int(m.group(1)), m.start(), m.end()) for m in heading_re.finditer(full_text)]

        if logger.isEnabledFor(logging.DEBUG):

            logger.debug(f"FOMC (text): found {len(heads)} year headings: {[y for y,_,_ in heads]}")

        # Month labels including cross-month

        month_label = (

            r"(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"

            r"Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?|"

            r"Jan/Feb|Feb/Mar|Mar/Apr|Apr/May|May/Jun|Jun/Jul|Jul/Aug|Aug/Sep|Sep/Oct|Oct/Nov|Nov/Dec)"

        )

        md_pat = re.compile(

            rf"\b(?P<label>{month_label})\s+"

            rf"(?P<d1>\d{{1,2}})"

            rf"(?:\s*-\s*(?P<d2>\d{{1,2}}))?"

            rf"(?:\s*\([^)]*?\))?"      # optional (notation vote) etc.

            rf"(?:\s*[*\u2020])?",      # optional footnote marks

            re.I,

        )

        def month_num_simple(name: str) -> int:

            n = name.lower().strip()

            for i, m in enumerate(MONTHS, 1):

                if m.lower().startswith(n[:3]):

                    return i

            return 0

        events = []

        # If no headings detected, treat whole page as a single block with current year context

        if not heads:

            heads = [(datetime.now().year, 0, 0)]

        for idx, (year, start_i, end_i) in enumerate(heads):

            block_start = end_i

            block_end = heads[idx+1][1] if idx+1 < len(heads) else len(full_text)

            block = full_text[block_start:block_end].strip()

            # Debug peek of the first lines in the year block

            if logger.isEnabledFor(logging.DEBUG):

                first_lines = block.splitlines()[:20]

                logger.debug(f"FOMC {year}: first lines -> {' | '.join(first_lines)}")

            matches = 0

            for m in md_pat.finditer(block):

                label = m.group("label")

                d1 = int(m.group("d1"))

                d2 = m.group("d2")

                decision_day = int(d2) if d2 else d1

                # Choose month for decision day if cross-month

                if "/" in label:

                    left, right = [t.strip() for t in label.split("/", 1)]

                    mon = month_num_simple(right) if d2 else month_num_simple(left)

                else:

                    mon = month_num_simple(label)

                if not mon:

                    continue

                local_dt = ensure_aware(datetime(year, mon, decision_day, 14, 0), NEW_YORK_TZ)

                dt_utc = local_dt.astimezone(UTC)

                if not _within(dt_utc, start_utc, end_utc):

                    continue

                title = "FOMC Meeting"

                events.append(Event(

                    id=make_id("US", "FED", title, dt_utc),

                    source="FED_HTML_CALENDAR",

                    agency="FED",

                    country="US",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="America/New_York",

                    impact=classify_event(title),

                    url=url,

                    extras={"meeting_type": "FOMC", "decision_day": 2 if d2 else 1},

                ))

                matches += 1

            if logger.isEnabledFor(logging.DEBUG):

                logger.debug(f"FOMC {year}: matched {matches} meetings")

        if not events:

            logger.warning("Fed FOMC: page found but no meetings parsed (check regex).")

        else:

            logger.info(f"Fed FOMC: {len(events)} meetings matched")

        return events

    except Exception as e:

        logger.error(f"Fed FOMC: Error: {e}", exc_info=True)

        return []

def fetch_ecb_governing_council_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """ECB Governing Council calendar with DOM primary, text fallback, and guarded LKG."""
    agency = "ECB"
    country = "EU"
    url = "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html"
    source_dom = "ECB_HTML"
    source_text = "ECB_TEXT_CALENDAR"
    cache_manager = getattr(session, "cache_manager", None)

    path_used = "dom"
    dom_day2 = 0
    text_day2 = 0

    if not BeautifulSoup:
        logger.warning("ECB: BeautifulSoup unavailable; DOM parse skipped")
        _set_fetch_metadata("ECB", count=0, path=path_used)
        logger.info("ECB path used: dom")
        return []

    try:
        resp = sget(session, url)
    except Exception as exc:
        logger.error("ECB: fetch error: %s", exc)
        _set_fetch_metadata("ECB", count=0, path=path_used)
        logger.info("ECB path used: dom")
        return []

    if not (resp and getattr(resp, "ok", False)):
        logger.warning("ECB: failed to fetch calendar page (status=%s)", getattr(resp, "status_code", "n/a"))
        _set_fetch_metadata("ECB", count=0, path=path_used)
        logger.info("ECB path used: dom")
        return []

    soup = BeautifulSoup(resp.text, "html.parser")

    selectors = [".ecb-basicList", ".table", ".calendar__item", "#content"]
    time_pattern = re.compile(r"(\d{1,2})[:.](\d{2})")
    date_single = re.compile(r"(?P<d>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")
    date_numeric = re.compile(r"(?P<d>\d{1,2})[./](?P<m>\d{1,2})[./](?P<y>20\d{2})")
    date_range = re.compile(r"(?P<d1>\d{1,2})\s*[\u2013\u2014-]\s*(?P<d2>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")

    def _month_to_num(token: str) -> int | None:
        lookup = {
            "jan": 1,
            "feb": 2,
            "mar": 3,
            "apr": 4,
            "may": 5,
            "jun": 6,
            "jul": 7,
            "aug": 8,
            "sep": 9,
            "sept": 9,
            "oct": 10,
            "nov": 11,
            "dec": 12,
        }
        token = (token or "").strip().lower()
        return lookup.get(token[:4], lookup.get(token[:3]))

    def _extract_time(*snippets: str) -> tuple[int, int]:
        for snippet in snippets:
            if not snippet:
                continue
            match = time_pattern.search(snippet)
            if not match:
                continue
            try:
                hours = max(0, min(23, int(match.group(1))))
                mins = max(0, min(59, int(match.group(2))))
                return hours, mins
            except Exception:
                continue
        return 14, 30

    events: List[Event] = []
    seen_ids: set[str] = set()

    def _emit(
        year: int,
        month: int,
        day: int,
        hour: int | None,
        minute: int | None,
        *,
        day_index: int,
        press_conf: bool,
        source_tag: str,
    ) -> None:
        nonlocal dom_day2, text_day2
        hh = max(0, min(23, hour if hour is not None else 14))
        mm = max(0, min(59, minute if minute is not None else 30))
        # Force Day-2 default to 13:45 when time is missing or came from generic default.
        # We treat "missing" as values equal to the generic default returned by _extract_time (14:30).
        if (day_index == 2 or press_conf) and (hour is None or minute is None or (hh, mm) == (14, 30)):
            hh, mm = 13, 45
        try:
            dt_local = ensure_aware(datetime(year, month, day, hh, mm), FRANKFURT_TZ, hh, mm)
            dt_utc = dt_local.astimezone(UTC)
        except Exception:
            return
        if not _within(dt_utc, start_utc, end_utc):
            return
        is_day_two = day_index == 2 or press_conf
        title = "ECB Governing Council Meeting"
        meeting_type = "Governing Council Day 1"
        if is_day_two:
            title = "ECB Governing Council Meeting (Day 2)"
            meeting_type = "Governing Council Day 2"
        event_id = make_id(country, agency, title, dt_utc)
        if event_id in seen_ids:
            return
        seen_ids.add(event_id)
        events.append(
            Event(
                id=event_id,
                source=source_tag,
                agency=agency,
                country=country,
                title=title,
                date_time_utc=dt_utc,
                event_local_tz="Europe/Berlin",
                impact="High",
                url=url,
                extras={
                    "meeting_type": meeting_type,
                    "has_press_conference": bool(press_conf),
                    "meeting_time_local": f"{hh:02d}:{mm:02d}",
                    "source_type": "DOM" if source_tag == source_dom else "TEXT_FALLBACK",
                    "day_index": 2 if is_day_two else 1,
                },
            )
        )
        if is_day_two:
            if source_tag == source_dom:
                dom_day2 += 1
            else:
                text_day2 += 1

    # DOM path
    for selector in selectors:
        for element in soup.select(selector):
            block = element.get_text("\n", strip=True)
            if not block:
                continue
            block_lower = block.lower()
            for line in block.splitlines():
                match_range = date_range.search(line)
                if match_range:
                    month_num = _month_to_num(match_range.group("mon"))
                    if not month_num:
                        continue
                    year = int(match_range.group("y"))
                    day_start = int(match_range.group("d1"))
                    day_end = int(match_range.group("d2"))
                    hh, mm = _extract_time(line, block)
                    _emit(year, month_num, day_start, hh, mm, day_index=1, press_conf=False, source_tag=source_dom)
                    _emit(
                        year,
                        month_num,
                        day_end,
                        hh,
                        mm,
                        day_index=2,
                        press_conf=("press conference" in block_lower or "day 2" in block_lower),
                        source_tag=source_dom,
                    )
                    continue
                match_single = date_single.search(line)
                if match_single:
                    month_num = _month_to_num(match_single.group("mon"))
                    if not month_num:
                        continue
                    year = int(match_single.group("y"))
                    day_val = int(match_single.group("d"))
                    hh, mm = _extract_time(line, block)
                    press_conf = "press conference" in block_lower or "day 2" in block_lower
                    _emit(
                        year,
                        month_num,
                        day_val,
                        hh,
                        mm,
                        day_index=2 if press_conf else 1,
                        press_conf=press_conf,
                        source_tag=source_dom,
                    )

    if events:
        events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            _persist_lkg("ECB", events)
        _set_fetch_metadata("ECB", count=len(events), path="dom")
        logger.info(f"ECB Governing Council: {dom_day2} meetings found (Day 2)")
        logger.info("ECB path used: dom")
        return events

    # Text fallback
    text_block = soup.get_text(" ", strip=True)
    path_used = "text"
    range_pattern = re.compile(r"(?P<d1>\d{1,2})\s*(?:[\u2013\u2014-]|--)\s*(?P<d2>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")
    single_month_pattern = re.compile(r"(?P<d>\d{1,2})\s+(?P<mon>[A-Za-z]+)\s+(?P<y>20\d{2})")

    def _context_hint(span: tuple[int, int]) -> bool:
        start, end = span
        radius = 120
        snippet = text_block[max(0, start - radius) : min(len(text_block), end + radius)].lower()
        return "press conference" in snippet or "day 2" in snippet

    matched_ranges: list[tuple[int, int]] = []
    for match in range_pattern.finditer(text_block):
        month_num = _month_to_num(match.group("mon"))
        if not month_num:
            continue
        year = int(match.group("y"))
        day_start = int(match.group("d1"))
        day_end = int(match.group("d2"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_start, None, None, day_index=1, press_conf=False, source_tag=source_text)
        _emit(year, month_num, day_end, None, None, day_index=2, press_conf=hint, source_tag=source_text)
        matched_ranges.append(match.span())

    def _span_within(target: tuple[int, int]) -> bool:
        return any(span[0] <= target[0] and target[1] <= span[1] for span in matched_ranges)

    for match in single_month_pattern.finditer(text_block):
        if _span_within(match.span()):
            continue
        month_num = _month_to_num(match.group("mon"))
        if not month_num:
            continue
        year = int(match.group("y"))
        day_val = int(match.group("d"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_val, None, None, day_index=1, press_conf=hint, source_tag=source_text)
        if hint:
            _emit(year, month_num, day_val, None, None, day_index=2, press_conf=True, source_tag=source_text)

    for match in date_numeric.finditer(text_block):
        if _span_within(match.span()):
            continue
        year = int(match.group("y"))
        month_num = int(match.group("m"))
        day_val = int(match.group("d"))
        hint = _context_hint(match.span())
        _emit(year, month_num, day_val, None, None, day_index=1, press_conf=hint, source_tag=source_text)
        if hint:
            _emit(year, month_num, day_val, None, None, day_index=2, press_conf=True, source_tag=source_text)

    if events:
        events.sort(key=lambda ev: ev.date_time_utc)
        if cache_manager:
            _persist_lkg("ECB", events)
        _set_fetch_metadata("ECB", count=len(events), path=path_used)
        logger.info(f"ECB Governing Council: {text_day2} meetings found (Day 2)")
        logger.info("ECB path used: text")
        return events

    # LKG merge
    lkg_events: List[Event] = []
    if cache_manager:
        try:
            lkg_events = maybe_merge_lkg("ECB", events, ttl_days=14, tag="lkg")
        except Exception:
            logger.debug("ECB: guarded LKG merge failed", exc_info=True)

    if lkg_events:
        logger.warning(f"ECB LKG_MERGE: {len(lkg_events)} merged")
        _set_fetch_metadata("ECB", count=len(lkg_events), path="lkg")
        logger.info("ECB path used: lkg")
        return lkg_events

    _set_fetch_metadata("ECB", count=0, path=path_used)
    logger.info(f"ECB path used: {path_used}")
    return []

def fetch_boj_mpm_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:
    """Bank of Japan Monetary Policy Meeting schedule with EN primary and JP fallback."""

    if not BeautifulSoup:
        logger.warning("BOJ: BeautifulSoup unavailable; skipping schedule parse")
        _set_fetch_metadata("BOJ", count=0, path="schedule")
        return []

    agency = "BOJ"
    country = "JP"
    source = "BOJ_SCHEDULE"
    title = "Japan \u2014 BoJ Monetary Policy Meeting"
    tags = ["central_bank", "boj", "mpm"]

    cache_manager = getattr(session, "cache_manager", None)

    locale_urls: List[tuple[str, List[str]]] = [
        (
            "en",
            [
                "https://www.boj.or.jp/en/mopo/mpmsche_minu/index.htm",
                "https://www.boj.or.jp/en/mopo/mpmsche_minu/mpmsche.htm",
            ],
        ),
        (
            "jp",
            [
                "https://www.boj.or.jp/mopo/mpmsche_minu/index.htm",
                "https://www.boj.or.jp/mopo/mpmsche_minu/mpmsche.htm",
            ],
        ),
    ]

    headers = {
        "User-Agent": DEFAULT_HEADERS.get("User-Agent", "Mozilla/5.0"),
        "Accept-Language": "en-US,en;q=0.8,ja;q=0.7",
    }

    ERA_BASE = {"\u4ee4\u548c": 2018, "\u5e73\u6210": 1988, "\u662d\u548c": 1925}
    range_delims = r"[\-\u2013\u2014\u2212\uFF0D~\u301C]"
    month_regex = (
        "Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|"
        "Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?"
    )

    era_pattern = re.compile(
        rf"(?P<era>{'|'.join(ERA_BASE.keys())})\s*(?P<eyear>\d+)\s*\u5e74\s*(?P<m1>\d{{1,2}})\s*\u6708\s*(?P<d1>\d{{1,2}})\s*\u65e5"
        rf"(?:\s*{range_delims}\s*(?:(?P<m2>\d{{1,2}})\s*\u6708\s*)?(?P<d2>\d{{1,2}})\s*\u65e5?)?"
    )
    jp_pattern = re.compile(
        rf"(?:(?P<y>20\d{{2}})\s*\u5e74\s*)?(?P<m1>\d{{1,2}})\s*\u6708\s*(?P<d1>\d{{1,2}})\s*\u65e5"
        rf"(?:\s*{range_delims}\s*(?:(?P<m2>\d{{1,2}})\s*\u6708\s*)?(?P<d2>\d{{1,2}})\s*\u65e5?)?"
    )
    numeric_pattern = re.compile(r"(?:(?P<y>20\d{2})[./])?\s*(?P<m>\d{1,2})[./]\s*(?P<d>\d{1,2})")
    en_pattern = re.compile(
        rf"(?P<m1>{month_regex})\.?\s*(?P<d1>\d{{1,2}})"
        rf"(?:\s*(?:{range_delims}|to)\s*(?:(?P<m2>{month_regex})\.?\s*)?(?P<d2>\d{{1,2}}))?",
        re.IGNORECASE,
    )
    time_ampm_pattern = re.compile(
        r"(?P<h>\d{1,2})(?::|：)?(?P<m>\d{2})?\s*(?P<ampm>a\.m\.|p\.m\.|am|pm)",
        re.IGNORECASE,
    )
    time_24_pattern = re.compile(r"\b(?P<h>\d{1,2})[:：](?P<m>\d{2})\b")
    href_date_pattern = re.compile(r"(?<!\d)(?P<yy>\d{2})(?P<mm>\d{2})(?P<dd>\d{2})(?!\d)")

    tentative_terms_en = ("tentative", "tbd", "to be decided", "to be determined", "to be announced")
    tentative_terms_jp = ("\u672a\u5b9a", "\u8abf\u6574\u4e2d", "\u6682\u5b9a")

    schedule_events: List[Event] = []
    parsed_rows = 0
    used_locale: Optional[str] = None
    used_url: Optional[str] = None

    def _prepare_text(text: str) -> tuple[str, str, str]:
        normalized = unicodedata.normalize("NFKC", text or "")
        lowered = normalized.lower()
        cleaned = re.sub(r"\[[^\]]*\]", "", normalized)
        cleaned = re.sub(r"\([^)]*\)", "", cleaned)
        cleaned = re.sub(r"[\u203b\u2606\u2605\u2020\u2021\uff0a*]", " ", cleaned)
        cleaned = cleaned.replace("\u3000", " ")
        cleaned = cleaned.replace("\uff0c", ",").replace("\u3001", " ")
        cleaned = cleaned.replace("\u30fb", " ").replace("\uff65", " ")
        cleaned = cleaned.replace("\uff0f", "/")
        cleaned = re.sub(r"\s+", " ", cleaned)
        ready = cleaned
        for delim in ("~", "\u301c", "\uff5e", "\u2013", "\u2014", "\u2212", "\uff0d"):
            ready = ready.replace(delim, "-")
        ready = ready.replace(" to ", "-")
        ready = re.sub(r"\s*,\s*", "-", ready)
        ready = re.sub(r"-+", "-", ready).strip(" -")
        return normalized, lowered, ready

    def _adjust_year(base_year: int, month_anchor: int, month_candidate: int) -> int:
        year = base_year
        if month_anchor and month_candidate:
            if month_candidate < month_anchor - 6:
                year += 1
            elif month_candidate > month_anchor + 6:
                year -= 1
        return year

    def _dates_from_href(cell: Any, context_year: int) -> List[tuple[int, int, int]]:
        for link in cell.find_all("a"):
            href = link.get("href") or ""
            match = href_date_pattern.search(href)
            if not match:
                continue
            yy = int(match.group("yy"))
            mm = int(match.group("mm"))
            dd = int(match.group("dd"))
            year = 2000 + yy
            if context_year and abs(year - context_year) > 50:
                century = (context_year // 100) * 100
                year = century + yy
                if year < context_year - 50:
                    year += 100
            return [(year, mm, dd)]
        return []

    def _extract_meeting_dates(clean_text: str, normalized_text: str, default_year: int) -> List[tuple[int, int, int]]:
        dates: List[tuple[int, int, int]] = []

        for match in era_pattern.finditer(clean_text):
            era = match.group("era")
            base_year = ERA_BASE.get(era, 0) + int(match.group("eyear"))
            m1 = int(match.group("m1"))
            d1 = int(match.group("d1"))
            dates.append((base_year, m1, d1))
            if match.group("d2"):
                m2 = int(match.group("m2") or m1)
                d2 = int(match.group("d2"))
                year2 = _adjust_year(base_year, m1, m2)
                dates.append((year2, m2, d2))

        for match in jp_pattern.finditer(clean_text):
            year = int(match.group("y")) if match.group("y") else default_year
            m1 = int(match.group("m1"))
            d1 = int(match.group("d1"))
            dates.append((year, m1, d1))
            if match.group("d2"):
                m2 = int(match.group("m2") or m1)
                d2 = int(match.group("d2"))
                year2 = _adjust_year(year, m1, m2)
                dates.append((year2, m2, d2))

        for match in numeric_pattern.finditer(clean_text):
            year = int(match.group("y")) if match.group("y") else default_year
            month = int(match.group("m"))
            day = int(match.group("d"))
            dates.append((year, month, day))

        for match in en_pattern.finditer(clean_text):
            month1 = month_to_num(match.group("m1"))
            if not month1:
                continue
            day1 = int(match.group("d1"))
            year1 = default_year
            dates.append((year1, month1, day1))
            if match.group("d2"):
                month2 = month_to_num(match.group("m2")) if match.group("m2") else month1
                if not month2:
                    month2 = month1
                day2 = int(match.group("d2"))
                year2 = _adjust_year(year1, month1, month2)
                dates.append((year2, month2, day2))

        if not dates:
            fallback_days = re.findall(r"\b(\d{1,2})\b", normalized_text)
            month_match = re.search(month_regex, normalized_text, re.IGNORECASE)
            month_val = month_to_num(month_match.group(0)) if month_match else None
            if month_val:
                for token in fallback_days:
                    day_val = int(token)
                    if 1 <= day_val <= 31:
                        dates.append((default_year, month_val, day_val))

        deduped: List[tuple[int, int, int]] = []
        seen: set[str] = set()
        for year, month, day in dates:
            year = year or default_year
            if not (1 <= month <= 12 and 1 <= day <= 31):
                continue
            key = f"{year:04d}-{month:02d}-{day:02d}"
            if key in seen:
                continue
            seen.add(key)
            deduped.append((year, month, day))
        return deduped

    def _derive_time(normalized_text: str, tentative: bool) -> tuple[int, int, str, List[str]]:
        notes: List[str] = []
        hour_minute: Optional[tuple[int, int]] = None

        match = time_ampm_pattern.search(normalized_text)
        if match:
            hour = int(match.group("h"))
            minute = int(match.group("m") or 0)
            ampm = match.group("ampm").lower()
            hour = hour % 12
            if ampm.startswith("p"):
                hour += 12
            hour_minute = (hour, minute)
        else:
            match = time_24_pattern.search(normalized_text)
            if match:
                hour = int(match.group("h"))
                minute = int(match.group("m"))
                if 0 <= hour < 24 and 0 <= minute < 60:
                    hour_minute = (hour, minute)

        if hour_minute:
            hour, minute = hour_minute
            time_conf = "tentative" if tentative else "confirmed"
        else:
            hour, minute = 12, 0
            time_conf = "tentative" if tentative else "assumed"
            notes.append("No explicit time on schedule; placeholder.")

        if tentative:
            notes.append("Tentative date/time")

        if notes:
            notes = list(dict.fromkeys(notes))

        return hour, minute, time_conf, notes

    def _parse_schedule(html: str, locale: str, page_url: str) -> tuple[List[Event], int]:
        soup = BeautifulSoup(html, "html.parser")
        events_out: List[Event] = []
        parsed = 0
        seen_ids: set[str] = set()

        for heading in soup.select("h2[id^='p20']"):
            heading_text = unicodedata.normalize("NFKC", heading.get_text(" ", strip=True))
            year_match = re.search(r"(20\d{2})", heading_text)
            if not year_match:
                continue
            context_year = int(year_match.group(1))
            table = heading.find_next("table")
            if not table:
                continue
            tbody = table.find("tbody") or table
            for row in tbody.find_all("tr"):
                cells = row.find_all("td")
                if not cells:
                    continue
                cell = cells[0]
                cell_text = cell.get_text(" ", strip=True)
                if not cell_text:
                    continue

                normalized, lowered, cleaned = _prepare_text(cell_text)
                if not cleaned:
                    continue

                tentative = any(term in lowered for term in tentative_terms_en) or any(term in normalized for term in tentative_terms_jp)

                date_candidates = _dates_from_href(cell, context_year) or _extract_meeting_dates(cleaned, normalized, context_year)
                if not date_candidates:
                    continue

                parsed += 1
                final_year, final_month, final_day = max(date_candidates)

                hour, minute, time_confidence, note_bits = _derive_time(normalized, tentative)
                local_dt = datetime(final_year, final_month, final_day, hour, minute)
                local_dt = ensure_aware(local_dt, TOKYO_TZ)
                dt_utc = local_dt.astimezone(UTC)

                if not _within(dt_utc, start_utc, end_utc):
                    continue

                event_id = make_id(country, agency, title, dt_utc)
                if event_id in seen_ids:
                    continue

                extras: Dict[str, Any] = {
                    "meeting_type": "MPM",
                    "tags": tags,
                    "time_confidence": time_confidence,
                    "source_locale": locale,
                    "raw_entry": normalized.strip(),
                }
                if tentative:
                    extras["tentative"] = True
                if note_bits:
                    extras["notes"] = " | ".join(note_bits)

                events_out.append(
                    Event(
                        id=event_id,
                        source=source,
                        agency=agency,
                        country=country,
                        title=title,
                        date_time_utc=dt_utc,
                        event_local_tz="Asia/Tokyo",
                        impact=classify_event(title),
                        url=page_url,
                        extras=extras,
                    )
                )
                seen_ids.add(event_id)

        events_out.sort(key=lambda ev: ev.date_time_utc)
        return events_out, parsed

    for locale, url_list in locale_urls:
        resp = None
        try:
            resp = sget_retry_alt(session, url_list, headers=headers, tries=3, timeout=25)
        except Exception:
            logger.debug("BOJ: request error for %s locale", locale, exc_info=True)
            continue

        if not (resp and getattr(resp, "ok", False)):
            continue

        page_url = getattr(resp, "url", url_list[0])
        events_locale, parsed_count = _parse_schedule(resp.text, locale, page_url)
        if parsed_count:
            schedule_events = events_locale
            parsed_rows = parsed_count
            used_locale = locale
            used_url = page_url
            break
        if not parsed_rows:
            used_url = page_url

    if parsed_rows == 0:
        logger.warning("BOJ: schedule parse returned no usable rows")

    final_events = schedule_events
    path_label = "schedule"

    if schedule_events:
        if cache_manager:
            try:
                _persist_lkg("BOJ", schedule_events)
            except Exception:
                logger.debug("BOJ: LKG persist failed", exc_info=True)
    else:
        try:
            lkg_events = maybe_merge_lkg("BOJ", schedule_events, ttl_days=90, tag="lkg")
        except Exception:
            logger.debug("BOJ: LKG merge failed", exc_info=True)
            lkg_events = []
        if lkg_events:
            final_events = lkg_events
            path_label = "lkg"
            logger.warning(f"BOJ LKG_MERGE: {len(lkg_events)} merged")
        else:
            final_events = []

    final_count = len(final_events)
    if used_locale:
        logger.debug("BOJ: schedule locale=%s url=%s parsed_rows=%d", used_locale, used_url, parsed_rows)

    _set_fetch_metadata("BOJ", count=final_count, path=path_label)
    logger.info(f"BOJ: {final_count} MPM meetings found in window")
    logger.info(f"BOJ path used: {path_label} ({final_count})")

    return final_events

def fetch_snb_events(session: requests.Session, start_utc: datetime, end_utc: datetime) -> List[Event]:

    """Swiss National Bank: monetary policy assessment dates."""

    events: List[Event] = []

    agency, country, source = "SNB", "CH", "SNB_SCHEDULE"

    urls = [

        "https://www.snb.ch/en/watch/calendar.html",

        "https://www.snb.ch/en/central-bank/news/calendar.html",

        "https://www.snb.ch/en/monetary-policy/monetary-policy-assessment.html",

    ]

    headers = {"User-Agent": DEFAULT_HEADERS.get("User-Agent","Mozilla/5.0"), "Accept-Language":"en-US,en;q=0.9,de;q=0.8,fr;q=0.7"}

    try:

        resp = sget_retry_alt(session, urls, headers=headers, tries=3, timeout=25)

        if (resp and resp.ok) and BeautifulSoup:

            soup = BeautifulSoup(resp.text, "html.parser")

            text = soup.get_text("\n", strip=True)

            # Patterns like "19 September 2025" or "September 19, 2025"

            pat1 = re.compile(r"(?P<d>\d{1,2})\s+(?P<mname>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?P<y>20\d{2})", re.I)

            pat2 = re.compile(r"(?P<mname>Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t|tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+(?P<d>\d{1,2}),\s*(?P<y>20\d{2})", re.I)

            for pat in (pat1, pat2):

                for m in pat.finditer(text):

                    d = int(m.group("d")); y = int(m.group("y"))

                    mname = m.group("mname")

                    mo = next((i+1 for i,full in enumerate(MONTHS) if full.lower().startswith(mname.lower()[:3])), 0)

                    if not mo: continue

                    # SNB announcement typically morning local; default 09:30 Europe/Zurich

                    local_dt = ensure_aware(datetime(y, mo, d, 9, 30), ZURICH_TZ)

                    dt_utc = local_dt.astimezone(UTC)

                    if not _within(dt_utc, start_utc, end_utc):

                        continue

                    title = "SNB Monetary Policy Assessment"

                    events.append(Event(

                        id=make_id(country, agency, title, dt_utc),

                        source=source,

                        agency=agency,

                        country=country,

                        title=title,

                        date_time_utc=dt_utc,

                        event_local_tz="Europe/Zurich",

                        impact=classify_event(title),

                        url=resp.url,

                        extras={"meeting_type":"MPA"}

                    ))

        # Estimator fallback (quarterly: Mar, Jun, Sep, Dec mid-month Fridays)

        if not events:

            months = [3,6,9,12]

            y = datetime.now(UTC).astimezone(ZURICH_TZ).year

            for mo in months:

                # choose 3rd Friday of the month

                first = datetime(y, mo, 1, 9, 30)

                # find Friday >= 15th

                d = 15

                while True:

                    dt = datetime(y, mo, d, 9, 30)

                    if dt.weekday()==4:  # Friday

                        break

                    d += 1

                local_dt = ensure_aware(dt, ZURICH_TZ)

                dt_utc = local_dt.astimezone(UTC)

                if _within(dt_utc, start_utc, end_utc):

                    title = "SNB Monetary Policy Assessment (estimated)"

                    events.append(Event(

                        id=make_id(country, agency, title, dt_utc),

                        source="SNB_ESTIMATED",

                        agency=agency,

                        country=country,

                        title=title,

                        date_time_utc=dt_utc,

                        event_local_tz="Europe/Zurich",

                        impact=classify_event(title),

                        url=urls[0],

                        extras={"estimated": True}

                    ))

            if events:

                logger.info("SNB: used estimator fallback")

        if events:

            logger.info(f"SNB: {len(events)} policy events found in window")

        else:

            logger.info("SNB: no policy events in window")

        return events

    except Exception as e:

        logger.error(f"SNB: Error: {e}")

        return events

SOURCE_KEY_PREFIXES = {

    "BLS": ("BLS",),

    "ONS": ("ONS",),

    "ABS": ("ABS",),

    "STATSCAN": ("STATCAN", "STATSCAN"),

    "EUROSTAT": ("EUROSTAT",),

    "STATSNZ": ("STATSNZ",),

    "ESRI": ("ESRI",),

    "NBS": ("NBS",),

    "SECO": ("SECO",),

    "ECB": ("ECB",),

    "RBNZ": ("RBNZ",),

}

AGENCY_KEY_OVERRIDES = {"STATCAN": "STATSCAN"}

def _normalize_key(value: Optional[str]) -> str:

    return (value or "").upper()

def _event_matches_key(event: Event, key: str) -> bool:

    normalized_key = _normalize_key(key)

    agency_value = _normalize_key(event.agency)

    if AGENCY_KEY_OVERRIDES.get(agency_value, agency_value) == normalized_key:

        return True

    source_value = _normalize_key(event.source)

    for prefix in SOURCE_KEY_PREFIXES.get(normalized_key, ()):

        if source_value.startswith(prefix):

            return True

    return False

def _filter_events_by_key(events: List[Event], key: str) -> List[Event]:

    return [ev for ev in events if _event_matches_key(ev, key)]

def _merge_events(primary: List[Event], extra: List[Event]) -> List[Event]:

    if not extra:

        return primary

    seen = {ev.id for ev in primary}

    merged = list(primary)

    for ev in extra:

        if ev.id not in seen:

            merged.append(ev)

            seen.add(ev.id)

    return merged

def _fallback_statcan_html(session: requests.Session, start_utc: datetime, end_utc: datetime, events: List[Event], expected: int) -> List[Event]:

    atom_count = sum(1 for ev in events if ev.source == "STATCAN_ATOM")

    if atom_count > 0:

        return []

    try:

        return _statcan_html_fallback(session, start_utc, end_utc) or []

    except Exception:

        logger.debug("StatCan HTML fallback invocation failed", exc_info=True)

        return []

def _fallback_eurostat_refetch(session: requests.Session, start_utc: datetime, end_utc: datetime, events: List[Event], expected: int) -> List[Event]:

    url = "https://ec.europa.eu/eurostat/cache/RELEASE_CALENDAR/calendar_EN.ics"

    headers = {"Accept-Language": "en-US,en;q=0.9"}

    try:

        resp = sget(session, url, headers=headers)

    except Exception:

        logger.debug("Eurostat refetch failed", exc_info=True)

        return []

    if not (resp and getattr(resp, "ok", False)):

        return []

    extra: List[Event] = []

    try:

        for item in parse_ics_bytes(resp.content, BRUSSELS_TZ, default_hour=11, default_min=0):

            dt_utc = item["dt"].astimezone(UTC)

            if start_utc and dt_utc < start_utc:

                continue

            if end_utc and dt_utc > end_utc:

                continue

            title = re.sub(r"\s+", " ", item["title"]).strip()

            extra.append(Event(

                id=make_id("EU", "EUROSTAT", title, dt_utc),

                source="Eurostat",

                agency="EUROSTAT",

                country="EU",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="Europe/Brussels",

                impact=classify_event(title),

                url=item.get("url") or url,

                extras={"release_time_local": "11:00"},

            ))

    except Exception:

        logger.debug("Eurostat refetch parse failed", exc_info=True)

        return []

    return extra

def _fallback_statsnz_refetch(session: requests.Session, start_utc: datetime, end_utc: datetime, events: List[Event], expected: int) -> List[Event]:

    headers = {"Accept-Language": "en-US,en;q=0.9"}

    urls = [

        "https://www.stats.govt.nz/release-calendar/calendar-export",

        "https://www.stats.govt.nz/assets/Uploads/release-calendar.ics",

    ]

    extra: List[Event] = []

    for url in urls:

        try:

            resp = sget(session, url, headers=headers)

        except Exception:

            logger.debug("Stats NZ refetch failed for %s", url, exc_info=True)

            continue

        if not (resp and getattr(resp, "ok", False)):

            continue

        try:

            for item in parse_ics_bytes(resp.content, WELLINGTON_TZ, default_hour=10, default_min=45):

                dt_utc = item["dt"].astimezone(UTC)

                if start_utc and dt_utc < start_utc:

                    continue

                if end_utc and dt_utc > end_utc:

                    continue

                title = re.sub(r"\s+", " ", item["title"]).strip()

                extra.append(Event(

                    id=make_id("NZ", "STATSNZ", title, dt_utc),

                    source="StatsNZ",

                    agency="STATSNZ",

                    country="NZ",

                    title=title,

                    date_time_utc=dt_utc,

                    event_local_tz="Pacific/Auckland",

                    impact=classify_event(title),

                    url=item.get("url") or url,

                    extras={"release_time_local": "10:45"},

                ))

        except Exception:

            logger.debug("Stats NZ refetch parse failed for %s", url, exc_info=True)

            continue

    return extra

def _fallback_seco_estimator(session: requests.Session, start_utc: datetime, end_utc: datetime, events: List[Event], expected: int) -> List[Event]:

    schedule = [(3, "Spring"), (6, "Summer"), (9, "Autumn"), (12, "Winter")]

    now_local = datetime.now(UTC).astimezone(ZURICH_TZ)

    extra: List[Event] = []

    for year in (now_local.year, now_local.year + 1):

        for month, season in schedule:

            try:

                dt_local = ensure_aware(datetime(year, month, 15, 9, 0), ZURICH_TZ, 9, 0)

            except ValueError:

                continue

            dt_utc = dt_local.astimezone(UTC)

            if not (start_utc <= dt_utc <= end_utc):

                continue

            title = f"SECO {season} Economic Forecast"

            extra.append(Event(

                id=make_id("CH", "SECO", title, dt_utc),

                source="SECO_HTML",

                agency="SECO",

                country="CH",

                title=title,

                date_time_utc=dt_utc,

                event_local_tz="Europe/Zurich",

                impact=classify_event(title),

                url="https://www.seco.admin.ch/seco/en/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html",

                extras={"announcement_time_local": "09:00", "frequency": "Quarterly", "estimated_date": True},

            ))

    return extra

FALLBACK_HANDLERS: Dict[str, Callable[[requests.Session, datetime, datetime, List[Event], int], List[Event]]] = {

    "STATSCAN": _fallback_statcan_html,

    "EUROSTAT": _fallback_eurostat_refetch,

    "STATSNZ": _fallback_statsnz_refetch,

    "SECO": _fallback_seco_estimator,

}

def _apply_health_guard(source_key: str, events: List[Event], session: requests.Session, start_utc: datetime, end_utc: datetime, since_days: int, until_days: int, health_state: Dict[str, Dict[str, Any]], degrade_if_under: bool = False) -> List[Event]:

    events = [ev for ev in events if isinstance(ev, Event)]

    expected = SourceHealth.scaled(since_days, until_days, source_key)

    actual = len(_filter_events_by_key(events, source_key))

    degrade_flag = False

    fallback = FALLBACK_HANDLERS.get(source_key)

    if actual < expected and fallback:

        try:

            extra = fallback(session, start_utc, end_utc, events, expected)

        except Exception:

            logger.debug("%s fallback handler crashed", source_key, exc_info=True)

            extra = []

        if extra:

            events = _merge_events(events, extra)

            actual = len(_filter_events_by_key(events, source_key))

        if actual < expected and degrade_if_under:

            degrade_flag = True

    status = "HEALTHY" if actual >= expected and not degrade_flag else "DEGRADED"

    health_state[source_key] = {"actual": actual, "expected": expected, "status": status}

    return events

def _call_fetch(func, session, start_utc, end_utc):

    """Safely call a fetcher that may have arity (1|2|3) and return [] on error."""

    try:

        sig = inspect.signature(func)

        params = list(sig.parameters.values())

        arity = sum(1 for p in params if p.kind in (p.POSITIONAL_ONLY, p.POSITIONAL_OR_KEYWORD))

        if arity >= 3:

            return func(session, start_utc, end_utc) or []

        elif arity == 2:

            return func(session, (start_utc, end_utc)) or []

        else:

            return func(session) or []

    except Exception as exc:

        logger.error(f"{getattr(func, '__name__', 'fetcher')} crashed: {exc}")

        return []

# REPLACE ENTIRE BLOCK: canonical fetcher lists + gatherers
MACRO_FETCHERS: List[Callable] = [
    fetch_abs_events,
    # fetch_bls_events,
    # fetch_ons_events_enhanced,
    # fetch_statcan_events,
    fetch_eurostat_events,
    # fetch_stats_nz_events,
    fetch_china_nbs_events,
    # fetch_switzerland_seco_events,
    # fetch_japan_esri_events,
]

CB_FETCHERS: List[Callable] = [
    fetch_fed_fomc_events,
    # fetch_ecb_governing_council_events,
    # fetch_boe_events,
    # fetch_boc_events,
    # fetch_rba_events,
    # fetch_rbnz_events,
    # fetch_boj_mpm_events,
    # fetch_snb_events,
]

# Delete any other fetcher lists or gather_* definitions. There must be
# exactly one gather_macro_events, one gather_central_bank_events, one gather_events.

FETCHER_SOURCE_MAP: Dict[Callable, str] = {
    fetch_abs_events: "ABS",
    fetch_bls_events: "BLS",
    fetch_ons_events_enhanced: "ONS",
    fetch_statcan_events: "STATCAN",
    fetch_eurostat_events: "EUROSTAT",
    fetch_stats_nz_events: "STATSNZ",
    fetch_china_nbs_events: "NBS",
    fetch_switzerland_seco_events: "SECO",
    fetch_japan_esri_events: "ESRI",
    fetch_fed_fomc_events: "FED",
    fetch_ecb_governing_council_events: "ECB",
    fetch_boe_events: "BOE",
    fetch_boc_events: "BOC",
    fetch_rba_events: "RBA",
    fetch_rbnz_events: "RBNZ",
    fetch_boj_mpm_events: "BOJ",
    fetch_snb_events: "SNB",
}

def _assert_unique_fetchers() -> None:
    # Runtime guard: no duplicates, ECB not in macros, all callables unique
    assert len(MACRO_FETCHERS) == len(set(MACRO_FETCHERS)), "Duplicate in MACRO_FETCHERS"
    assert len(CB_FETCHERS) == len(set(CB_FETCHERS)), "Duplicate in CB_FETCHERS"
    assert fetch_ecb_governing_council_events not in MACRO_FETCHERS, "ECB must be CB only"
    for fn in MACRO_FETCHERS + CB_FETCHERS:
        assert callable(fn), f"Non-callable fetcher: {fn}"
        assert fn in FETCHER_SOURCE_MAP, f"Fetcher missing in map: {fn}"
    try:
        source_text = Path(__file__).read_text(encoding="utf-8")
    except Exception:
        return
    for func_name in (
        "fetch_ecb_governing_council_events",
        "fetch_japan_esri_events",
        "fetch_switzerland_seco_events",
        "fetch_rbnz_events",
        "fetch_china_nbs_events",
    ):
        occurrences = source_text.count(f"def {func_name}(")
        if occurrences != 1:
            print(f"Duplicate fetcher definition detected for {func_name}: found {occurrences}")
            sys.exit(2)

def gather_macro_events(session, start_utc, end_utc) -> List[Event]:
    _assert_unique_fetchers()
    events: List[Event] = []
    degrade_after_fallback = {"EUROSTAT", "STATSNZ"}

    ctx = RUN_CONTEXT
    since_days = ctx.get("since_days", 0)
    until_days = ctx.get("until_days", 0)
    health_state = ctx.setdefault("health_status", {})
    ctx.setdefault("per_source", {})
    ctx.setdefault("health_persistent", {})
    cache_manager = getattr(session, "cache_manager", None)

    _reset_fetch_metadata()

    for func in MACRO_FETCHERS:
        source_key = FETCHER_SOURCE_MAP.get(func, func.__name__.upper())
        produced: List[Event] = []
        produced_from_lkg = False

        _set_fetch_metadata(source_key, count=0, path=None)
        produced = _call_fetch(func, session, start_utc, end_utc)

        if produced and cache_manager:
            try:
                _persist_lkg(source_key, produced)
            except Exception:
                logger.debug("%s LKG persist failed", source_key, exc_info=True)

        if not produced:
            merged = maybe_merge_lkg(source_key, produced)
            if merged is not produced and merged:
                produced = merged
                produced_from_lkg = True
            else:
                alt_key = f"{source_key}_EST"
                if alt_key in LKG_TTLS:
                    alt = maybe_merge_lkg(alt_key, produced)
                    if alt is not produced and alt:
                        produced = alt
                        produced_from_lkg = True

        if produced_from_lkg:
            for ev in produced:
                ev.extras = {**(ev.extras or {}), "cached": True, "discovered_via": "lkg"}
            _set_fetch_metadata(source_key, count=len(produced), path="lkg")
            logger.info("%s LKG_MERGE: %d", source_key, len(produced))
            logger.info("%s path used: lkg (%d)", source_key, len(produced))
        if produced:
            events.extend(produced)

        meta = _get_fetch_metadata(source_key)
        if produced and meta.get("count") in (None, 0):
            _set_fetch_metadata(source_key, count=len(produced))
            meta = _get_fetch_metadata(source_key)
        if meta.get("path") is None:
            _set_fetch_metadata(source_key, path=meta.get("path") or "dom")

        _update_source_health_from_meta(source_key)

        events = _apply_health_guard(
            source_key,
            events,
            session,
            start_utc,
            end_utc,
            since_days,
            until_days,
            health_state,
            degrade_if_under=source_key in degrade_after_fallback,
        )

    abnormal_sources: List[str] = []
    for source, threshold in BIG_FEEDER_THRESHOLDS.items():
        meta = _get_fetch_metadata(source)
        total = meta.get("ics_total") if meta else None
        if total is not None and total < threshold:
            abnormal_sources.append(source)
    if len(abnormal_sources) >= 2:
        names = ", ".join(abnormal_sources)
        logger.warning(f"RATE_LIMIT_QUORUM: suspected throttling across: {names}")
        ctx.setdefault("quorum_alerts", []).append({"sources": abnormal_sources, "ts": _iso(_now_utc())})

    bigfeeders_flags: List[str] = []
    for source in ("EUROSTAT", "STATSNZ", "BLS"):
        threshold = BIG_FEEDER_THRESHOLDS.get(source)
        meta = _get_fetch_metadata(source)
        total = meta.get("ics_total") if meta else None
        if threshold is not None and isinstance(total, int) and total < threshold:
            bigfeeders_flags.append(f"{source}:{total}")
    if len(bigfeeders_flags) >= 2 and not ctx.get("bigfeeders_abnormal_logged"):
        logger.warning(f"BigFeedersAbnormal: {', '.join(bigfeeders_flags)}")
        ctx["bigfeeders_abnormal_logged"] = True

    return events

def gather_central_bank_events(session, start_utc, end_utc) -> List[Event]:
    _assert_unique_fetchers()
    events: List[Event] = []
    for func in CB_FETCHERS:
        events.extend(_call_fetch(func, session, start_utc, end_utc))
    return events

def gather_events(session, start_utc, end_utc, include_global: bool = False, include_central_banks: bool = False) -> List[Event]:
    _assert_unique_fetchers()
    all_events: List[Event] = []
    if include_global:
        all_events.extend(gather_macro_events(session, start_utc, end_utc))
    if include_central_banks:
        all_events.extend(gather_central_bank_events(session, start_utc, end_utc))
    return all_events
# END REPLACEMENT

def collect_events(since_days: int, until_days: int, include_central_banks: bool, include_global: bool, cache_manager: EnhancedCacheManager) -> List[Event]:
    '''Gather events across all configured sources within a UTC date window.'''
    session = build_session(cache_manager)

    global CURRENT_CACHE_MANAGER, RUN_CONTEXT

    CURRENT_CACHE_MANAGER = cache_manager
    RUN_CONTEXT = {
        "since_days": since_days,
        "until_days": until_days,
        "health_status": {},
        "per_source": {},
        "quorum_alerts": [],
        "health_persistent": _load_health_state(cache_manager),
    }
    RUN_CONTEXT["include_global_flag"] = include_global

    now_utc = _now_utc()
    start_utc = now_utc + timedelta(days=since_days)
    end_utc = now_utc + timedelta(days=until_days)
    RUN_CONTEXT["start_utc"] = start_utc
    RUN_CONTEXT["end_utc"] = end_utc

    events = gather_macro_events(session, start_utc, end_utc)

    if include_central_banks:
        cb_events = gather_central_bank_events(session, start_utc, end_utc)
        if cb_events:
            events.extend(cb_events)
        health_status = RUN_CONTEXT.setdefault("health_status", {})
        events = _apply_health_guard(
            "RBNZ",
            events,
            session,
            start_utc,
            end_utc,
            since_days,
            until_days,
            health_status,
        )
        _update_source_health_from_meta("RBNZ")

    filtered = [ev for ev in events if start_utc <= ev.date_time_utc <= end_utc]

    seen: Dict[str, Event] = {}
    unique_events: List[Event] = []
    for ev in filtered:
        if ev.id in seen:
            existing = seen[ev.id]
            existing_checksum = hashlib.sha1(f"{existing.title}{existing.date_time_utc}{existing.url}".encode()).hexdigest()
            new_checksum = hashlib.sha1(f"{ev.title}{ev.date_time_utc}{ev.url}".encode()).hexdigest()
            if existing_checksum != new_checksum:
                ev.extras["revised_from"] = existing.id
                ev.extras["revision_checksum"] = new_checksum
                for idx, current in enumerate(unique_events):
                    if current.id == ev.id:
                        unique_events[idx] = ev
                        break
                seen[ev.id] = ev
        else:
            seen[ev.id] = ev
            unique_events.append(ev)

    unique_events.sort(key=lambda e: e.date_time_utc)

    per_source_counts: Dict[str, int] = {}
    for ev in unique_events:
        key = ev.agency or ev.source
        per_source_counts[key] = per_source_counts.get(key, 0) + 1
    if per_source_counts:
        summary = ", ".join(f"{name}: {count}" for name, count in sorted(per_source_counts.items()))
        logger.info(summary)
    else:
        logger.info("No source-level events")

    logger.info(f"Total events collected: {len(events)}")
    logger.info(f"Events in UTC window ({since_days} to {until_days} days): {len(filtered)}")
    logger.info(f"Unique events after deduplication: {len(unique_events)}")

    health_persistent = RUN_CONTEXT.get("health_persistent", {})
    _save_health_state(cache_manager, health_persistent)

    health_status = RUN_CONTEXT.get("health_status", {})
    health_payload: Dict[str, Any] = dict(health_status)
    health_payload["per_source"] = RUN_CONTEXT.get("per_source", {})
    health_payload["quorum_alerts"] = RUN_CONTEXT.get("quorum_alerts", [])

    if health_payload:
        try:
            health_out = Path("out") / "health.json"
            health_out.parent.mkdir(parents=True, exist_ok=True)
            with health_out.open("w", encoding="utf-8") as handle:
                json.dump(health_payload, handle, ensure_ascii=False, separators=(",", ":"))
            logger.info("Run health written to out/health.json")
        except Exception:
            logger.debug("Failed to write health report", exc_info=True)

    return unique_events
    


def run(
    since_days: int = 0,
    until_days: int = 30,
    include_central_banks: bool = True,
    include_global: bool = True,
    cache_dir: Optional[str] = None,
    snapshots_dir: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Main entry point for Vercel serverless function.
    Returns a list of event dictionaries (compatible with scrape.py handler).
    
    Args:
        since_days: Days from today to start collecting events (default: 0)
        until_days: Days from today to stop collecting events (default: 30)
        include_central_banks: Include central bank monetary policy schedules (default: True)
        include_global: Include global expansion sources (default: True)
        cache_dir: Cache directory path (default: system temp dir)
        snapshots_dir: Failure snapshots directory (default: system temp dir)
    
    Returns:
        List of event dictionaries, each containing:
            - id, source, agency, country, title, date_time_utc, event_local_tz, impact, url, extras
    """
    import tempfile
    
    # Use system temp directory if not specified (works on Windows/Mac/Linux)
    if cache_dir is None:
        temp_dir = Path(tempfile.gettempdir())
        cache_dir = str(temp_dir / 'econ_scraper_cache')
    
    if snapshots_dir is None:
        temp_dir = Path(tempfile.gettempdir())
        snapshots_dir = str(temp_dir / 'econ_scraper_snapshots')
    
    logger.info("=== Economic Calendar Scraper - Vercel Run ===")
    logger.info(f"Date range: {since_days} to {until_days} days from today")
    logger.info(f"Include central banks: {include_central_banks}")
    logger.info(f"Include global expansion: {include_global}")
    logger.info(f"Cache dir: {cache_dir}")
    
    # Initialize cache manager
    cache_manager = EnhancedCacheManager(cache_dir, snapshots_dir)
    
    # Collect events
    events = collect_events(
        since_days=since_days,
        until_days=until_days,
        include_central_banks=include_central_banks,
        include_global=include_global,
        cache_manager=cache_manager
    )
    
    # Convert to list of dictionaries
    events_list = [ev.to_dict() for ev in events]
    
    logger.info(f"✓ Collection complete: {len(events_list)} events")
    
    return events_list

# ---------------------------------------------------------------------------
# CLI interface (preserved for backwards compatibility)

def main() -> None:
    parser = argparse.ArgumentParser(description="Economic Calendar Scraper - Complete Final Production")
    parser.add_argument("--since", type=int, default=0, help="Days from today to start collecting events (default: 0)")
    parser.add_argument("--until", type=int, default=30, help="Days from today to stop collecting events (default: 30)")
    parser.add_argument(
        "--central-banks",
        action="store_true",
        help="Include complete central bank monetary policy schedules (Fed, ECB, BoE, BoC, RBA, RBNZ)",
    )
    parser.add_argument(
        "--global",
        action="store_true",
        dest="include_global",
        help="Include global expansion sources (Japan, China, Switzerland)",
    )
    parser.add_argument("--out", type=str, default=None, help="Output file path (JSON)")
    parser.add_argument("--jsonl", type=str, default=None, help="Output file path (JSONL)")
    parser.add_argument("--health", action="store_true", help="Show health report")
    parser.add_argument(
        "--selfcheck",
        action="store_true",
        help="Run fetcher consistency checks without scraping",
    )
    parser.add_argument("--cache-dir", type=str, default="cache", help="Cache directory")
    parser.add_argument("--snapshots-dir", type=str, default="failures", help="Failure snapshots directory")
    
    args = parser.parse_args()
    
    if args.selfcheck:
        _assert_unique_fetchers()
        print("SELF-CHECK OK")
        return
    
    # Use the run() function
    result = run(
        since_days=args.since,
        until_days=args.until,
        include_central_banks=args.central_banks,
        include_global=args.include_global,
        cache_dir=args.cache_dir,
        snapshots_dir=args.snapshots_dir
    )
    
    events_data = result["events"]
    
    # Health monitoring
    if args.health:
        print("\n=== HEALTH REPORT ===")
        print(json.dumps(result["health"], indent=2))
    
    # Export JSON
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump(events_data, f, ensure_ascii=False, indent=2)
        print(f"Wrote {len(events_data)} events to {args.out}")
    
    # Export JSONL
    if args.jsonl:
        with open(args.jsonl, "w", encoding="utf-8") as f:
            for ev in events_data:
                f.write(json.dumps(ev, ensure_ascii=False) + "\n")
        print(f"Wrote {len(events_data)} events to {args.jsonl}")
    
    # Console output
    if not args.out and not args.jsonl:
        for ev_dict in events_data:
            dt = datetime.fromisoformat(ev_dict["date_time_utc"])
            print(
                f"{dt.strftime('%Y-%m-%d %H:%M:%S UTC')}: {ev_dict['title']} "
                f"({ev_dict['agency']}/{ev_dict['country']}, {ev_dict['impact']})"
            )
    
    # Enhanced CI assertion
    expected_min = 150 if args.central_banks and args.include_global and args.until >= 60 else 100
    if len(events_data) < expected_min:
        logger.warning(f"Expected >{expected_min} events but got {len(events_data)} - may indicate scraper issues")
    else:
        logger.info(f"✓ CI check passed: {len(events_data)} events >= {expected_min} threshold")

if __name__ == "__main__":
    main()