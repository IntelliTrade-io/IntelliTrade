# Exports Checklist

- Open `/journal/exports` and confirm the authenticated export form renders inside the real journal shell.
- Confirm the form supports `trades` and `reviews` resources plus `csv` and `json` formats.
- Confirm invalid date ranges show a validation error before download.
- Download a trades CSV export and confirm it contains trade-level rows only, not screenshot/media data or separate leg rows.
- Download a trades JSON export and confirm it includes the documented scope and notes metadata.
- Download a reviews export and confirm it includes persisted review rows plus the normalized stored `auto_stats` snapshot only.
- Confirm the optional review period filter affects reviews exports only.
- Confirm exports are user-scoped by authenticating as one user and verifying no cross-user data is exposed.
- Confirm failed export requests show an explicit error state.
- Confirm the page clearly states that screenshots/media, attachments, admin-style exports, and advanced analytics are out of scope.
