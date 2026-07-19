# coding: utf-8
"""
IntelliTrade CSM Public Review pipeline.

A downstream, calculation-neutral pipeline that turns qualifying Daily CSM
snapshots into automated "What Happened Next?" public reviews. It never touches
the scanner's calculations; it reads the append-only snapshot history plus its
own H4 candle archive and produces deterministic, versioned outcomes.

See docs/csm-public-reviews.md and claudeLoad/CSM_REVIEW_PLAN.md.
"""
