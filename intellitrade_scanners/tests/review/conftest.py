# coding: utf-8
"""Fixtures for the CSM review tests (builders live in factories.py)."""

from __future__ import annotations

import pytest

from factories import FakeClient


@pytest.fixture
def fake_client() -> FakeClient:
    return FakeClient()
