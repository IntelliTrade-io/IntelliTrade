# IntelliJournal Developer Launch Handoff

## Architecture

IntelliJournal is integrated as a paid IntelliTrade dashboard module. The compact panel lives in
`components/dashboardv2/modules/IntelliJournalModule.tsx`; full workflows live under
`/dashboardv2/journal`. JSON and download endpoints live under `/api/journal`.

All API handlers call `requireSubscription()` and then use the cookie-scoped Supabase client.
Database RLS is the final ownership boundary. The browser never receives a service-role key.

## Database and Storage

Apply `supabase/migrations/010_intellijournal.sql` through the normal migration workflow. It creates
the eight Journal tables, enums, indexes, RLS policies, private `journal-screenshots` bucket
definition, object policies, and atomic trade/leg RPCs.

Hosted checks must confirm:

1. Migration success and grants in the target Supabase project.
2. Two-user RLS isolation.
3. Private bucket behavior and signed reads.
4. Service-role access is server/CLI-only.

Screenshot objects use `journal/{userId}/trades/{tradeId}/...`. Stored database values are stable
paths, never signed URLs.

## Environment

Use the existing IntelliTrade variables:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY` only for the optional local seed command
- Existing Stripe variables and `subscriptions` table used by `requireSubscription()`

Do not create Journal-specific authentication or subscription credentials.

## Local Setup

```powershell
npm.cmd ci
npm.cmd run typecheck
npm.cmd test
npm.cmd run dev
```

After applying the migration to a local Supabase project, seed an existing auth user:

```powershell
npm.cmd run journal:seed -- <auth-user-id>
```

Open `/dashboardv2`, add IntelliJournal, then use `/dashboardv2/journal` for full workflows.

## Deployment and Rollback

Deploy the migration before application code. Verify paid and trialing access, then run the QA
checklists in `docs/journal/qa`. Roll back application exposure by restoring the Journal
`comingSoon` catalog flag. Database rollback must be planned separately because dropping Journal
tables destroys user history; prefer disabling routes and retaining data.

## Known Baseline Behaviors

Calculations intentionally preserve unrounded JavaScript precision, open gross `-0`, regex-only
date validation, negative risk acceptance, no breakeven query classification, optional
`contractSize = 1`, and leg-side-based arithmetic.
