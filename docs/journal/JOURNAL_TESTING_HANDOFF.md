# IntelliJournal Testing Handoff

## Automated

```powershell
npm.cmd test -- lib/journal
npm.cmd test
npm.cmd run lint
npm.cmd run typecheck
npm.cmd run build
```

The Journal unit suite covers calculations, normalization, Zod contracts, repository mappings,
exports, review snapshots, screenshot validation/path generation, and prerequisite behavior.
Existing IntelliTrade tests protect entitlement helpers and dashboard behavior.

## Local Browser Smoke

Use a local Supabase project with the migration applied and a paid test subscription:

1. Sign in and open `/dashboardv2`.
2. Add IntelliJournal and open its full workspace.
3. Create account/instrument prerequisites and an optional strategy.
4. Add a multi-leg trade, open detail, edit top-level fields, and replace all legs.
5. Upload PNG/JPEG/WebP screenshots and verify signed display.
6. Verify realized statistics/equity, save a review, and download CSV/JSON exports.
7. Delete the trade with confirmation and verify the empty/not-found states.
8. Repeat access as anonymous, unpaid, and a different paid user.

True browser, hosted RLS, and Storage verification must not be claimed until this sequence is run
against a configured environment.
