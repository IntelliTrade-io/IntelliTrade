# IntelliTrade Conversion System — Fable Plan (2026-07-12)

Planning artifact from the Fable strategy phase. Implementation is executed by Opus via
`OPUS_HANDOFF.md` (same directory) — that file is the self-contained implementation prompt.
This file is the reasoning record: audit, strategy, copy, analytics spec, decisions.

Locked founder decisions (2026-07-12):

1. **Thin free tier at launch** — public previews sell the product; a free account exists to
   subscribe. No locked free dashboard, no entitlement/middleware surface changes at launch.
2. **SSZ claim**: "Most tools draw zones. IntelliTrade scores them." (comparative, defensible,
   no "first/only" absolute claim).
3. **Founding price policy**: €15/month kept for as long as the subscription stays active;
   canceling and rejoining later = standard price. Never worded as "lifetime".
4. **Pro page route**: `/pro`.

---

## 1. Executive recommendation

The site's problem is not traffic quality — Direct + Google Organic land on genuinely useful
pages (`/`, `/lotsizecalculator`, `/gold-price-today`). The problem is that **every path from
"value consumed" to "product understood" is broken or missing**:

- Homepage Pro cards link to `/dashboardv2`, which for a logged-out visitor is a login wall
  with zero explanation.
- Nothing on the site links to `/upgrade`. No nav item, no pricing section, no CTA.
- The flagship differentiator (Smart Support Zones) appears **nowhere** on any public page —
  not the homepage, not the upgrade page's feature list.
- The GA4 `event()` helper exists and is called zero times; the funnel is unmeasured; GA loads
  on localhost.

The recommended system is deliberately small — five assets:

1. **`/pro`** — the single conversion hub: product story, SSZ flagship section, feature
   grid, Founding Member pricing, FAQ, trust/cancel clarity. Everything points here.
2. **`/smart-support-zones`** — public SEO + preview page. Reuses the existing
   `SupportResistanceAlphaModule` with its self-contained mock data (zero backend, zero
   protected data), wrapped in genuinely educational content. Doubles as the AdSense
   "premium-module teaser page" (GOOGLE_ADSENSE_APPROVAL.md §6.3).
3. **Homepage rework** — campaign hero ("Stop trading blind. Start with context."), SSZ
   flagship section, Pro cards re-pointed at `/pro` instead of the login wall, Founding strip.
4. **Contextual CTAs** on the high-intent free pages — calculator post-result CTA, price-page
   CTA band. One reusable component.
5. **Measured funnel** — production-only GA4 events across landing → CTA → sign-up →
   checkout → purchase.

Explicitly rejected/deferred (see §4) — segment landing pages, `/start`, onboarding
questionnaire, demo video, locked free-dashboard cards, blog work, A/B tests.

## 2. Current-state technical audit

Framework: Next.js 15.3.8 App Router, React 19, Tailwind v3, Supabase auth + Postgres,
Stripe subscriptions, Sanity blog, GA4 (`G-EX1XMJTN0S`) + Vercel Analytics + AdSense script.

