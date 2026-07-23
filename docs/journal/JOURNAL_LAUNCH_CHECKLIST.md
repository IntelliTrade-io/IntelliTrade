# IntelliJournal Launch Checklist

- [ ] Review and apply `010_intellijournal.sql` to the target Supabase project.
- [ ] Confirm all eight tables, indexes, RPCs, RLS policies, and grants.
- [ ] Confirm private `journal-screenshots` bucket settings and object policies.
- [ ] Run two-user ownership and cross-user denial checks.
- [ ] Confirm active and trialing users are allowed; unpaid, cancelled, anonymous, and expired users are denied.
- [ ] Run focused Journal tests, full tests, lint, typecheck, and production build.
- [ ] Execute every browser-smoke step in `JOURNAL_TESTING_HANDOFF.md`.
- [ ] Verify direct links for home, setup, add trade, detail, reviews, and exports.
- [ ] Verify CSV/JSON content types, filenames, escaping, empty output, and exact field order.
- [ ] Verify screenshot upload, unavailable-media state, and delete cleanup warning behavior.
- [ ] Verify mobile and desktop layout, keyboard navigation, labels, focus, and destructive confirmation.
- [ ] Confirm monitoring, rollback owner, migration backup, and production go/no-go approval.
