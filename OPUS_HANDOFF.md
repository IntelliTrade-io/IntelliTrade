# OPUS IMPLEMENTATION HANDOFF — IntelliTrade conversion system

You are Claude Opus implementing a pre-approved conversion system for IntelliTrade
(intellitrade.tech). This document is self-contained: everything you need is here or in the
repository. Strategy questions are settled — do not re-litigate them; implement.

## Business goal

Turn homepage/organic/free-tool visitors into informed IntelliTrade Pro prospects, free
account registrations, and **Founding Pro Members (€15/month, capped at the first 100 paid
members)**. Product-led funnel: useful value first → understand what Pro does → free account
→ compliant Pro preview → upgrade.

## Product context

IntelliTrade = serious trading-tools platform. Campaign line: **"Stop trading blind. Start
with context."** Pro bundle: Smart Support Zones (flagship, live, EURUSD-only, support zones
only, M15 context — zone strength scores weak/medium/strong, opportunity score, reclaim
confirmation, chart overlays, explanations), currency strength meter, economic calendar,
TradingView charts, position size calculator, Bull vs Bear game. Free tier: blog, lot size
calculator, prices-today pages.

**Compliance is non-negotiable.** IntelliTrade is NOT a signal service, adviser, or
prediction product. Allowed vocabulary: market preparation, pre-trade routine, market
context, risk tools, event awareness, currency strength, zone quality, opportunity score,
potential trade setup (educational framing only), decision support, structured preparation.
BANNED on all public surfaces: "buy signal", "sell signal", "entry", "buy zone", "guaranteed"
anything, "get funded", "pass your challenge", "know where price will go", "never miss a
trade". Research win-rate numbers (e.g. the 81–88% figures in
`components/support-resistance/mockData.ts` → `supportResistanceResearchProfiles`) must
NEVER render on a public (non-subscriber) page.

Locked founder decisions:
1. Thin free tier at launch — public previews sell; free account exists to subscribe. Do NOT
   build a free dashboard or touch entitlements.
2. SSZ headline claim: **"Most tools draw zones. IntelliTrade scores them."** No "first/only
   tool ever" claims anywhere.
3. Founding pricing: **€15/month, first 100 members, kept for as long as the subscription
   stays active; rejoining later = standard price.** Never the word "lifetime".
4. Pro page route: **`/pro`**.
5. No fake scarcity: no "X spots remaining" counter. Static truthful "first 100 members" only.
6. No free trial. No onboarding questionnaire. No blog popups/banners or blog template edits.

## Analytics context

GA4 `G-EX1XMJTN0S` via gtag in `app/layout.tsx` (Consent Mode v2 default-denied — keep).
Current state: pageviews only; `lib/gtag.ts` `event()` never called; **no dev guard** (localhost
pollutes GA); `/upgrade/success` fires nothing. June GA4: landing pages `/`,
`/lotsizecalculator`, `/gold-price-today`; `/dashboardv2` curiosity dies at the login wall;
`/upgrade` effectively untracked/unvisited.

## Repository facts you rely on (verified 2026-07-12)

- Next.js 15.3.8 App Router, React 19, TS, Tailwind **v3**. Repo conventions in `CLAUDE.md`
  (route files in `app/`, shared components in `components/<feature>/`, PascalCase, client
  data via `lib/api/client.ts`, auth mutations only via `lib/auth/client.ts`).
- Gating: `middleware.ts` matcher excludes free/public routes; everything else requires
  login, and `lib/supabase/middleware.ts` sends logged-in non-subscribers on premium
  prefixes (`/dashboardv2`, `/support-resistance`, …) to `/upgrade`. API gating via
  `lib/auth/requireSubscription.ts`. **`/upgrade` is public. Your new `/pro` and
  `/smart-support-zones` must be added to the middleware exclusion list — this is part of
  the matcher regex in `middleware.ts` (config-list edit, allowed; it makes pages public,
  never gates anything new).**
