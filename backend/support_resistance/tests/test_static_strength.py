# coding: utf-8
import pytest

from support_resistance.static_strength import label_static_strength


@pytest.mark.parametrize("touch_count,expected", [
    (0, "weak"),
    (5, "weak"),
    (9, "weak"),
    (10, "medium"),
    (15, "medium"),
    (19, "medium"),
    (20, "strong"),
    (50, "strong"),
])
def test_label_static_strength(touch_count, expected):
    assert label_static_strength(touch_count) == expected


def test_negative_touch_count_raises():
    with pytest.raises(ValueError):
        label_static_strength(-1)


def test_none_touch_count_raises():
    with pytest.raises(ValueError):
        label_static_strength(None)
