# Stats Checklist

- Confirm the dashboard card group renders inside the journal shell.
- Confirm the dashboard reads from the authenticated `/api/journal/stats` path rather than the paginated list response.
- Confirm the equity chart loads the full authenticated trade set rather than only the current table page.
- Confirm unauthenticated access shows a clear auth-required error.
- Confirm closed trades count only fully matched entry and exit quantity.
- Confirm partially closed trades count only trades with at least one exit leg and remaining size still open.
- Confirm open trades count only trades with no exit legs recorded yet.
- Confirm net PnL (closed) excludes open and partially closed trades.
- Confirm average resolved R includes only closed or partially closed trades with `risk_per_trade` defined.
- Confirm the dashboard copy explains that unrealized mark-to-market is excluded.
- Confirm the chart, cards, and labels remain readable at tablet and mobile widths.