- Stripe: `lib/stripe.ts`; checkout `app/api/stripe/checkout/route.ts` uses single env
  `STRIPE_PRICE_ID`; webhook `app/api/stripe/webhook/route.ts` syncs `subscriptions` table;
  upgrade page `app/upgrade/page.tsx` fetches the live price for display.
- SSZ module `components/support-resistance/SupportResistanceAlphaModule.tsx` **defaults all
  props to self-contained mock data** (`mockData.ts`) — safe for a public preview page with
  zero backend. Its live wrapper `SupportResistanceAlphaLive.tsx` calls the sub-gated
  `/api/sr-alpha` — never use the live wrapper publicly. Compliance copy already exists in
  `components/support-resistance/copy.ts` (`supportResistanceCopy.disclaimer`).
- The full module renders `ResearchProfileCard`s (win rates). For the public preview you must
  render the module WITHOUT the research-profile section — pass `profiles={[]}` and verify
  nothing else leaks the numbers (the profiles section maps over `profiles`, so an empty
  array renders an empty grid — hide the section header too if empty; a tiny prop or
  conditional inside the module is acceptable, e.g. render the "Research profile" section
  only when `profiles.length > 0`).
- Dashboard deep-link exists: `/dashboardv2?panel=supportResistance`.
- Design system: dark theme, rounded-[24px] glass cards (`border-white/10 bg-white/[0.03]
  backdrop-blur-xl`), violet accents for Pro (`violet-400/20`–`violet-500/10`), brand
  gradient CTAs (`from-brand to-brandLight`), tracking-[0.2em] uppercase eyebrows. Match
  `app/page.tsx` and `app/upgrade/page.tsx` idioms exactly.
- SEO pattern: per-page `metadata` export + JSON-LD via `lib/jsonLd.ts` (escaped). Sitemap:
  `app/sitemap.ts` static list.
- Known bugs you will fix: `app/lotsizecalculator/page.tsx` links to `/terms` (route is
  `/termsOfService`); `components/auth/LoginForm.tsx` hardcodes `/dashboardv2` and ignores
  `?redirect=`; `lib/auth/client.ts` `emailRedirectTo` points at nonexistent
  `/auth/callback` (flag to founder, do not change auth config yourself).

## Founding Member offer — implementation truth

- Copy states €15/month everywhere; the upgrade page displays the live Stripe price. If they
  disagree in production, that's an env/Stripe issue for the founder (flag it; do not touch
  Stripe).
- Cap: measured manually by the founder from the `subscriptions` table. No counter UI, no
  enforcement code at launch.
- Wording (use verbatim where specified in Phase C).

## Implementation phases

Work phase by phase. After each phase: `npm run build` && `npm test` && `npx tsc --noEmit`
green, then commit (conventions: `refactor:`/`feat`-style prefixes used in this repo are
`security:`, `refactor:`, `chore(git):`, `chore(deps):`, `test:`, `docs:` — use `refactor:`
for structural moves and plain descriptive prefixes like `feat:` are NOT in the convention
list, so use the closest match; separate move/rename commits from logic commits). **Do NOT
push** — owner pushes. Do not modify: Stripe routes, webhook, `subscriptions` schema,
Supabase auth config, `lib/auth/requireSubscription.ts`, RLS, or blog templates.

### Phase A — analytics foundation + quick fixes (safe)