| Area | File(s) | State |
|---|---|---|
| Homepage | `app/page.tsx` | Generic hero; Pro cards → `/dashboardv2` (login wall); no SSZ, no pricing path |
| Nav | `components/layout/NavLinks.tsx`, `MobileNav.tsx` | Free links only; no Pro/pricing entry |
| Auth pages | `app/auth/*`, `components/auth/*` | Password auth via `lib/auth/client.ts` |
| Login redirect | `components/auth/LoginForm.tsx:19` | Hardcodes `/dashboardv2`; **drops `?redirect=`** sent by UpgradeButton |
| Sign-up flow | `components/auth/SignUpForm.tsx` | On session → `/upgrade` (good); else `/auth/sign-up-success` |
| Auth confirm | `app/auth/confirm/route.ts` | OTP verify + safe `next` redirect (defaults `/`) |
| ⚠ emailRedirectTo | `lib/auth/client.ts` | Points at `/auth/callback` — **route does not exist** (verify against Supabase email template) |
| Page gating | `middleware.ts` + `lib/supabase/middleware.ts` | Free tier excluded by matcher; premium prefixes → sub check → `/upgrade`. Logged-out non-free → `/auth/login`. Vestigial prefixes `/conflict-map`, `/currency-strength-meter` (no such pages) |
| API gating | `lib/auth/requireSubscription.ts` | Clean 401/403 gate; used by `app/api/sr-alpha/route.ts` etc. |
| Upgrade page | `app/upgrade/page.tsx` | Public; price fetched live from Stripe; **feature list omits SSZ**; logged-out CTA says "Sign in to subscribe" |
| Checkout | `app/api/stripe/checkout/route.ts` | Single `STRIPE_PRICE_ID` env; success → `/upgrade/success` |
| Webhook | `app/api/stripe/webhook/route.ts` | Syncs `subscriptions` (status/plan/period_end) |
| Success page | `app/upgrade/success/page.tsx` | Static; **no purchase event** |
| Dashboard | `components/dashboardv2/Dashboard.tsx` | Tab pill nav; deep-link `?panel=` support already exists |
| SSZ live | `components/support-resistance/SupportResistanceAlphaLive.tsx` | Fetches `/api/sr-alpha` (sub-gated) |
| SSZ module | `components/support-resistance/SupportResistanceAlphaModule.tsx` | **Defaults to self-contained mock data** (`mockData.ts`) — reusable publicly with zero backend |
| SSZ compliance copy | `components/support-resistance/copy.ts` | Good disclaimer + "not signal" framing already written |
| ⚠ Mock research profiles | `mockData.ts` `supportResistanceResearchProfiles` | 81–88% win rates — **must not render on public pages** |
| Calculator | `components/calculators/LotSizeCalculator.tsx` | Results panel at ~line 537; `positionSize` state = post-result hook point |
| Calc page | `app/lotsizecalculator/page.tsx` | Text-rich (SEO upgraded); **broken link `/terms`** (should be `/termsOfService`) |
| Price pages | `app/gold-price-today/…` + siblings | Free; no Pro CTA |
| Analytics | `lib/gtag.ts`, `components/layout/GATracker.tsx`, `app/layout.tsx` | Pageviews only; `event()` never called; **no dev/prod guard** — localhost pollutes GA; Consent Mode v2 default-denied in layout |
| Sitemap | `app/sitemap.ts` | Static list; new pages must be added |
| SEO pattern | per-page `metadata` + `jsonLd()` (escaped) | Established, follow it |
| Newsletter | `app/api/newsletter/route.ts` → Brevo | Exists (unused for this plan) |
| Onboarding | — | None exists |

Security boundaries that must not move: middleware matcher (free-tier list),
`requireSubscription`, RLS on `subscriptions`, webhook signature check, no
`NEXT_PUBLIC_` secrets.

## 3. Funnel diagnosis

Today: high-intent page → value consumed → **no next step exists** → exit.
Product-curious: homepage Pro card → login wall → exit. Price-curious: no path at all.

Target funnel (thin free tier):

```
/ , /lotsizecalculator , /*-price-today , organic → /smart-support-zones
        │ contextual CTA (measured)
        ▼
/pro  ──── or directly ──── /smart-support-zones (preview → /pro)
        │ "Become a Founding Member — €15/mo"
        ▼
/auth/sign-up (contextual copy, redirect honored)
        ▼
/upgrade (Founding framing) → Stripe checkout → /upgrade/success (purchase event) → /dashboardv2
```

Free registered users who don't buy immediately: they land on `/upgrade` (existing sign-up
behavior) and can leave; the retained path back is `/pro` + nav. A richer free experience is
phase 2, deliberately.

## 4. Conversion architecture — accepted / rejected

