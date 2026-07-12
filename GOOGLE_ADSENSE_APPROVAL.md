# Google AdSense Approval Plan

Status: **denied ~5×** (as of 2026-07-05). Confirmed with owner: denials are **AdSense (publisher — showing Google ads on our site)**, not Google Ads (advertiser). This doc is the working checklist; work top-down across sessions, check boxes, date notes.

Context: the AdSense script (`ca-pub-4817545358384465`) is already in `app/layout.tsx` — that's the verification hookup, fine to keep while unapproved.

---

## 0. Diagnose (owner, blocking)

- [x] AdSense dashboard → Sites → intellitrade.tech → record the **exact rejection wording** here (typical: "Low value content", "Site behind login / under construction", "Policy violation", "Site not found/crawlable"). Everything below is prioritized generically until we have it.
- Note (2026-07-05, owner): latest rejection verbatim — **"Low value content. Your site does not yet meet the criteria of use in the Google publisher network."** with links to minimum content requirements + thin-content webmaster guidelines. §1 is the confirmed battle plan; §2/§3 are hygiene.

## 1. Confirmed blocker: "Low value content" — corrected diagnosis (2026-07-05 audit)

**Volume is NOT the problem.** Audit found: 172 published posts, ~10,000 words each, daily cadence, Sanity-served; nav is fully public (lot calc, blog, about, 4 price pages) — no login walls from the nav; homepage is substantive with Organization/WebSite schema.

The remaining explanation that fits: **the blog pattern-matches Google's "scaled content abuse" / templated-content signal.** Near-identical titles day after day ("… | Daily Forex Market Update | IntelliTrade"), uniform ~10k-word length, obviously automated cadence, and content that restates market info available everywhere. To a reviewer that reads as mass-produced, not "unique high quality content" — which is exactly the policy text they cited.

Fixes, in order of expected impact:

- [x] **Inject proprietary data into posts** — DONE 2026-07-12 (route b): `StrengthSnapshot` server component on `/blog/[slug]` renders the daily currency-strength reading closest to the post's publication (diverging bar meter, dataviz-validated colors, `/pro` CTA). Renders only when a snapshot exists within −72h/+12h of publish — history starts 2026-06-14, so ~25 recent posts + all future posts carry it; older posts are untouched (deliberate: a stamped block on all 182 would recreate the template signal). Route (a) stays open: cofounder pastes data into the custom GPT per `BLOG_PROMPT.md`'s data-weaving rule. **No retroactive body edits** of old dailies.
- [x] **Break the template** — title suffix: DONE 2026-07-12 (Claude). Three-part fix: (a) all 108 suffixed titles cleaned in Sanity and republished (backup `claudeLoad/adsense/post_titles_backup_2026-07-12.json`; slugs/URLs untouched); (b) frontend strips the suffix defensively at every render point (`lib/blog.ts cleanPostTitle` — metadata, h1, OG, JSON-LD, listings, RSS) so future suffixed posts can't leak it; (c) also fixed the **double brand suffix** (`… | IntelliTrade · IntelliTrade` in `<title>`). Bonus finds fixed same day: every post's meta description was the identical fallback sentence (no post has `summary`) → now derived per-post from body text; `/feed.xml` was a dead link in layout.tsx → real RSS route added. **Remaining (owner-side):** posts come from the cofounder's custom ChatGPT (hand-checked, hand-published) — new GPT instructions written to `BLOG_PROMPT.md` (2026-07-12); cofounder pastes them in and follows the per-post Sanity checklist (esp. filling `summary`). Decision same day: **no retroactive data injection** into old posts — dated dailies have no search value and a stamped-in data block would recreate the templated pattern; proprietary data ships instead as a render-time snapshot component on post pages (below) + in new posts via the prompt's data-weaving rule.
  - Correction to the audit above: posts are ~1,500–2,000 words (9–12k *chars*), not 10k words — length itself is fine; uniform titling/description was the stamped-out signal.
