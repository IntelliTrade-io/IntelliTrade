# Deployed Smoke Test

## Preconditions

- Deployment has the required Supabase env vars.
- `sql/journal_schema.sql` is applied in the target Supabase project.
- The private `journal-screenshots` bucket exists with user-scoped upload/read/remove policies.
- At least one test user has an account and an instrument.

## Session / Auth

1. Open `/journal` while signed out and confirm redirect to `/login`.
2. Sign in with a valid test user and confirm redirect into `/journal`.
3. Refresh `/journal` and confirm the session persists.
4. Open `/journal/trades/new`, `/journal/reviews`, and `/journal/exports` directly and confirm access stays authenticated.

## Core Journal Flow

1. Open `/journal` and confirm dashboard stats and trades table render.
2. Create a new trade from `/journal/trades/new`.
3. Confirm redirect back to `/journal`.
4. Open the new trade from the table and confirm detail metrics render.
5. Update a supported top-level field and confirm the success state plus refreshed detail view.
6. Replace the execution legs and confirm the detail metrics refresh.

## Screenshot Flow

1. Upload a valid PNG, JPEG, or WebP screenshot on trade detail.
2. Confirm the screenshot renders from a signed URL.
3. Confirm the stored reference count increases.
4. If possible, verify in Supabase Storage that the object path matches:
   - `journal/{userId}/trades/{tradeId}/{timestamp}-{sanitizedFileName}`

## Review / Export Flow

1. Save a weekly or monthly review with notes.
2. Save the same period again and confirm it updates instead of duplicating.
3. Download a trades export in CSV.
4. Download a reviews export in JSON.
5. Confirm exports contain only the signed-in user's data.

## Delete / Cleanup Flow

1. Delete the test trade using the explicit confirmation control.
2. Confirm redirect back to `/journal`.
3. If a cleanup warning appears, verify screenshot object removal and bucket policy behavior in Supabase Storage.
4. Confirm the deleted trade no longer appears in the trades table.

## Failure Signals That Should Block Launch

- Auth cookies do not persist across page refreshes or journal API calls.
- A user can read or mutate another user's journal data.
- Screenshot upload requires making the bucket public.
- Exports include another user's data.
- Add-trade is unusable for a properly seeded user with account and instrument records.