| Asset | Verdict | Why |
|---|---|---|
| `/pro` | **Launch** | The missing conversion hub; everything points here |
| `/smart-support-zones` | **Launch** | Flagship SEO + interactive preview at near-zero risk (mock data); AdSense teaser |
| Homepage rework | **Launch** | Fixes the #1 leak (login-wall cards) + tells the SSZ story |
| Nav "Pro" link (desktop+mobile) | **Launch** | Trivial, permanent surface |
| Calculator post-result CTA | **Launch** | Highest-intent moment on the site |
| Price-page CTA band | **Launch** | Second-highest-intent pages |
| Sign-up page contextual copy | **Launch** | Cheap; sign-up page currently context-free |
| Upgrade page Founding rework | **Launch** | Currently anonymous card; missing SSZ; wrong logged-out CTA |
| Funnel analytics | **Launch** | Can't optimize what isn't measured |
| Middleware redirect target (logged-out premium → `/pro`) | **Permission item** | Redirect-only change but touches the auth path; founder approves in phase D |
| Server-side purchase tracking (webhook → GA4 MP) | **Phase 2 / permission** | Client-side event on success page is enough at this volume |
| Cap auto-enforcement (block checkout at 100) | **Phase 2 / permission** | Manual monitoring is fine from 0 → ~80 members |
| Locked free-dashboard cards | **Phase 2** | Founder decision: thin free tier at launch |
| `/start` mobile social funnel | **Rejected** | Instagram traffic ≈ 0; unjustified |
| Segment pages (forex/gold/prop) | **Rejected** | No traffic to segment; prop page invites "pass your challenge" compliance drift |
| Onboarding questionnaire | **Rejected (launch)** | Friction + persistence needs schema permission; no personalization payoff at this traffic |
| Demo video / animated walkthrough | **Deferred** | Interactive mock preview is better and already built |
| Founder credibility section | **Deferred** | Optional; needs founder's personal-info decision |
| A/B tests | **Deferred** | Sample sizes impossible; measure first |
| Blog popups/banners | **Out of scope** | Restriction confirmed |

## 5. Messaging hierarchy & positioning

**Decision: lead with Smart Support Zones as the flagship proof point, inside the
"pre-trade context" platform frame.** Pure "pre-trade operating system" is too abstract to
differentiate; pure SSZ-only leads too narrow (EURUSD/M15/support-only scope). The hybrid:
campaign line opens, SSZ proves it's real, the platform bundle justifies the subscription.

Hierarchy:
1. Platform: *Stop trading blind. Start with context.*
2. Flagship: *Most tools draw zones. IntelliTrade scores them.* (SSZ)
3. System: *Pro connects zone quality with currency strength, event risk and position sizing.*
4. Offer: *Founding Member — €15/month, first 100 members.*

SSZ claim options (for the record): bold — "The first support tool that tells you how strong
the zone actually is" (rejected: unsubstantiated absolute); safe — "Go beyond generic support
zones" (kept as body copy); **chosen** — "Most tools draw zones. IntelliTrade scores them."

Compliance guardrails (all public copy): allowed — market preparation, pre-trade routine,
market context, zone quality, opportunity score, potential trade setup (educational framing),
decision support. Banned — buy/sell signal, entry, buy zone, guaranteed anything, get funded,
pass your challenge, know where price will go. Research win-rate numbers stay behind the
paywall. Every SSZ surface carries the `supportResistanceCopy.disclaimer` line or a shortened
variant.

### Final copy (recommended)

**Homepage hero**
- H1: `Stop trading blind. Start with context.`
- Sub: `IntelliTrade is your pre-trade routine: support-zone quality, currency strength, event risk and position sizing — checked in minutes, before you consider a trade.`
- Primary CTA: `Explore IntelliTrade Pro` → `/pro`
- Secondary CTA: `Try the free calculator` → `/lotsizecalculator`

**Homepage SSZ section**
- Eyebrow: `FLAGSHIP · SMART SUPPORT ZONES`
- H2: `Most tools draw zones. IntelliTrade scores them.`
- Body: `Smart Support Zones evaluates every EURUSD support zone and explains whether it looks weak, medium or strong — zone behaviour, reclaim confirmation, and an opportunity score you can actually interpret. Educational decision support, not signals.`
- CTA: `See how zone scoring works` → `/smart-support-zones`

**Homepage Founding strip**
- `Founding Member — €15/month for the first 100 members. Keep the price for as long as you stay subscribed.` CTA `Become a Founding Member` → `/pro#pricing`

**/pro hero**
- H1: `Your pre-trade routine, in one workspace.`
- Sub: `IntelliTrade Pro brings together Smart Support Zones, currency strength, the economic calendar, charts and risk tools — so every session starts with context instead of guesswork.`
- CTA: `Become a Founding Member — €15/month` → sign-up/upgrade per auth state

**/pro pricing block**
- Badge: `FOUNDING MEMBER · FIRST 100`
- `€15/month` · `Founding price for the first 100 Pro members. Keep it for as long as you stay subscribed. Cancel anytime — no contracts.`
- Sub-line: `After the first 100 members, new members join at the standard price.`

**/pro trust block**
- `Cancel anytime from your account — no emails, no retention flows.` · `Payments handled by Stripe.` · `IntelliTrade provides educational market context and analytics. It is not a signal service and does not provide financial advice.`