- [x] **Add evergreen pillar content** — first three written 2026-07-12, in Sanity as **drafts awaiting cofounder review** (one-time review, then publish together — guide 3 links guide 2): "Forex Market Sessions, Explained" (`forex-market-sessions-explained`), "Position Sizing in Forex: The Math That Keeps Accounts Alive" (`position-sizing-forex-risk-per-trade-math`), "Currency Correlation: Why FX Pairs Move Together — and When They Stop" (`currency-correlation-why-fx-pairs-move-together`). All ~1,200–1,500 words, summaries filled, tagged Education/Guide, internal links to calculator//pro//smart-support-zones, non-signals language. More topics remain fair game (future dailies should link these).
- [x] **Text-rich tool pages** — DONE 2026-07-12 for all four price pages: FAQ expanded (gold 3→7, silver 3→6, oil 3→6, bitcoin 3→6 — conversions, benchmark differences, macro relationships, volatility mechanics) + FAQPage JSON-LD added to each (all had visual FAQs but no structured data). FAQ items extracted to plain `faqData.ts` modules shared by client accordion + server schema. Lot-size calculator was already done (April 2026).
- [x] **prices-today enrichment** — infra DONE 2026-07-12: (a) **`marketContext` now renders server-side** on all four price pages (`lib/api/marketContext.ts` fetcher, 5-min revalidate) — the cofounder's daily text used to load client-side in a useEffect and was invisible to reliable crawling; (b) pages understand three new optional Sanity fields — `stats` (fact-box grid), `weekRecap` ("The bigger picture" historical context), `relatedLinks` ("Related reading" internal links) — plus a "Context updated {date}" dateline (`components/price-pages/MarketContextExtras.tsx`); (c) Studio schema snippet + content guidance handed off in **`SANITY_SCHEMA_UPGRADE.md`** (studio code lives outside this repo). Verified end-to-end: gold doc patched with related links → rendered in build HTML. Cofounder posts content; fields render the moment he fills them, no code change needed.
- [x] **No under-construction signals**: DONE 2026-07-12 — removed the three blurred "Coming Soon" cards from the homepage (conversion Phase B); the public /upgrade page already filters `soon` features out of view. New public pages /pro and /smart-support-zones ship no "coming soon" surfaces.
- [ ] **Owner: Search Console check** — how many of the 172 posts are actually indexed? If Google indexes few, that's corroborating evidence of the quality-signal problem (and fixing indexing is part of the same work).

## 2. Site compliance (mostly DONE 2026-07-05)

- [x] Privacy statement, cookie statement, terms of service, about — all exist and substantive.
- [x] Refund/billing findable — footer "Billing & refunds" link → `/termsOfService#tos-billing`.
- [x] Cookie consent banner + **Google Consent Mode v2** (defaults denied, banner updates; `components/layout/ConsentBanner.tsx`). Covers GA + ad storage signals.
- [x] Footer risk/educational disclaimer sitewide.
- [ ] Footer legal identity block — **owner fills `lib/company.ts`** (legal name, KvK, address; renders automatically once set).
- [x] Copy scrub — audited 2026-07-12: "opportunity grading" no longer exists anywhere; all public surfaces grep clean for recommendation language (buy/sell/entry/target/signal all appear only in factual/disclaimer contexts). Sole recurring term is "opportunity score" (deliberate product label, always adjacent to a "not signals" disclaimer on homepage, /pro, /smart-support-zones). Softening that name is a product/branding rename → owner decision, not a copy fix.
- [x] Crawl for broken links / empty pages / 404 — done 2026-07-12, local build **and live**. The initial live crawl was blocked: **Vercel Bot Protection (managed firewall rule) had action "challenge" since 2025-11-01** — every non-browser client got 429 (all ~5 AdSense denials happened while this was active; verified bots are exempt per Vercel, but the setting was not deliberate). Owner confirmed not deliberate → switched to action "log" via the Vercel API same day; verified live: plain curl now 200 on all public pages. Other findings: `/static/favicons/site.webmanifest` was 307→login (middleware gap — **fixed**); unknown URLs 307→login instead of 404 (soft-404; deliberate default-deny middleware — keeping security posture, low risk since no legacy dead URLs exist). Live deploy already serves /pro + /smart-support-zones; `/feed.xml` + webmanifest fixes go live on next deploy.

## 3. Technical checks

