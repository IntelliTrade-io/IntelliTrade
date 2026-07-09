"""Selector-compat HTML table/list helpers (fixes CSS :matches() issues).

Moved verbatim from the monolith (plan 6.3); only formatting normalized.
"""

from __future__ import annotations

import re

try:
    from bs4 import BeautifulSoup
except ImportError:
    BeautifulSoup = None

try:
    from lxml import html as lxml_html
except ImportError:
    lxml_html = None


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