**/smart-support-zones hero**
- H1: `Know how strong a support zone really is.`
- Sub: `Smart Support Zones scores EURUSD support zones weak, medium or strong — and shows you why: zone behaviour, reclaim confirmation, session context, and an explained opportunity score.`
- Preview label: `Interactive preview — sample data for illustration.`
- CTA band: `Smart Support Zones is included in IntelliTrade Pro.` → `/pro`

**Calculator post-result CTA** (renders only after a calculation)
- `Position sized. Now check the context.`
- `IntelliTrade Pro adds support-zone quality, currency strength and event risk to your pre-trade routine.`
- CTA: `See IntelliTrade Pro` → `/pro?src=calc`

**Price-page CTA band**
- `The price is one input. Context is the rest.`
- `IntelliTrade Pro tracks currency strength, event risk and EURUSD zone quality — before you consider a trade.`
- CTA: `Explore Pro` → `/pro?src=<page>`

**Sign-up page side panel**
- `Create your free account` + bullets: `Subscribe to IntelliTrade Pro when you're ready` · `Founding Member pricing: €15/month for the first 100 members` · `Cancel anytime — no contracts`

**Upgrade page (Founding rework)**
- Badge: `INTELLITRADE PRO · FOUNDING MEMBER`
- Under price: `Founding price for the first 100 members — keep it for as long as you stay subscribed.`
- Feature list gains: `Smart Support Zones (EURUSD)` at the top.
- Logged-out CTA: `Create your account to subscribe` → `/auth/sign-up?redirect=/upgrade`
- FAQ (4 items): what Pro includes / cancel policy / what happens after 100 members / “is this a signal service?” (no — educational context, link to terms)

## 6. Account / upgrade flow (target)

- Logged-out, any CTA → `/pro` → pricing CTA → `/auth/sign-up?redirect=/upgrade` →
  (session) `/upgrade` → checkout → `/upgrade/success` → dashboard.
- `LoginForm` and `SignUpForm` honor a **relative-only** `redirect` param (same `safeNext`
  rule as `app/auth/confirm/route.ts`: must start with `/`, not `//`).
- Logged-in free user → `/pro` CTA goes straight to `/upgrade`.
- Logged-in Pro user → `/pro` CTA shows `Open your dashboard` → `/dashboardv2`; `/upgrade`
  already redirects active subs to the dashboard (keep).
- Phase D (permission): logged-out visits to premium prefixes redirect to
  `/pro?from=dashboard` (with an explainer banner) instead of `/auth/login`.

## 7. Founding Member pricing plan

- **Verify (owner)**: is `STRIPE_PRICE_ID` (prod env) a €15.00/month recurring price? The
  upgrade page renders whatever Stripe returns, so display self-corrects — but the offer copy
  says €15, so the env must match. If not: create the €15 price in Stripe and swap the env
  var (owner action; no code change).
- **Cap measurement**: `select count(*) from subscriptions where status in ('active','trialing')`
  — reliable today. Launch policy: manual monitoring (weekly + at every Stripe payment
  email). Automate enforcement only when count approaches ~80 (phase 2: checkout route
  checks count, flips `/pro` + `/upgrade` to standard-price state at 100).
- **No live "X spots remaining" counter** at launch — a static, truthful "first 100 members"
  line only. A counter showing "97 remaining" at 0 users hurts more than helps.
- **Member 101**: new members pay standard price (amount = founder decision, non-blocking;
  recommend deciding before ~member 70).
- **Existing subscribers**: whoever is on the current price keeps their Stripe price
  automatically; no records are touched. If the current price already is €15, founders'
  early supporters are automatically Founding Members.
- **Rejoin**: loses founding price (locked decision). No code needed at launch (manual —
  and only matters once the cap flips).
- **VAT**: owner decision (non-blocking, but before launch): recommended — enable Stripe Tax
  with tax-inclusive €15 for EU consumers and state `VAT included` under the price. Until
  confirmed, copy omits VAT claims entirely.

## 8. Analytics specification

Foundation rules: production-only (no events when `NODE_ENV !== "production"` or hostname is
`localhost`/`127.0.0.1`); Consent Mode v2 already default-denies until banner consent —
unchanged; all events via one typed helper (`lib/analytics.ts`, wrapping/replacing
`lib/gtag.ts` `event()`); GA4 recommended names where they exist, custom otherwise.

