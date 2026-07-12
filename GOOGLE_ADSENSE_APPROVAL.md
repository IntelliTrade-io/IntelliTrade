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

- [ ] **Inject proprietary data into posts** — our strongest and cheapest originality lever. We run pipelines nobody else has (currency-strength snapshots, S&R zone data, economic-calendar aggregation). Embedding real charts/tables from our own Supabase data makes posts demonstrably unique — the one thing templated-content detection can't hold against us. (Also a product showcase → subscription funnel.)
- [ ] **Break the template**: vary titles (drop the fixed "| Daily Forex Market Update |" suffix pattern), vary length (a focused 1,500-word update beats a padded 10k one), vary structure. If posts are AI-assisted, that's fine by current Google guidance — *helpful* is the bar — but they must stop looking stamped out.
- [ ] **Add evergreen pillar content**: guides that answer real searches (risk management, session timing, pair characteristics) and get linked from the daily posts. A blog that is 100% dailies has no lasting spine.
- [ ] **Text-rich tool pages**: replicate the lot-size-calculator SEO upgrade (explanations, worked examples, FAQ) on every public calculator/price page.
- [ ] **prices-today enrichment** (already in IMPROVEMENTS.md): historical context, related links.
- [ ] **No under-construction signals**: remove/hide "coming soon" items on public pages (upgrade page lists "Macro Mastery — soon").
- [ ] **Owner: Search Console check** — how many of the 172 posts are actually indexed? If Google indexes few, that's corroborating evidence of the quality-signal problem (and fixing indexing is part of the same work).

## 2. Site compliance (mostly DONE 2026-07-05)

- [x] Privacy statement, cookie statement, terms of service, about — all exist and substantive.
- [x] Refund/billing findable — footer "Billing & refunds" link → `/termsOfService#tos-billing`.
- [x] Cookie consent banner + **Google Consent Mode v2** (defaults denied, banner updates; `components/layout/ConsentBanner.tsx`). Covers GA + ad storage signals.
- [x] Footer risk/educational disclaimer sitewide.
- [ ] Footer legal identity block — **owner fills `lib/company.ts`** (legal name, KvK, address; renders automatically once set).
- [ ] Copy scrub for recommendation language on public pages (e.g. `/support-resistance` says "opportunity grading" — has a "not trading signals" disclaimer, but reword where cheap). Matters less for AdSense than for legal posture — see memory hard-no on signals framing.
- [ ] Crawl the live Vercel deploy for broken links / empty pages / custom 404.

## 3. Technical checks

- [ ] `robots.txt` + sitemap: Googlebot must reach the public pages (verify the middleware never blocks/gates crawlers on public routes).
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
3. Premium-module public teaser pages. (One session)
4. Copy scrub public surfaces. (One session)
5. robots/sitemap/middleware crawler verification. (Small)

---

*Changelog*
- 2026-07-05 — doc created as GOOGLE_ADS_APPROVAL.md assuming advertiser denials; corrected same day: denials are AdSense (owner confirmed), renamed + rewritten. Consent Mode v2, footer legal block, refund link shipped (commit 04f0bd7).
