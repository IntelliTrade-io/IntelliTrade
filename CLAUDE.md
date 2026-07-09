# IntelliTrade — repo conventions

Locked during the 2026-07 refactor (see REFACTOR_PLAN.md §5). Follow these for all new code.

## Frontend structure (Next.js App Router)

- `app/` contains **route files only** (`page/layout/route/sitemap/robots/not-found` + special files), plus route-private components in `app/<route>/_components/` when used by exactly one route (Next private-folder convention).
- Components used by 2+ routes live in `components/<feature>/`: `auth/`, `blog/`, `calculators/`, `dashboardv2/`, `layout/`, `price-pages/`, `support-resistance/`, `ui/`.
- **PascalCase filenames** for components (`LoginForm.tsx`). Exception: `components/ui/` shadcn-generated files keep their kebab names (`button.tsx`).
- No `.jsx` in new code — TypeScript only. Two legacy islands remain (`ConflictMapModule.jsx`, `generated/BullBearGame.jsx`), conversion tracked in the plan.

## Data fetching (plan 5.2)

- Server components fetch directly (Supabase/Sanity server clients) — no HTTP round-trip to our own API routes.
- Client components call internal routes **only** via `lib/api/client.ts` (`apiGet`/`apiPost`; no-store default; throws `ApiError` carrying the route's `{error}` message). No raw `fetch()` in components.
- Shared domain fetchers live in `lib/api/` (e.g. `market.ts` for rates/DXY/yield).
- Auth mutations **only** via `lib/auth/client.ts` — components never build their own Supabase client for auth.

## Styling

- Tailwind **v3** (owner decision; v4 migration deferred until post-refactor).
- Two stylesheets, imported in this order in `app/layout.tsx`: `styles/main.css` (site chrome) → `app/globals.css` (single `@tailwind` emission + theme vars + shadcn tokens). Never add a second `@tailwind` emission; new global CSS goes in `globals.css`.

## Security invariants

- Every new Supabase table gets RLS enabled **in the same migration** that creates it.
- Never put secrets behind `NEXT_PUBLIC_`.
- Free tier = blog, lot size calculator, prices-today pages. Everything else is subscription-gated: pages via middleware, data routes via `lib/auth/requireSubscription`.

## Workflow

- `npm run build` + `npm test` must be green before a task is done; `pytest` too when Python is touched.
- Commit prefixes: `security:`, `refactor:`, `chore(git):`, `chore(deps):`, `test:`, `docs:`.
- Separate move/rename commits from logic-change commits.
- Owner-only actions (credentials, merges, external accounts) go to `OWNER_TODO.md`; product ideas to `IMPROVEMENTS.md`.