| Event | Trigger | Params | Where |
|---|---|---|---|
| `cta_click` | Any funnel CTA click | `cta_id`, `destination`, `src` | ProCtaCard + hero buttons |
| `calculator_result` | Successful calculation | `instrument` | LotSizeCalculator `handleCalculate` |
| `preview_interact` | Zone selected in public SSZ preview | `tool: "ssz"`, `zone_grade` | `/smart-support-zones` preview wrapper |
| `sign_up_start` | Sign-up form submit | — | SignUpForm |
| `sign_up` (GA4 rec.) | Sign-up success | `method: "password"` | SignUpForm |
| `login` (GA4 rec.) | Login success | `method: "password"` | LoginForm |
| `view_pricing` | Pricing block scrolled into view or page view | `page` | `/pro`, `/upgrade` |
| `begin_checkout` (GA4 rec.) | UpgradeButton click (logged-in path) | `currency: "EUR"`, `value: 15` | UpgradeButton |
| `purchase` (GA4 rec.) | `/upgrade/success` mount | `currency: "EUR"`, `value: 15`, `transaction_id` absent (client-side limitation) | success page client component |
| `founding_cta_click` | Founding-specific CTA | `location` | homepage strip, /pro pricing |

`purchase` is client-side and can double-fire on refresh — acceptable at this volume; guard
with `sessionStorage` flag. Server-side GA4 Measurement Protocol from the Stripe webhook is
the phase-2 permission item.

GA4 console tasks (owner, in OWNER_TODO): mark `sign_up`, `begin_checkout`, `purchase` as key
events; unwanted-referral exclusion for `checkout.stripe.com`; internal-traffic filter (dev
IPs); funnel exploration `page_view(landing) → cta_click → sign_up → begin_checkout →
purchase`; attribution report: purchase by landing page / source-medium.

A/B tests: none until ≥ ~200 sign-up-page sessions/month. Measure first.

## 9. Risk & permission matrix

Opus may implement autonomously: new public pages (`/pro`, `/smart-support-zones`),
homepage/nav/upgrade-page copy and structure, reusable CTA components, sign-up/login
redirect-param honoring (relative-only), analytics helper + frontend events + dev guard,
sitemap/SEO metadata, broken `/terms` link fix, AdSense doc updates.

Founder permission required (batched, phase D): middleware redirect-target change; any
Stripe product/price/checkout/webhook change; cap enforcement; server-side purchase
tracking; VAT presentation; email sending; new dependencies (none anticipated); anything
touching `subscriptions` schema or RLS.

Hard constraints: no research win-rates on public pages; no signal language; no fake
scarcity; no `NEXT_PUBLIC_` secrets; `npm run build` + `npm test` green per phase; commit
per repo conventions; **no push** (owner pushes at refactor end).

## 10. Roadmap (impact ÷ effort, sequenced)

| Phase | Content | Impact | Effort | Risk |
|---|---|---|---|---|
| A | Analytics foundation + quick fixes (nav Pro link, `/terms` fix, redirect honoring, dev GA guard, event helper) | High | S | Low |
| B | `/smart-support-zones` public preview + homepage rework | High | M | Low |
| C | `/pro` page + upgrade-page Founding rework + sign-up copy + contextual CTAs | Highest | M | Low |
| D | Founder-permission batch (middleware redirect, Stripe verify, VAT, GA4 console) | Med | S | Med |
| E | QA, analytics validation, sitemap/SEO pass, AdSense doc update | — | S | Low |

Post-launch (phase 2 backlog → IMPROVEMENTS.md): locked free-dashboard preview cards,
server-side purchase tracking, cap auto-enforcement, founder section, demo walkthrough,
blog-to-product modules, segment pages if traffic justifies.

## 11. QA / acceptance (summary — full list in OPUS_HANDOFF.md)

Desktop + mobile render for all new/changed pages; logged-out/free/Pro state matrix on
`/pro`, `/upgrade`, nav; no protected data on public pages (SSZ preview = mock only, no
win rates); events fire in prod build and NOT in dev; checkout unchanged and green;
`npm run build`, `npm test`, `npx tsc --noEmit` green; new pages in sitemap with metadata +
JSON-LD; every SSZ surface carries the educational disclaimer; zero banned vocabulary
(grep list in handoff).