1. **`lib/analytics.ts` (new)** — typed event helper:
   - `trackEvent(name: string, params?: Record<string, string | number>)` calling
     `window.gtag('event', name, params)`.
   - Production guard: no-op unless `process.env.NODE_ENV === "production"` and
     `window.location.hostname` is not `localhost`/`127.0.0.1`. Also no-op when
     `window.gtag` is undefined.
   - Keep `lib/gtag.ts` pageview as-is (or migrate GATracker to the new module — your call,
     one module preferred; don't break the pageview).
2. **Dev GA guard in `app/layout.tsx`**: skip injecting the gtag.js and AdSense `<Script>`
   tags when `process.env.NODE_ENV !== "production"`. Keep Consent Mode block harmless in
   dev (fine to skip it too).
3. **`components/layout/NavLinks.tsx` + `MobileNav.tsx`**: add "Pro" link → `/pro` (icon:
   `Sparkles` or `Crown` from lucide). Desktop: place after "About". Mobile: in MAIN_LINKS.
4. **Fix `/terms` → `/termsOfService`** in `app/lotsizecalculator/page.tsx`.
5. **Redirect honoring**: `components/auth/LoginForm.tsx` and `SignUpForm.tsx` read
   `redirect` from `useSearchParams()`; validate relative-only (must start with `/`, must not
   start with `//` — same rule as `safeNext` in `app/auth/confirm/route.ts`); LoginForm falls
   back to `/dashboardv2`, SignUpForm falls back to `/upgrade`. (Client components — wrap
   usage in `<Suspense>` if Next requires it for `useSearchParams` in these routes.)
6. **Auth events**: `sign_up_start` (form submit), `sign_up` (success), `login` (success)
   via `trackEvent`.
7. **`calculator_result` event** in `components/calculators/LotSizeCalculator.tsx` on
   successful calculation (`instrument` param; no account values — no PII/finances).

Acceptance: build/test green; in `npm run dev` NO requests to googletagmanager; nav shows
Pro on both breakpoints; login with `?redirect=/upgrade` lands on `/upgrade`.

### Phase B — Smart Support Zones public page + homepage rework

1. **`app/smart-support-zones/page.tsx` (new, public — add to middleware exclusion)**:
   - Metadata: title `Smart Support Zones — EURUSD Support Zone Strength Scoring | IntelliTrade`;
     description with "support zone strength", "weak, medium or strong"; canonical;
     OpenGraph/twitter; JSON-LD `WebPage` (+ optional `SoftwareApplication`), following the
     `app/gold-price-today/page.tsx` pattern.
   - Hero: H1 `Know how strong a support zone really is.` Sub: `Smart Support Zones scores
     EURUSD support zones weak, medium or strong — and shows you why: zone behaviour, reclaim
     confirmation, session context, and an explained opportunity score.`
   - Interactive preview: client component wrapping `SupportResistanceAlphaModule` with mock
     defaults and `profiles={[]}` (win rates must not render). Clearly labeled
     `Interactive preview — sample data for illustration.` Fire `preview_interact`
     (`tool: "ssz"`, `zone_grade`) on zone selection — wrap via a small `_components` client
     wrapper that intercepts selection or, simpler, fire a single `preview_interact` on first
     pointer interaction inside the preview container (acceptable).
   - Educational content (substantive text, AdSense-grade, ~600+ words): what a support zone
     is; why generic zone tools fall short; what weak/medium/strong means here; what reclaim
     confirmation is; how to read the opportunity score; scope honesty (EURUSD, M15, support
     only — from `supportResistanceCopy.scopeNotes`); FAQ (4–6 questions, with FAQPage
     JSON-LD). Educational tone; "potential trade setup" allowed, framed as decision support.
   - Disclaimer band: `supportResistanceCopy.disclaimer` verbatim.
   - CTA band: `Smart Support Zones is included in IntelliTrade Pro.` + Founding line + CTA
     `Explore IntelliTrade Pro` → `/pro?src=ssz` (fires `cta_click`).
2. **Homepage `app/page.tsx` rework**:
   - Hero H1: `Stop trading blind. Start with context.` Sub: `IntelliTrade is your pre-trade
     routine: support-zone quality, currency strength, event risk and position sizing —
     checked in minutes, before you consider a trade.` Primary CTA `Explore IntelliTrade Pro`
     → `/pro` (cta_click `cta_id: "home_hero_pro"`); secondary `Try the free calculator` →
     `/lotsizecalculator`.
   - New SSZ flagship section (above the platform grid): eyebrow `FLAGSHIP · SMART SUPPORT
     ZONES`; H2 `Most tools draw zones. IntelliTrade scores them.`; body `Smart Support Zones
     evaluates every EURUSD support zone and explains whether it looks weak, medium or strong
     — zone behaviour, reclaim confirmation, and an opportunity score you can actually
     interpret. Educational decision support, not signals.`; CTA `See how zone scoring works`
     → `/smart-support-zones`. Optionally a static visual (e.g. `ZoneOverlayPreview`
     component if it renders standalone; else a simple stylized zone-band graphic in CSS).
   - PRO tool cards: re-point `href` from `/dashboardv2` to `/pro` (logged-out visitors must
     never hit the login wall from marketing surfaces); add an SSZ card FIRST in the Pro row
     linking `/smart-support-zones`.
   - Founding strip (between platform grid and blog): `Founding Member — €15/month for the
     first 100 members. Keep the price for as long as you stay subscribed.` CTA `Become a
     Founding Member` → `/pro#pricing` (fires `founding_cta_click` `location: "home_strip"`).
   - Keep JSON-LD, blog section, ComingSoon cards (AdSense note: ComingSoon cards were
     flagged under "no under-construction signals" — REPLACE the three blurred ComingSoon
     cards with the SSZ flagship section's presence; if grid balance needs cards, show real
     shipped Pro tools instead. Do not add new "coming soon" surfaces.)
   - Metadata: update title/description to campaign framing (keep brand + canonical).
3. **Sitemap**: add `/smart-support-zones` (priority 0.9) and `/pro` (0.9) to `app/sitemap.ts`.
4. **Hero hierarchy note**: homepage H1 changes SEO title — keep `IntelliTrade` in the
   metadata title, e.g. `IntelliTrade — Stop Trading Blind. Start With Context.`

Acceptance: `/smart-support-zones` renders logged-out with zero API calls to gated routes,
zero win-rate figures in DOM; homepage has no marketing link into `/dashboardv2`; build green.

### Phase C — /pro page + upgrade rework + contextual CTAs

1. **`app/pro/page.tsx` (new, public — middleware exclusion)** — server component; may read
   auth state (pattern from `components/auth/AuthButton.tsx`: `createClient()` +
   `supabase.auth.getUser()`, and subscription via the user-scoped client like
   `lib/auth/requireSubscription.ts` — do NOT import `supabaseAdmin` into a public page
   unnecessarily; user-scoped RLS read of own subscription is the right pattern).
   Sections in order:
   - Hero: H1 `Your pre-trade routine, in one workspace.` Sub: `IntelliTrade Pro brings
     together Smart Support Zones, currency strength, the economic calendar, charts and risk
     tools — so every session starts with context instead of guesswork.` CTA per auth state:
     logged-out → `Become a Founding Member — €15/month` → `/auth/sign-up?redirect=/upgrade`;
     logged-in free → same label → `/upgrade`; logged-in Pro → `Open your dashboard` →
     `/dashboardv2`.
   - SSZ flagship block (H2 claim line, body from Phase B copy, link to
     `/smart-support-zones`).
   - Feature grid (shipped only, violet Pro styling): Smart Support Zones (EURUSD) · Currency
     Strength Meter · Economic Calendar · TradingView charts · Position size calculator ·
     Bull vs Bear. One honest sentence each, non-signal framing. No "coming soon" items.
   - Free vs Pro comparison table (static, small): rows = the tools; columns Free / Pro.
   - Pricing section `id="pricing"`: badge `FOUNDING MEMBER · FIRST 100`; `€15/month`;
     `Founding price for the first 100 Pro members. Keep it for as long as you stay
     subscribed. Cancel anytime — no contracts.`; sub-line `After the first 100 members, new
     members join at the standard price.`; CTA per auth state as hero. Fire `view_pricing`
     on mount (client sub-component) and `founding_cta_click` on CTA.
   - FAQ (FAQPage JSON-LD): what's included; billing/cancel (`Cancel anytime from your
     account. Payments are handled by Stripe.`); founding price mechanics (kept while
     subscribed; rejoining later = standard price); `Is this a signal service?` → `No.
     IntelliTrade provides educational market context and analytics to support your own
     decision process. It does not provide trade recommendations or financial advice.`
   - Trust band: Stripe payments · cancel anytime · educational disclaimer (footer disclaimer
     already exists sitewide; short inline variant here).
   - Metadata + JSON-LD (`Product`/`WebPage` — if using `Product` with offer €15, keep
     honest; simplest: `WebPage` + `FAQPage`).
2. **Upgrade page `app/upgrade/page.tsx` rework** (display/copy only — no checkout logic):
   - Badge → `INTELLITRADE PRO · FOUNDING MEMBER`; under price add `Founding price for the
     first 100 members — keep it for as long as you stay subscribed.`
   - FEATURES: add `{ icon: LineChart, label: "Smart Support Zones (EURUSD)", soon: false }`
     first.
   - Logged-out CTA in `app/upgrade/_components/UpgradeButton.tsx`: change to
     `Create your account to subscribe` → `/auth/sign-up?redirect=/upgrade` (was
     login-only). Add `begin_checkout` trackEvent (`currency: "EUR", value: 15`) on the
     logged-in click path before the apiPost.
   - Keep the active-sub redirect to `/dashboardv2`.
3. **`app/upgrade/success/page.tsx`**: add a small client component firing `purchase`
   (`currency: "EUR"`, `value: 15`) once, guarded by a `sessionStorage` flag against
   refresh double-fire.
4. **`components/pro/ProCtaCard.tsx` (new)** — reusable contextual CTA card (props: heading,
   body, ctaLabel, href, src; fires `cta_click` with `cta_id`+`src`). Match glass-card
   styling.
5. **Calculator post-result CTA**: in `components/calculators/LotSizeCalculator.tsx`, when
   `positionSize` is non-empty render `ProCtaCard` under the results grid: heading `Position
   sized. Now check the context.`; body `IntelliTrade Pro adds support-zone quality, currency
   strength and event risk to your pre-trade routine.`; CTA `See IntelliTrade Pro` →
   `/pro?src=calc`.
6. **Price-page CTA band**: add `ProCtaCard` near the bottom of the four
   `*-price-today` page bodies (their `_components/*Page.tsx`): heading `The price is one
   input. Context is the rest.`; body `IntelliTrade Pro tracks currency strength, event risk
   and EURUSD zone quality — before you consider a trade.`; CTA `Explore Pro` →
   `/pro?src=gold|silver|oil|btc`.
7. **Sign-up page `app/auth/sign-up/page.tsx`**: add a side/above panel (desktop two-column,
   mobile stacked): `Create your free account` + bullets `Subscribe to IntelliTrade Pro when
   you're ready` · `Founding Member pricing: €15/month for the first 100 members` · `Cancel
   anytime — no contracts`. Do not overpromise free features (thin free tier).

Acceptance: `/pro` state matrix correct (logged-out / free / Pro); upgrade page shows SSZ;
calculator CTA appears only post-result; all CTAs fire events in prod build; build/test green.

### Phase D — founder-permission batch (STOP and ask first)

Present these to the founder in ONE batch before implementing any of them:
1. Middleware redirect target: logged-out premium-prefix visits → `/pro?from=dashboard`
   (banner: `The Pro workspace requires an account and an active plan.`) instead of
   `/auth/login`. (File: `lib/supabase/middleware.ts` — redirect-target-only change.)
2. Verify prod `STRIPE_PRICE_ID` is €15.00 EUR/month recurring (owner checks Stripe
   dashboard). If not, owner creates the price and swaps the env var.
3. VAT presentation (recommend Stripe Tax, tax-inclusive €15, `VAT included` under price).
4. Standard price after member 100 (decide before ~member 70; no code now).
5. GA4 console tasks (owner): key events `sign_up`/`begin_checkout`/`purchase`; referral
   exclusion `checkout.stripe.com`; internal traffic filter; funnel exploration.
6. `lib/auth/client.ts` `emailRedirectTo: /auth/callback` → route doesn't exist; owner
   verifies the Supabase email template flow (`/auth/confirm` with token_hash is the real
   handler). Fix only with owner sign-off.
Also log all owner items into `OWNER_TODO.md` per repo convention.

### Phase E — QA, docs, launch

1. Full QA matrix (below).
2. **Update `GOOGLE_ADSENSE_APPROVAL.md`** (required by owner):
   - §1: check the "No under-construction signals" box if ComingSoon cards were removed from
     the homepage; note `/smart-support-zones` + `/pro` as new text-rich public pages.
   - §6.3 "Premium-module public teaser pages": mark done via `/smart-support-zones`, dated.
   - §2 copy-scrub item: note the non-signal copy pass shipped with this work.
   - Changelog entry with date + summary.
3. Update `IMPROVEMENTS.md` with the deferred backlog (locked free-dashboard cards,
   server-side purchase tracking, cap auto-enforcement at ~80 members, founder section,
   demo walkthrough, segment pages).
4. Final commits; **do not push**.

## QA / acceptance criteria (final gate)

- **Build**: `npm run build`, `npm test`, `npx tsc --noEmit` all green.
- **Desktop + mobile**: `/`, `/pro`, `/smart-support-zones`, `/upgrade`, `/auth/sign-up`
  render correctly at 375px and 1440px; no horizontal scroll; pill nav/mobile menu include Pro.
- **Auth matrix**: logged-out sees sign-up CTAs; free user sees upgrade CTAs; Pro user sees
  dashboard CTAs; `/upgrade` still redirects active subs to `/dashboardv2`.
- **Entitlement**: `/dashboardv2` and `/api/sr-alpha` gating unchanged (spot-check: logged-out
  fetch of `/api/sr-alpha` → 401).
- **Protected data**: view-source of `/smart-support-zones` contains no win-rate percentages,
  no live zone data; only `mockData` values.
- **Analytics**: prod build fires `cta_click`/`sign_up`/`begin_checkout`/`purchase` (verify
  via GA4 DebugView or network tab); dev build sends nothing to googletagmanager.
- **Payments**: checkout flow untouched — click-through to Stripe checkout session still
  works (test mode if configured).
- **SEO**: new pages have metadata, canonical, JSON-LD, sitemap entries; homepage title keeps
  brand.
- **Compliance sweep**: `grep -riE "buy signal|sell signal|buy zone|guaranteed|get funded|pass your challenge|never miss a trade|lifetime" app components lib --include="*.tsx" --include="*.ts"`
  → no hits in public-surface copy ("entry" is too generic to grep safely — manually review
  new copy for it); every SSZ surface shows the educational disclaimer.
- **Links**: no `/terms` references; all new internal links resolve.

## Final report (produce at the end)

Summarize: files created/changed per phase; commit list; QA results per criterion (pass/fail
with evidence); the founder-permission batch status; GA4 events implemented with names/params;
what was deferred and where it's logged. Report failures honestly.

---

## Appendix — final copy blocks (written by Fable; use verbatim, light editing for fit only)

### /smart-support-zones — educational body

**What is a support zone?**

A support zone is a price area where a market has repeatedly slowed down, paused, or turned
after falling. Traders watch these areas because they often mark where buying interest has
appeared before. But "often" is doing a lot of work in that sentence — not all support is
equal, and treating every zone the same is one of the most common mistakes in retail trading.

**Why generic zone tools fall short**

Most support and resistance indicators draw lines or boxes wherever price has touched a level
a few times. They answer one question: *where* has price reacted? They stay silent on the
question that actually matters for preparation: *how good is this area now?* A shelf that
held twice in quiet conditions and a shelf that has been defended repeatedly during active
sessions look identical as rectangles on a chart. They are not the same thing.

**What Smart Support Zones does differently**

Smart Support Zones evaluates each EURUSD support zone on the M15 timeframe and assigns it a
strength classification — weak, medium or strong — based on how the zone has actually
behaved: how it was formed, how price has approached it, and how it has held. On top of the
static strength of the shelf itself, the tool grades the *current* context around the zone,
including whether a reclaim has been confirmed — that is, whether price has closed back above
the zone after dipping into it, rather than merely touching it.

The result is an opportunity score with an explanation attached. Instead of a bare rectangle,
you see why a zone is classified the way it is, what would strengthen or weaken that reading,
and whether the surrounding session context supports paying attention to it at all. Zones
that fail the context filters are explicitly marked as watch-only or blocked, with the reason
stated.

**What the classifications mean**

- **Strong / medium / weak** describe the underlying shelf — its structure and history.
- **The dynamic grade** describes the current situation around that shelf, including reclaim
  confirmation and session timing. A structurally strong shelf can still grade poorly if the
  current approach is messy or the timing filter fails.
- **Blue zones** are informational only: they exist, but the context is incomplete.
- **Watch** means quality is not clean enough yet; **Blocked** means poor context.

**Honest scope**

Smart Support Zones currently covers EURUSD support zones on M15 execution context. Support
only — resistance zones are not scored. More pairs and resistance coverage are on the
roadmap. We would rather ship one pair scored honestly than twenty pairs scored loosely.

**What this is — and is not**

Smart Support Zones is educational decision support for your pre-trade preparation. A strong
zone is not a prediction that price will bounce, and an opportunity score is not a
recommendation to buy. The tool helps you understand whether a support area deserves a place
in your preparation for a potential trade setup — the decision itself stays yours.

### /smart-support-zones — FAQ (FAQPage JSON-LD)

**Q: Does a strong zone mean price will bounce?**
No. A strong classification means the zone's structure and history have scored well in our
evaluation framework. It says nothing certain about the future. Markets can and do break
strong support. The classification exists to help you rank areas for your own preparation,
not to predict outcomes.

**Q: Is Smart Support Zones a signal service?**
No. IntelliTrade does not send trade signals, entries, or recommendations. Smart Support
Zones summarizes historical zone behaviour and current context as educational decision
support. What you do with that context is your decision.

**Q: Which markets and timeframes are covered?**
EURUSD support zones on M15 execution context. Support only — resistance is not currently
scored. Coverage is deliberately narrow while the scoring model is refined; more pairs are
planned.

**Q: What is reclaim confirmation?**
A reclaim is when price dips into a support zone and then closes back above it, rather than
merely touching the zone. A confirmed reclaim tells you the zone was tested and, so far,
defended — which is different information than an untested zone or an unresolved dip.

**Q: What data does the preview on this page use?**
The interactive preview on this page uses illustrative sample data so you can explore how
zones, scores and explanations are presented. Live EURUSD zones, refreshed throughout the
session, are available inside IntelliTrade Pro.

**Q: How is the opportunity score calculated?**
The score combines the zone's static strength (structure and history of the shelf) with
dynamic context: reclaim status, approach quality, and session timing. Each component is
shown with the score, so you can see why a zone is graded the way it is — and disagree with
it if your own analysis says otherwise.

### /pro — FAQ (FAQPage JSON-LD)

**Q: What exactly is included in IntelliTrade Pro?**
Everything in the Pro workspace: Smart Support Zones (EURUSD zone-strength scoring), the
currency strength meter (daily and intraday), the economic calendar, TradingView charting,
the position size calculator, and the Bull vs Bear game. New Pro tools are added to the same
subscription.

**Q: How does billing and cancellation work?**
€15 per month, billed through Stripe. Cancel anytime from your account page — access
continues until the end of the paid period. No contracts, no cancellation emails, no
retention hoops.

**Q: How does Founding Member pricing work?**
The first 100 Pro members join at €15/month and keep that price for as long as their
subscription stays active. If you cancel and rejoin later, the standard price at that time
applies. After the first 100 members, new members join at the standard price.

**Q: Is this a signal service?**
No. IntelliTrade provides educational market context and analytics to support your own
decision process. It does not provide trade recommendations, entries, or financial advice.
If you are looking for someone to tell you what to trade, this is not that — deliberately.

### Gated-state banner (Phase D, if middleware redirect is approved)

`The Pro workspace requires an account and an active plan. Here is what is inside it.`
(rendered atop /pro when `?from=dashboard` is present)
