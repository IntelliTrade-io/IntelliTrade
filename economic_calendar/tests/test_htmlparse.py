"""Pin selector-compat HTML helpers."""

import pytest

bs4 = pytest.importorskip("bs4")
from bs4 import BeautifulSoup

from economic_calendar.htmlparse import broad_li_filter, find_rows_by_header_keywords, rows_by_header_xpath

TABLE_HTML = """
<html><body>
<table>
  <tr><th>Name</th><th>Value</th></tr>
  <tr><td>ignored table</td><td>1</td></tr>
</table>
<table>
  <tr><th>Release Date</th><th>Publication</th></tr>
  <tr><td>2026-07-10</td><td>CPI</td></tr>
  <tr><td>2026-07-11</td><td>PPI</td></tr>
</table>
<section><ul>
  <li>CPI release announcement</li>
  <li>Garden party</li>
</ul></section>
</body></html>
"""


class TestFindRows:
    def test_matches_table_by_header_keyword(self):
        soup = BeautifulSoup(TABLE_HTML, "html.parser")
        rows = find_rows_by_header_keywords(soup, ["table"], ["release date"])
        assert len(rows) == 2
        assert "CPI" in rows[0].get_text()

    def test_no_match_empty(self):
        soup = BeautifulSoup(TABLE_HTML, "html.parser")
        assert find_rows_by_header_keywords(soup, ["table"], ["nonexistent"]) == []


class TestBroadLiFilter:
    def test_regex_filters_items(self):
        soup = BeautifulSoup(TABLE_HTML, "html.parser")
        items = broad_li_filter(soup, r"\bcpi\b")
        assert len(items) == 1
        assert "CPI" in items[0].get_text()


class TestXpathRows:
    def test_xpath_fallback(self):
        pytest.importorskip("lxml")
        rows = rows_by_header_xpath(TABLE_HTML.encode(), ["release date"])
        assert len(rows) == 2

    def test_no_match_empty(self):
        pytest.importorskip("lxml")
        assert rows_by_header_xpath(TABLE_HTML.encode(), ["zzz"]) == []