- [x] `robots.txt` + sitemap: verified 2026-07-12 — middleware matcher excludes all public routes (incl. `/pro`, `/smart-support-zones`, `.xml`/`.txt` paths); `app/robots.ts` allow-list updated with the two new pages; sitemap already lists them. `/feed.xml` RSS added (was an advertised dead link).
- [ ] Site verified in Search Console, sitemap submitted, no manual actions.
- [ ] After approval: add `ads.txt` at domain root with the pub ID (AdSense shows the exact line). Not needed for approval itself.
- [ ] EEA serving: enable **Privacy & messaging** in AdSense (Google's own certified CMP) — required to actually serve ads to EEA visitors. Our banner handles GA consent; the AdSense GDPR message handles TCF for ads. No code needed beyond the existing script.

## 4. Process discipline

- [ ] Re-request review only after §1 content work is visibly live in production (merged + deployed — branch work doesn't count until it's on intellitrade.tech).
- [ ] Space out re-applications; each rejection without visible change lowers credibility. Fix → deploy → wait a few days → request.
- [ ] Never apply with a different account/domain for the same site.

## 5. Honest strategic question (owner)

AdSense pays per impression/click — meaningful revenue needs serious traffic. This site's model is subscriptions; banner ads on tool pages can *hurt* conversion and look cheap next to a premium product. Worth deciding deliberately: is AdSense worth it at current traffic, or is the same content work better spent purely on SEO → subscriptions? (The §1 work is identical either way, so nothing is wasted by deferring the AdSense decision.)

> **Cross-reference (2026-07-12):** the conversion-funnel work planned in `CONVERSION_PLAN.md` / `OPUS_HANDOFF.md` directly advances §1 and §6: `/smart-support-zones` is the §6.3 premium-module teaser page (text-rich, ~600+ words + FAQ), `/pro` is another substantive public page, the homepage "Coming Soon" blurred cards are removed (§1 "no under-construction signals"), and all new copy follows the non-signal scrub (§2). Opus updates the checkboxes here when that work ships.

## 6. Session-sized work items (Claude)

1. Public-surface crawl + gap report (broken links, thin pages, gated nav share). (One session)
2. Tool-page content upgrades, one page per session, lot-size pattern. (Repeatable)
3. ~~Premium-module public teaser pages.~~ DONE 2026-07-12 — `/smart-support-zones` is a substantive (~600-word + 6-Q FAQ) public teaser for the flagship Pro module, and `/pro` is a full product-overview page. Both text-rich, both in the sitemap with WebPage + FAQPage schema.
4. Copy scrub public surfaces. (One session)
5. robots/sitemap/middleware crawler verification. (Small)

---

*Changelog*
- 2026-07-12 (session 5) — prices-today enrichment infra: marketContext SSR'd (was client-only → invisible to crawlers), three new optional fields (stats/weekRecap/relatedLinks) + dateline rendered when the cofounder fills them, Studio schema handoff in SANITY_SCHEMA_UPGRADE.md. §1 fully checked. Also: `distDir` env override (`NEXT_DIST_DIR`) so builds don't fight the always-on dev server for .next.
- 2026-07-12 (session 4) — **prod was challenging all non-browser traffic since 2025-11-01** (Vercel Bot Protection rule on "challenge"; owner: not deliberate) — switched to "log" via API, verified live; every AdSense denial happened under that setting. Live crawl now clean (all public pages 200). Remaining §1 item closed: silver/oil/bitcoin FAQ expansion + FAQPage JSON-LD (gold done in session 3). §1 is now fully checked except the owner-side GPT prompt swap.
- 2026-07-12 (session 3) — §1 nearly cleared: `StrengthSnapshot` proprietary-data component on post pages (dated daily reading, −72h/+12h window, renders nothing when no data); 3 evergreen pillar guides drafted into Sanity (cofounder review → publish); copy scrub audited clean; local-build crawl done (all public pages 200; fixed `.webmanifest` middleware gap; documented soft-404 tradeoff). Discovered Vercel Attack Challenge Mode active on prod (verified bots exempt — owner to confirm deliberate). Remaining §1: tool-page text upgrades (repeatable series). Remaining owner: GPT prompt swap, guide publish, Search Console, company.ts, challenge-mode check.
- 2026-07-12 (session 2) — **templated-content signal attacked directly**: 108 post titles de-suffixed in Sanity (published; backup in `claudeLoad/adsense/`), render-time strip added (`lib/blog.ts`), double `| IntelliTrade · IntelliTrade` title fixed, per-post meta descriptions derived from body (all `summary` fields were empty → identical description on ~180 pages), `/feed.xml` RSS route added (dead link before), robots allow-list updated. Build + 142 tests green; verified live on local prod server. Owner items moved to OWNER_TODO: pipeline suffix/summary fix, Search Console indexing check.
- 2026-07-05 — doc created as GOOGLE_ADS_APPROVAL.md assuming advertiser denials; corrected same day: denials are AdSense (owner confirmed), renamed + rewritten. Consent Mode v2, footer legal block, refund link shipped (commit 04f0bd7).
- 2026-07-12 — conversion-system build (Phases A–E) advanced several items: two new text-rich public pages (`/smart-support-zones`, `/pro`) added §6.3 teaser + originality surface; homepage "Coming Soon" cards removed (§1 no-under-construction); new public copy written to the non-signal standard (§2, partial — existing surfaces like /support-resistance not yet re-scrubbed). Analytics now production-only (dev/localhost no longer pollutes GA4), which improves data quality but is orthogonal to the low-value-content blocker. Still outstanding for AdSense: §1 proprietary-data-in-posts + title/template break, §2 full copy scrub, owner Search Console indexing check.
