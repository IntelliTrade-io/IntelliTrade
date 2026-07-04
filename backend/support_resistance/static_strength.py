# coding: utf-8
"""
Static zone strength labelling.

Labels a support zone by how many times it has been touched. Thresholds are
fixed by the locked model (locked_phase39_config.json -> static_zone_labels):

    weak:    touch_count < 10
    medium:  10 <= touch_count < 20
    strong:  touch_count >= 20
"""

from typing import Literal

StaticStrength = Literal["weak", "medium", "strong"]

WEAK_MAX_EXCLUSIVE = 10   # touch_count < 10        -> weak
STRONG_MIN = 20           # touch_count >= 20       -> strong


def label_static_strength(touch_count: int) -> StaticStrength:
    """Map a touch count to weak / medium / strong.

    >>> label_static_strength(5)
    'weak'
    >>> label_static_strength(10)
    'medium'
    >>> label_static_strength(19)
    'medium'
    >>> label_static_strength(20)
    'strong'
    """
    if touch_count is None:
        raise ValueError("touch_count is required to label static strength")
    tc = int(touch_count)
    if tc < 0:
        raise ValueError(f"touch_count cannot be negative: {tc}")
    if tc < WEAK_MAX_EXCLUSIVE:
        return "weak"
    if tc < STRONG_MIN:
        return "medium"
    return "strong"
