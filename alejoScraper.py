#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Economic Calendar Scraper — Final (Ultimate + Codex Patches)
-----------------------------------------------------------

What's inside:
- ZoneInfo-safe time handling (no .localize())
- Robust ICS parser (RFC5545 line-unfolding, TZID, Z, date-only handling)
- Requests session with retries/backoff + connection pooling
- ETag/Last-Modified disk caching + per-host polite throttling
- Rotating User-Agent strings per request
- Parallel fetching (ThreadPoolExecutor)
- Fan-out caps (ONS/StatCan) to prevent slowdowns
- ONS (RSS→HTML fallback), StatCan (Atom + page datetime), ABS (dual page, time-first)
- BLS, Eurostat, Stats NZ via ICS
- Central banks: Fed, ECB, BoE, RBA, RBNZ
- Impact classifier (incl. JOLTS/Job openings/Retail/Earnings)
- Health floors (global + per-source) and detailed logging
"""

from __future__ import annotations

import argparse
import hashlib
import json
import logging
import random
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from dataclasses import dataclass, asdict
from datetime import datetime, timedelta
from pathlib import Path
from typing import Dict, List, Optional, Any, Iterable
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry
import feedparser
from bs4 import BeautifulSoup
from dateutil import parser as dateparser

# ---------------------------
# Global config / constants
# ---------------------------

UTC          = ZoneInfo("UTC")
LON_TZ       = ZoneInfo("Europe/London")
TORONTO_TZ   = ZoneInfo("America/Toronto")
SYDNEY_TZ    = ZoneInfo("Australia/Sydney")
BRUSSELS_TZ  = ZoneInfo("Europe/Brussels")
AUCK_TZ      = ZoneInfo("Pacific/Auckland")
NY_TZ        = ZoneInfo("America/New_York")
TOKYO_TZ     = ZoneInfo("Asia/Tokyo")
BEIJING_TZ   = ZoneInfo("Asia/Shanghai")
ZURICH_TZ    = ZoneInfo("Europe/Zurich")
FRANKFURT_TZ = ZoneInfo("Europe/Berlin")  # Frankfurt & Berlin share tz

CENTRAL_BANK_AGENCIES = {"FOMC", "ECB", "BOE", "BOC", "RBA", "RBNZ", "FED"}

# Feeds/URLs
BLS_ICS_URL        = "https://www.bls.gov/schedule/news_release/bls.ics"
EUROSTAT_ICS_URL   = "https://ec.europa.eu/eurostat/cache/RELEASE_CALENDAR/calendar_EN.ics"
STATS_NZ_ICS_URL   = "https://www.stats.govt.nz/release-calendar/calendar-export"

ONS_RSS_CANDIDATES = [
    "https://www.ons.gov.uk/releasecalendar?format=rss",
    "https://www.ons.gov.uk/releasecalendar?rss",
    "https://www.ons.gov.uk/rss?content_type=releasecalendar&size=50",
]
ONS_HTML_URL       = "https://www.ons.gov.uk/releasecalendar"

STATCAN_ATOM_URLS  = [
    "https://www150.statcan.gc.ca/n1/dq-atom-eng.xml",      # Main
    "https://www150.statcan.gc.ca/n1/rss/dai-quo/0-eng.atom",  # Fallback
]

ABS_PAGES          = [
    "https://www.abs.gov.au/release-calendar/future-releases",
    "https://www.abs.gov.au/release-calendar/future-releases-calendar",
]

# Central banks
SECO_SCHEDULE_URL  = "https://www.seco.admin.ch/seco/en/home/wirtschaftslage---wirtschaftspolitik/Wirtschaftslage/konjunkturprognosen.html"
FED_CAL_URL        = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
ECB_CAL_URL        = "https://www.ecb.europa.eu/press/calendars/mgcgc/html/index.en.html"
BOE_CAL_URL        = "https://www.bankofengland.co.uk/monetary-policy-summary-and-minutes"
RBA_CAL_URL        = "https://www.rba.gov.au/monetary-policy/rba-board-minutes.html"
RBNZ_CAL_URL       = "https://www.rbnz.govt.nz/monetary-policy/official-cash-rate-decisions"

# Fan-out caps
MAX_ONS_TIMES         = 200
MAX_ONS_BLOCKS        = 300
MAX_STATCAN_ENTRIES   = 80

# Health floors (60-day window recommendation; WARN if below)
HEALTH_FLOORS = {
    "BLS_ICS": 15,
    "EUROSTAT_ICS": 20,
    "STATS_NZ_ICS": 20,
    "ONS_RSS": 5,
    "STATCAN_ATOM": 5,
    "ABS_HTML": 3,
    "FED_HTML": 1,
    "ECB": 1,
    "BOE_HTML": 1,
    "RBA_HTML": 1,
    "RBNZ_HTML": 1,
}

USER_AGENTS = [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:125.0) Gecko/20100101 Firefox/125.0",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15",
]

# Logging
logger = logging.getLogger("econ_calendar")

# ---------------------------
# Session / HTTP utilities
# ---------------------------

def build_session() -> requests.Session:
    s = requests.Session()
    s.headers.update({
        "User-Agent": USER_AGENTS[0],
        "Accept": "text/html,application/rss+xml,application/xml,text/xml,text/calendar;q=0.9,*/*;q=0.8",
        "Accept-Encoding": "gzip, deflate, br",
        "Connection": "keep-alive",
    })
    retry = Retry(
        total=5,
        backoff_factor=0.6,
        status_forcelist=(429, 500, 502, 503, 504),
        allowed_methods=frozenset(["GET", "HEAD"]),
        respect_retry_after_header=True,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=20, pool_maxsize=20)
    s.mount("http://", adapter)
    s.mount("https://", adapter)
    return s

CACHE_DIR = Path("http_cache")
CACHE_DIR.mkdir(exist_ok=True)

def _cache_key(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()

def cached_get(session: requests.Session, url: str, timeout: float = 12.0) -> Optional[requests.Response]:
    key = _cache_key(url)
    body_fp = CACHE_DIR / f"{key}.body"
    meta_fp = CACHE_DIR / f"{key}.meta.json"

    headers = {}
    if meta_fp.exists():
        try:
            meta = json.loads(meta_fp.read_text("utf-8"))
            if et := meta.get("etag"):
                headers["If-None-Match"] = et
            if lm := meta.get("last_modified"):
                headers["If-Modified-Since"] = lm
        except Exception:
            pass

    try:
        resp = session.get(url, headers=headers, timeout=timeout)
    except Exception as e:
        logger.warning(f"cached_get error {url}: {e}")
        return None

    if resp.status_code == 304 and body_fp.exists():
        class _R: pass
        r = _R(); r.ok = True; r.status_code = 200
        r.url = url; r.text = body_fp.read_text("utf-8"); r.content = r.text.encode("utf-8")
        return r

    if resp.ok:
        try:
            body_fp.write_text(resp.text, "utf-8")
            meta = {
                "etag": resp.headers.get("ETag"),
                "last_modified": resp.headers.get("Last-Modified"),
                "ts": time.time(),
                "url": url,
            }
            meta_fp.write_text(json.dumps(meta), "utf-8")
        except Exception:
            pass
        return resp

    logger.warning(f"cached_get failed {url}: {resp.status_code}")
    return None

_last_hit: Dict[str, float] = {}
MIN_DELAY = {  # polite per-host throttle (seconds)
    "www.ons.gov.uk": 1.2,
    "www150.statcan.gc.ca": 0.8,
    "www.abs.gov.au": 1.0,
    "www.bls.gov": 1.0,
    "ec.europa.eu": 0.6,
    "www.stats.govt.nz": 0.6,
    "www.federalreserve.gov": 0.6,
    "www.ecb.europa.eu": 0.6,
    "www.seco.admin.ch": 0.6,
    "www.bankofengland.co.uk": 0.6,
    "www.rba.gov.au": 0.6,
    "www.rbnz.govt.nz": 0.6,
}

def polite_get(session: requests.Session, url: str, timeout: float = 12.0) -> Optional[requests.Response]:
    # Rotate UA per request (helps avoid basic bot heuristics)
    session.headers["User-Agent"] = random.choice(USER_AGENTS)
    host = urlparse(url).netloc.lower()
    last = _last_hit.get(host, 0.0)
    delay = MIN_DELAY.get(host, 0.4)
    now = time.time()
    wait = (last + delay) - now
    if wait > 0:
        time.sleep(wait)
    _last_hit[host] = time.time()
    return cached_get(session, url, timeout=timeout)

# ---------------------------
# Data model
# ---------------------------

@dataclass
class Event:
    id: str
    source: str
    agency: str
    country: str
    title: str
    date_time_utc: datetime
    event_local_tz: str
    impact: str
    url: str
    extras: Dict[str, Any]

def make_id(country: str, agency: str, title: str, dt_utc: datetime) -> str:
    content = f"{country}|{agency}|{title}|{dt_utc.strftime('%Y-%m-%d')}"
    return hashlib.sha1(content.encode("utf-8")).hexdigest()[:16]

# ---------------------------
# Time / text helpers
# ---------------------------

def ensure_aware(dt: datetime, tz: ZoneInfo, default_hour: int = 0, default_min: int = 0) -> datetime:
    if dt.tzinfo is None:
        if dt.hour == 0 and dt.minute == 0 and dt.second == 0:
            dt = dt.replace(hour=default_hour, minute=default_min)
        dt = dt.replace(tzinfo=tz)
    return dt

def _within(dt_utc: datetime, start_utc: datetime, end_utc: datetime) -> bool:
    return start_utc <= dt_utc <= end_utc

_GENERIC_SKIP_RE = re.compile(r"^(view\s+current\s+release|read\s+more|learn\s+more)$", re.I)
def _clean_title(t: str) -> str:
    t = re.sub(r"\s+", " ", (t or "")).strip()
    return "" if _GENERIC_SKIP_RE.match(t) else t

def _nearest_link_and_title(node):
    a = node.find("a", href=True)
    if a:
        return a.get_text(" ", strip=True), a["href"]
    for sel in ("h1", "h2", "h3", "h4", "strong"):
        h = node.find(sel)
        if h and h.get_text(strip=True):
            a = h.find("a", href=True)
            if a:
                return a.get_text(" ", strip=True), a["href"]
            return h.get_text(" ", strip=True), None
    parent = node
    for _ in range(4):
        if not parent:
            break
        a = parent.find("a", href=True)
        if a and a.get_text(strip=True):
            return a.get_text(" ", strip=True), a["href"]
        for sel in ("h1", "h2", "h3", "h4", "strong"):
            h = parent.find(sel)
            if h and h.get_text(strip=True):
                a = h.find("a", href=True)
                if a:
                    return a.get_text(" ", strip=True), a["href"]
                return h.get_text(" ", strip=True), None
        parent = parent.parent
    return None, None

# ---------------------------
# ICS parsing (robust)
# ---------------------------

def _unfold_ics(text: str) -> List[str]:
    lines = text.splitlines()
    out = []
    for line in lines:
        if line.startswith((" ", "\t")) and out:
            out[-1] += line[1:]
        else:
            out.append(line)
    return out

def _parse_params(name_with_params: str) -> tuple[str, dict]:
    parts = name_with_params.split(";")
    prop = parts[0].upper()
    params = {}
    for p in parts[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.upper()] = v
    return prop, params

def _parse_ics_dt(value: str, params: dict, local_tz: ZoneInfo, default_h: int, default_m: int) -> datetime:
    if params.get("VALUE", "").upper() == "DATE" or re.fullmatch(r"\d{8}", value):
        dt = datetime.strptime(value, "%Y%m%d").replace(tzinfo=local_tz, hour=default_h, minute=default_m)
        return dt.astimezone(UTC)

    if value.endswith("Z"):
        dt = datetime.strptime(value[:-1], "%Y%m%dT%H%M%S").replace(tzinfo=UTC)
        return dt

    tzid = params.get("TZID")
    try:
        tz = ZoneInfo(tzid) if tzid else local_tz
    except Exception:
        tz = local_tz
    dt = datetime.strptime(value, "%Y%m%dT%H%M%S").replace(tzinfo=tz)
    return dt.astimezone(UTC)

def parse_ics_events(ics_text: str, local_tz: ZoneInfo, default_h: int, default_m: int) -> List[dict]:
    events = []
    cur = None
    for line in _unfold_ics(ics_text):
        if not line or ":" not in line:
            continue
        left, right = line.split(":", 1)
        if left == "BEGIN:VEVENT":
            cur = {}
            continue
        if left == "END:VEVENT":
            if cur and "SUMMARY" in cur and "DTSTART_UTC" in cur:
                events.append(cur)
            cur = None
            continue
        if cur is None:
            continue

        prop, params = _parse_params(left)
        if prop == "DTSTART":
            try:
                cur["DTSTART_UTC"] = _parse_ics_dt(right, params, local_tz, default_h, default_m)
            except Exception as e:
                logger.debug(f"ICS DTSTART parse failed: {e}")
        elif prop in ("SUMMARY", "URL", "DESCRIPTION", "UID", "LOCATION"):
            cur.setdefault(prop, right)
    return events

# ---------------------------
# Impact classification
# ---------------------------

IMPACT_HIGH_RE = [
    re.compile(r"\b(gdp|gross\s+domestic\s+product)\b", re.I),
    re.compile(r"\b(cpi|hicp|inflation|consumer\s+price\s+index)\b", re.I),
    re.compile(r"\b(ppi|producer\s+price\s+index)\b", re.I),
    re.compile(r"\b(pce|personal\s+consumption\s+expenditure)\b", re.I),
    re.compile(r"\bnonfarm\b|\bemployment\s+situation\b|\bunemployment\s+rate\b", re.I),
    re.compile(r"\b(jobless\s+claims|initial\s+claims)\b", re.I),
    re.compile(r"\bjolts\b", re.I),
    re.compile(r"\bjob\s*openings?\b", re.I),
    re.compile(r"\b(rate\s+decision|policy\s+rate|interest\s+rate)\b", re.I),
    re.compile(r"\b(fomc|mpc|ecb|ocr\s+decision|cash\s+rate)\b", re.I),
    re.compile(r"\bindustrial\s+production\b", re.I),
    re.compile(r"\bcurrent\s+account\b", re.I),
]
IMPACT_MEDIUM_RE = [
    re.compile(r"\bretail\s+(trade|sales)\b", re.I),
    re.compile(r"\bretail\s+sales\s+(advance|preliminary)\b", re.I),
    re.compile(r"\b(real\s+|average\s+)?earnings\b", re.I),
    re.compile(r"\baverage\s+weekly\s+earnings\b", re.I),
    re.compile(r"\bhousing\s+(starts|permits)\b", re.I),
    re.compile(r"\bnew\s+home\s+sales\b", re.I),
    re.compile(r"\bexisting\s+home\s+sales\b", re.I),
    re.compile(r"\b(ism|pmi)\b", re.I),
    re.compile(r"\bmanufacturing\s+(pmi|index)\b", re.I),
    re.compile(r"\bfactory\s+orders\b", re.I),
    re.compile(r"\bconsumer\s+(confidence|sentiment)\b", re.I),
    re.compile(r"\buniversity\s+of\s+michigan\b", re.I),
    re.compile(r"\btrade\s+balance\b", re.I),
    re.compile(r"\b(imports|exports)\b", re.I),
]

def classify_event(title: str, agency: str | None = None) -> str:
    if agency and agency.upper() in CENTRAL_BANK_AGENCIES:
        return "High"
    t = (title or "").strip().lower()
    for rx in IMPACT_HIGH_RE:
        if rx.search(t):
            return "High"
    for rx in IMPACT_MEDIUM_RE:
        if rx.search(t):
            return "Medium"
    return "Low"

# ---------------------------
# Source-specific helpers
# ---------------------------

def _ons_page_dt(session, href):
    r = polite_get(session, href)
    if not r:
        return None
    soup = BeautifulSoup(r.text, "lxml")
    t = soup.select_one("time[datetime]")
    if t and t.get("datetime"):
        return dateparser.parse(t["datetime"])
    m = soup.select_one('meta[property="article:published_time"][content]')
    if m:
        return dateparser.parse(m["content"])
    m = soup.select_one('meta[name="dcterms.issued"][content]')
    if m:
        base = dateparser.parse(m["content"])
        return base.replace(hour=7, minute=0)
    return None

def _statcan_page_dt(session, href):
    r = polite_get(session, href)
    if not r:
        return None
    soup = BeautifulSoup(r.text, "lxml")
    t = soup.select_one("time[datetime]")
    if t and t.get("datetime"):
        return dateparser.parse(t["datetime"])
    m = soup.select_one('meta[property="article:published_time"][content]')
    if m:
        return dateparser.parse(m["content"])
    m = soup.select_one('meta[name="dcterms.issued"][content], meta[name="dcterms.date"][content]')
    if m:
        base = dateparser.parse(m["content"])
        return base.replace(hour=10, minute=0)
    return None

# ---------------------------
# Fetchers — Core macro
# ---------------------------

def fetch_bls_events(session, start_utc, end_utc) -> List[Event]:
    """BLS ICS calendar."""
    events: List[Event] = []
    url = BLS_ICS_URL
    r = polite_get(session, url)
    if not r or "BEGIN:VCALENDAR" not in r.text:
        logger.warning("BLS ICS fetch failed")
        return events
    for ve in parse_ics_events(r.text, NY_TZ, 8, 30):
        dt_utc = ve["DTSTART_UTC"]
        if not _within(dt_utc, start_utc, end_utc):
            continue
        title = ve["SUMMARY"]
        href = ve.get("URL", url)
        events.append(Event(
            id=make_id("US", "BLS", title, dt_utc),
            source="BLS_ICS", agency="BLS", country="US",
            title=title, date_time_utc=dt_utc, event_local_tz="America/New_York",
            impact=classify_event(title, "BLS"), url=href, extras={}
        ))
    logger.info(f"BLS_ICS: {len(events)}")
    return events

def fetch_eurostat_events(session, start_utc, end_utc) -> List[Event]:
    events: List[Event] = []
    url = EUROSTAT_ICS_URL
    r = polite_get(session, url, timeout=20)
    if not r or "BEGIN:VCALENDAR" not in r.text:
        logger.warning("Eurostat ICS fetch failed")
        return events
    for ve in parse_ics_events(r.text, BRUSSELS_TZ, 11, 0):
        dt_utc = ve["DTSTART_UTC"]
        if not _within(dt_utc, start_utc, end_utc):
            continue
        title = ve["SUMMARY"]
        href = ve.get("URL", url)
        events.append(Event(
            id=make_id("EU", "EUROSTAT", title, dt_utc),
            source="EUROSTAT_ICS", agency="EUROSTAT", country="EU",
            title=title, date_time_utc=dt_utc, event_local_tz="Europe/Brussels",
            impact=classify_event(title, "EUROSTAT"), url=href, extras={}
        ))
    logger.info(f"EUROSTAT_ICS: {len(events)}")
    return events

def fetch_stats_nz_events(session, start_utc, end_utc) -> List[Event]:
    events: List[Event] = []
    url = STATS_NZ_ICS_URL
    r = polite_get(session, url, timeout=30)
    if not r or "BEGIN:VCALENDAR" not in r.text:
        logger.warning("Stats NZ ICS fetch failed")
        return events
    for ve in parse_ics_events(r.text, AUCK_TZ, 10, 45):
        dt_utc = ve["DTSTART_UTC"]
        if not _within(dt_utc, start_utc, end_utc):
            continue
        title = ve["SUMMARY"]
        href = ve.get("URL", url)
        events.append(Event(
            id=make_id("NZ", "STATS_NZ", title, dt_utc),
            source="STATS_NZ_ICS", agency="STATS_NZ", country="NZ",
            title=title, date_time_utc=dt_utc, event_local_tz="Pacific/Auckland",
            impact=classify_event(title, "STATS_NZ"), url=href, extras={}
        ))
    logger.info(f"STATS_NZ_ICS: {len(events)}")
    return events

def fetch_ons_events(session, start_utc, end_utc) -> List[Event]:
    """ONS (UK) — RSS first, then robust HTML fallback."""
    events: List[Event] = []
    source, agency, country = "ONS_RSS", "ONS", "GB"

    # --- Try RSS feeds ---
    feed = None
    for url in ONS_RSS_CANDIDATES:
        r = polite_get(session, url)
        if r and r.ok:
            parsed = feedparser.parse(r.content)
            if parsed.entries:
                feed = parsed
                break
    if feed:
        for entry in feed.entries:
            title = _clean_title(entry.get("title") or "ONS Release")
            if not title:
                continue
            href = entry.get("link") or ONS_HTML_URL
            dt_local = None
            for k in ("published", "updated", "dc_date", "prism_publicationDate"):
                if entry.get(k):
                    try:
                        dt_local = dateparser.parse(entry[k]); break
                    except Exception:
                        pass
            page_dt = _ons_page_dt(session, href)
            if page_dt:
                dt_local = page_dt
            if not dt_local:
                continue
            dt_local = ensure_aware(dt_local, LON_TZ, 7, 0)
            dt_utc = dt_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            events.append(Event(
                id=make_id(country, agency, title, dt_utc),
                source=source, agency=agency, country=country,
                title=title, date_time_utc=dt_utc, event_local_tz="Europe/London",
                impact=classify_event(title, agency), url=href, extras={}
            ))
        if events:
            logger.info(f"ONS_RSS: {len(events)} (RSS)")
            return events

    # --- HTML fallback ---
    url = ONS_HTML_URL
    r = polite_get(session, url)
    if not r:
        return events
    soup = BeautifulSoup(r.text, "lxml")

    # 1) <time> tags (capped)
    for t in soup.select("time[datetime]")[:MAX_ONS_TIMES]:
        try:
            dt_local = ensure_aware(dateparser.parse(t["datetime"]), LON_TZ, 7, 0)
        except Exception:
            continue
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        title, href = _nearest_link_and_title(t)
        title = _clean_title(title)
        if not title:
            continue
        href = urljoin(url, href) if href else url
        events.append(Event(
            id=make_id(country, agency, title, dt_utc),
            source=source, agency=agency, country=country,
            title=title, date_time_utc=dt_utc, event_local_tz="Europe/London",
            impact=classify_event(title, agency), url=href,
            extras={"extracted_via": "html-time"}
        ))

    if events:
        logger.info(f"ONS_RSS: {len(events)} (HTML time[])")
        return events

    # 2) Text blocks with "Release date:" (capped)
    for block in soup.select("li, article, div")[:MAX_ONS_BLOCKS]:
        txt = block.get_text(" ", strip=True)
        m = re.search(r"Release date:\s*([0-9A-Za-z,: ]+)", txt, flags=re.I)
        if not m:
            continue
        try:
            dt_local = ensure_aware(dateparser.parse(m.group(1)), LON_TZ, 7, 0)
        except Exception:
            continue
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        title, href = _nearest_link_and_title(block)
        title = _clean_title(title)
        if not title:
            continue
        href = urljoin(url, href) if href else url
        events.append(Event(
            id=make_id(country, agency, title, dt_utc),
            source=source, agency=agency, country=country,
            title=title, date_time_utc=dt_utc, event_local_tz="Europe/London",
            impact=classify_event(title, agency), url=href,
            extras={"extracted_via": "html-text"}
        ))

    logger.info(f"ONS_RSS: {len(events)} (HTML fallback)")
    return events

def fetch_statcan_events(session, start_utc, end_utc) -> List[Event]:
    """StatCan — Atom feed + page-level datetime (Toronto tz)."""
    events: List[Event] = []
    source, agency, country = "STATCAN_ATOM", "STATCAN", "CA"

    for url in STATCAN_ATOM_URLS:
        r = polite_get(session, url)
        if not r:
            continue
        feed = feedparser.parse(r.content)
        for i, entry in enumerate(feed.entries):
            if i >= MAX_STATCAN_ENTRIES:
                break
            title = _clean_title(entry.get("title") or "")
            if not title:
                continue
            href = entry.get("link") or url
            dt_local = _statcan_page_dt(session, href)
            if not dt_local:
                for k in ("published", "updated"):
                    if entry.get(k):
                        try:
                            dt_local = dateparser.parse(entry[k]); break
                        except Exception:
                            pass
            if not dt_local:
                continue
            dt_local = ensure_aware(dt_local, TORONTO_TZ, 10, 0)
            dt_utc = dt_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            events.append(Event(
                id=make_id(country, agency, title, dt_utc),
                source=source, agency=agency, country=country,
                title=title, date_time_utc=dt_utc, event_local_tz="America/Toronto",
                impact=classify_event(title, agency), url=href, extras={}
            ))
        if events:
            break
    logger.info(f"STATCAN_ATOM: {len(events)}")
    return events

def fetch_abs_events(session, start_utc, end_utc) -> List[Event]:
    events: List[Event] = []
    valid_paths = ("/statistics/", "/media-releases/", "/articles/")
    for url in ABS_PAGES:
        r = polite_get(session, url)
        if not r or not getattr(r, "ok", False):
            continue
        soup = BeautifulSoup(r.text, "lxml")
        for tnode in soup.select("time[datetime]"):
            dt_text = tnode.get("datetime") or tnode.get_text(" ", strip=True)
            if not dt_text:
                continue
            try:
                dt_local = ensure_aware(dateparser.parse(dt_text), SYDNEY_TZ, 11, 30)
            except Exception:
                continue
            dt_utc = dt_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            title, href = _nearest_link_and_title(tnode)
            title = _clean_title(title)
            if not title:
                continue
            href = urljoin(url, href) if href else url
            if not any(p in href for p in valid_paths):
                continue
            events.append(Event(
                id=make_id("AU", "ABS", title, dt_utc),
                source="ABS_HTML", agency="ABS", country="AU",
                title=title, date_time_utc=dt_utc, event_local_tz="Australia/Sydney",
                impact=classify_event(title, "ABS"), url=href, extras={}
            ))
    logger.info(f"ABS_HTML: {len(events)}")
    return events

# ---------------------------
# Central banks
# ---------------------------

def fetch_fed_events(session, start_utc, end_utc) -> List[Event]:
    events: List[Event] = []
    r = polite_get(session, FED_CAL_URL)
    if not r:
        logger.info("FED_HTML: 0 (fetch fail)")
        return events
    soup = BeautifulSoup(r.text, "lxml")
    for el in soup.find_all(["td", "div", "span"], string=re.compile(r"\d{4}", re.I)):
        text = el.get_text(" ", strip=True)
        if re.search(r"(january|february|march|april|may|june|july|august|september|october|november|december)", text, re.I):
            try:
                dt_local = ensure_aware(dateparser.parse(text), NY_TZ, 14, 0)
            except Exception:
                continue
            dt_utc = dt_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            title = "FOMC Meeting"
            events.append(Event(
                id=make_id("US", "FED", title, dt_utc),
                source="FED_HTML", agency="FED", country="US",
                title=title, date_time_utc=dt_utc, event_local_tz="America/New_York",
                impact=classify_event(title, "FED"), url=FED_CAL_URL, extras={}
            ))
    logger.info(f"FED_HTML: {len(events)}")
    return events

def fetch_ecb_events(session, start_utc, end_utc) -> List[Event]:
    events: List[Event] = []
    r = polite_get(session, ECB_CAL_URL)
    if not r:
        logger.info("ECB: 0 (fetch fail)")
        return events
    soup = BeautifulSoup(r.text, "lxml")
    for el in soup.find_all(["td", "div", "span"]):
        text = el.get_text(" ", strip=True)
        if "governing council" in text.lower() or "monetary policy" in text.lower():
            try:
                dt_local = ensure_aware(dateparser.parse(text), FRANKFURT_TZ, 13, 45)
            except Exception:
                continue
            dt_utc = dt_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            title = "ECB Governing Council Meeting"
            events.append(Event(
                id=make_id("EU", "ECB", title, dt_utc),
                source="ECB", agency="ECB", country="EU",
                title=title, date_time_utc=dt_utc, event_local_tz="Europe/Berlin",
                impact=classify_event(title, "ECB"), url=ECB_CAL_URL, extras={}
            ))
    logger.info(f"ECB: {len(events)}")
    return events

def fetch_boe_events(session, start_utc, end_utc) -> List[Event]:
    """BoE MPC schedule (HTML)."""
    events: List[Event] = []
    url = BOE_CAL_URL
    r = polite_get(session, url)
    if not r:
        return events
    soup = BeautifulSoup(r.text, "lxml")
    for t in soup.select("time[datetime]"):
        try:
            dt_local = ensure_aware(dateparser.parse(t["datetime"]), LON_TZ, 12, 0)
        except Exception:
            continue
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        events.append(Event(
            id=make_id("GB", "BOE", "MPC Meeting", dt_utc),
            source="BOE_HTML", agency="BOE", country="GB",
            title="MPC Meeting", date_time_utc=dt_utc, event_local_tz="Europe/London",
            impact="High", url=url, extras={}
        ))
    logger.info(f"BOE_HTML: {len(events)}")
    return events

def fetch_rba_events(session, start_utc, end_utc) -> List[Event]:
    """RBA rate decisions (HTML)."""
    events: List[Event] = []
    url = RBA_CAL_URL
    r = polite_get(session, url)
    if not r:
        return events
    soup = BeautifulSoup(r.text, "lxml")
    for t in soup.select("time[datetime]"):
        try:
            dt_local = ensure_aware(dateparser.parse(t["datetime"]), SYDNEY_TZ, 14, 30)
        except Exception:
            continue
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        events.append(Event(
            id=make_id("AU", "RBA", "Cash Rate Decision", dt_utc),
            source="RBA_HTML", agency="RBA", country="AU",
            title="Cash Rate Decision", date_time_utc=dt_utc, event_local_tz="Australia/Sydney",
            impact="High", url=url, extras={}
        ))
    logger.info(f"RBA_HTML: {len(events)}")
    return events

def fetch_rbnz_events(session, start_utc, end_utc) -> List[Event]:
    """RBNZ OCR decisions (HTML)."""
    events: List[Event] = []
    url = RBNZ_CAL_URL
    r = polite_get(session, url)
    if not r:
        return events
    soup = BeautifulSoup(r.text, "lxml")
    for t in soup.select("time[datetime]"):
        try:
            dt_local = ensure_aware(dateparser.parse(t["datetime"]), AUCK_TZ, 14, 0)
        except Exception:
            continue
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        events.append(Event(
            id=make_id("NZ", "RBNZ", "OCR Decision", dt_utc),
            source="RBNZ_HTML", agency="RBNZ", country="NZ",
            title="OCR Decision", date_time_utc=dt_utc, event_local_tz="Pacific/Auckland",
            impact="High", url=url, extras={}
        ))
    logger.info(f"RBNZ_HTML: {len(events)}")
    return events

# ---------------------------
# Optional global expansion (simple versions)
# ---------------------------

def fetch_japan_esri_events(session, start_utc, end_utc) -> List[Event]:
    events: List[Event] = []
    url = "https://www.esri.cao.go.jp/en/stat/shouhi/shouhi-e.html"
    r = polite_get(session, url)
    if not r:
        logger.info("JAPAN_ESRI: 0 (fetch fail)")
        return events
    soup = BeautifulSoup(r.text, "lxml")
    for el in soup.find_all(["td", "div", "span"]):
        text = el.get_text(" ", strip=True)
        if "consumer confidence" in text.lower() and re.search(r"\d{4}", text):
            try:
                dt_local = ensure_aware(dateparser.parse(text), TOKYO_TZ, 14, 0)
            except Exception:
                continue
            dt_utc = dt_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            events.append(Event(
                id=make_id("JP", "ESRI", "Consumer Confidence Index", dt_utc),
                source="JAPAN_ESRI", agency="ESRI", country="JP",
                title="Consumer Confidence Index", date_time_utc=dt_utc, event_local_tz="Asia/Tokyo",
                impact=classify_event("Consumer Confidence Index", "ESRI"), url=url, extras={}
            ))
    logger.info(f"JAPAN_ESRI: {len(events)}")
    return events

def fetch_china_nbs_events(session, start_utc, end_utc) -> List[Event]:
    events: List[Event] = []
    url = "https://www.stats.gov.cn/english/PressRelease/ReleaseCalendar/"
    r = polite_get(session, url)
    if not r:
        logger.info("CHINA_NBS: 0 (fetch fail)")
        return events
    soup = BeautifulSoup(r.text, "lxml")
    for el in soup.find_all(["td", "div", "span", "a"]):
        text = el.get_text(" ", strip=True)
        if any(k in text.lower() for k in ["gdp", "cpi", "pmi", "unemployment"]):
            try:
                dt_local = ensure_aware(dateparser.parse(text), BEIJING_TZ, 10, 0)
            except Exception:
                continue
            dt_utc = dt_local.astimezone(UTC)
            if not _within(dt_utc, start_utc, end_utc):
                continue
            title = text[:100]
            events.append(Event(
                id=make_id("CN", "NBS", title, dt_utc),
                source="CHINA_NBS", agency="NBS", country="CN",
                title=title, date_time_utc=dt_utc, event_local_tz="Asia/Shanghai",
                impact=classify_event(title, "NBS"), url=url, extras={}
            ))
    logger.info(f"CHINA_NBS: {len(events)}")
    return events

def fetch_switzerland_seco_events(session, start_utc, end_utc) -> List[Event]:
    events: List[Event] = []
    r = polite_get(session, SECO_SCHEDULE_URL)
    if not r:
        logger.info("SECO_HTML: 0 (fetch fail)")
        return events
    soup = BeautifulSoup(r.text, "lxml")
    txt = soup.get_text("\n", strip=True)
    for m in re.finditer(r"(?im)\b(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday),\s+([0-9]{1,2}\s+\w+\s+20[0-9]{2}),\s*([0-9]{1,2}:[0-9]{2})", txt):
        date_s, time_s = m.group(1), m.group(2)
        try:
            dt_local = ensure_aware(dateparser.parse(f"{date_s} {time_s}"), ZURICH_TZ, 9, 0)
        except Exception:
            continue
        dt_utc = dt_local.astimezone(UTC)
        if not _within(dt_utc, start_utc, end_utc):
            continue
        title = "SECO Economic Forecast"
        events.append(Event(
            id=make_id("CH", "SECO", title, dt_utc),
            source="SECO_HTML", agency="SECO", country="CH",
            title=title, date_time_utc=dt_utc, event_local_tz="Europe/Zurich",
            impact=classify_event(title, "SECO"), url=SECO_SCHEDULE_URL, extras={"schedule": "Provisional"}
        ))
    logger.info(f"SECO_HTML: {len(events)}")
    return events

# ---------------------------
# Orchestration
# ---------------------------

def deduplicate_events(events: List[Event]) -> List[Event]:
    seen = set()
    out = []
    for e in events:
        if e.id in seen:
            continue
        seen.add(e.id); out.append(e)
    return out

def run_parallel(session, start_utc, end_utc, fetchers: Iterable) -> List[Event]:
    results: List[Event] = []
    with ThreadPoolExecutor(max_workers=6) as ex:
        futs = { ex.submit(f, session, start_utc, end_utc): f.__name__ for f in fetchers }
        for fut in as_completed(futs):
            name = futs[fut]
            try:
                res = fut.result()
                if res:
                    results.extend(res)
            except Exception as e:
                logger.error(f"{name}: error {e}")
    return results

def gather_macro_events(session, start_utc, end_utc, global_sources=False) -> List[Event]:
    core = [
        fetch_bls_events,
        fetch_eurostat_events,
        fetch_stats_nz_events,
        fetch_ons_events,
        fetch_statcan_events,
        fetch_abs_events,
    ]
    glb = [fetch_japan_esri_events, fetch_china_nbs_events, fetch_switzerland_seco_events] if global_sources else []
    return run_parallel(session, start_utc, end_utc, core + glb)

def gather_central_bank_events(session, start_utc, end_utc) -> List[Event]:
    cbs = [fetch_fed_events, fetch_ecb_events, fetch_boe_events, fetch_rba_events, fetch_rbnz_events]
    return run_parallel(session, start_utc, end_utc, cbs)

# ---------------------------
# Health
# ---------------------------

def health_report(events: List[Event], start_utc: datetime, end_utc: datetime, warn_only: bool = True) -> bool:
    ok = True
    counts: Dict[str, int] = {}
    for e in events:
        counts[e.source] = counts.get(e.source, 0) + 1

    # Global floor
    if (end_utc - start_utc).days >= 30:
        if len(events) < 100:
            logger.warning(f"Health: global floor FAIL — {len(events)} < 100 for 30–60d window")
            ok = False
        else:
            logger.info(f"Health: global floor PASS — {len(events)} ≥ 100")

    # Per-source floors (WARN only)
    for src, floor in HEALTH_FLOORS.items():
        c = counts.get(src, 0)
        if c < floor:
            logger.warning(f"Health: {src} WARN — {c} < {floor}")
            if not warn_only:
                ok = False
        else:
            logger.info(f"Health: {src} OK — {c} ≥ {floor}")
    return ok

# ---------------------------
# Main
# ---------------------------

def main():
    p = argparse.ArgumentParser(description="Economic Calendar Scraper — Final (Ultimate + Codex Patches)")
    p.add_argument("--since", type=int, default=0, help="Days since today (0=today)")
    p.add_argument("--until", type=int, default=60, help="Days until from today")
    p.add_argument("--global", dest="global_sources", action="store_true", help="Include global expansion sources")
    p.add_argument("--central-banks", action="store_true", help="Include central bank events")
    p.add_argument("--health", action="store_true", help="Print health report")
    p.add_argument("--out-json", default="events.json", help="JSON output file")
    p.add_argument("--out-jsonl", help="Optional JSONL output")
    p.add_argument("--log-level", default="INFO", choices=["DEBUG","INFO","WARNING","ERROR"])
    args = p.parse_args()

    logging.basicConfig(
        level=getattr(logging, args.log_level),
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[logging.StreamHandler(), logging.FileHandler("scraper.log", encoding="utf-8")]
    )

    global logger
    logger = logging.getLogger("econ_calendar")

    logger.info("=== Economic Calendar Scraper — Final (Ultimate + Codex Patches) ===")
    logger.info(f"Window: {args.since} .. {args.until} days  |  Global: {args.global_sources}  |  CB: {args.central_banks}")

    today = datetime.now(UTC).replace(hour=0, minute=0, second=0, microsecond=0)
    start_utc = today + timedelta(days=args.since)
    end_utc   = today + timedelta(days=args.until)

    session = build_session()

    all_events: List[Event] = []
    all_events.extend(gather_macro_events(session, start_utc, end_utc, args.global_sources))
    if args.central_banks:
        all_events.extend(gather_central_bank_events(session, start_utc, end_utc))

    unique = deduplicate_events(all_events)
    unique.sort(key=lambda e: e.date_time_utc)

    logger.info(f"Collected: {len(all_events)}  |  Unique: {len(unique)}")

    if args.health:
        health_report(unique, start_utc, end_utc, warn_only=True)

    # Prepare output
    data = [asdict(e) for e in unique]
    for d in data:
        if isinstance(d["date_time_utc"], datetime):
            d["date_time_utc"] = d["date_time_utc"].isoformat()

    Path(args.out_json).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

    if args.out_jsonl:
        Path(args.out_jsonl).parent.mkdir(parents=True, exist_ok=True)
        with open(args.out_jsonl, "w", encoding="utf-8") as f:
            for d in data:
                f.write(json.dumps(d, ensure_ascii=False) + "\n")

    logger.info(f"Wrote: {args.out_json}" + (f"  &  {args.out_jsonl}" if args.out_jsonl else ""))

if __name__ == "__main__":
    main()

# --- Quick smoke test (example) ---
# pip install requests feedparser beautifulsoup4 lxml python-dateutil
# python economic_calendar_scraper_final_codex_patched.py --since 0 --until 60 --global --central-banks --health \
#   --out-json out/events.json --out-jsonl out/events.jsonl --log-level INFO
