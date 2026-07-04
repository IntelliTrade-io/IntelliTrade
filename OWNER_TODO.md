# Owner TODO

Things only the owner can do (account access, credentials, external services). **Not critical right now** unless marked. Execute when the refactor plan wraps up — or at the noted unblock date. Claude adds items here instead of nagging; each says what, why, and what to tell Claude afterwards.

---

## Unblocks on a date

- [ ] **Rotate the CurrencyFreaks key** *(unblocks ~2026-07-06 when co-founder is back)*
  1. Rotate the key in the CurrencyFreaks dashboard (old one was browser-exposed pre-refactor).
  2. In Vercel: set new value on `CURRENCYFREAKS_API_KEY`, **delete** `NEXT_PUBLIC_CURRENCYFREAKS_API_KEY`.
  3. Tell Claude: "key rotated" → code fallback in `app/api/rates` + `app/api/dxy` gets stripped, H7 closes in the security register.

## Deploy / merge (closer to critical — security fixes aren't live until merged)

- [ ] **Merge `refactor/phase1-security` → `main`** (PR). Until this deploys, production still runs pre-hardening code. Everything is build+test green on the branch.
- [ ] **Merge `SRL-dev3` → `main`** for the S&R frontend on Vercel (if not already superseded by the branch above — verify diff first).
- [ ] **VPS: redeploy the 4 updated S&R backend files + apply migration 004** (close-reclaim columns). Manual RDP copy for now; §6.7 replaces this workflow later.

## When Phase 6.7 (VPS on git) starts

- [ ] **Install git on the VPS** + create a read-only deploy key / fine-grained PAT for the repo (not owner credentials).
- [ ] **Don't hand-edit files on the VPS from now on** — any in-place fix should also land in the repo, or drift reconciliation (§6.7 step 3) gets harder.

## External / accounts

- [ ] **Check Supabase sign-up email redirect** — the sign-up flow passes `emailRedirectTo: <origin>/auth/callback`, but no `/auth/callback` route exists in the app (only `/auth/confirm`, which handles `token_hash` links). If the Supabase email template uses `{{ .ConfirmationURL }}`, new users may land on a 404 after confirming. Test one real sign-up; tell Claude "callback works" or "callback 404s" → then it's either left alone or repointed to `/auth/confirm`.

- [ ] **Locate the currency-strength meter Vite source** (built outside this repo — see `claudeLoad/STRENGTH_METER_DEV_HANDOFF.md`). Needed to bring it in-repo with a build step (IMPROVEMENTS.md entry).
- [ ] **Supabase CLI link** for the project so migrations run via `db push` instead of hand-pasting in the SQL editor; then Claude backfills migration files for the 4 dashboard-created tables (IMPROVEMENTS.md → Ops).

---

*Done items: strike through + date, don't delete — they're the audit trail.*
