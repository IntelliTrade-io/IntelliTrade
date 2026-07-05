# Google AdSense Approval Plan

Status: **denied ~5×** (as of 2026-07-05). Confirmed with owner: denials are **AdSense (publisher — showing Google ads on our site)**, not Google Ads (advertiser). This doc is the working checklist; work top-down across sessions, check boxes, date notes.

Context: the AdSense script (`ca-pub-4817545358384465`) is already in `app/layout.tsx` — that's the verification hookup, fine to keep while unapproved.

---

## 0. Diagnose (owner, blocking)

- [ ] AdSense dashboard → Sites → intellitrade.tech → record the **exact rejection wording** here (typical: "Low value content", "Site behind login / under construction", "Policy violation", "Site not found/crawlable"). Everything below is prioritized generically until we have it.
- Note:

## 1. Most likely blocker: "Low value content"

By far the most common AdSense rejection, and this site fits the profile: tool/dashboard-heavy, thin written content, and much of the product **behind a login/paywall the reviewer can't see**. AdSense reviews only the public surface.

Fixes (overlaps heavily with the SEO backlog in `IMPROVEMENTS.md` — same work, two payoffs):

- [ ] **Blog depth**: consistent cadence of substantial original posts (aim: 20–30+ live articles before re-applying; reviewers look at volume + originality). Sanity pipeline exists — this is a content task, not a code task.
- [ ] **Text-rich tool pages**: replicate the lot-size-calculator SEO upgrade (explanations, worked examples, FAQ) on every public calculator/price page. Thin pages with one widget = low value.
- [ ] **prices-today enrichment** (already in IMPROVEMENTS.md): historical context, related links — more substance per page.
- [ ] **Public surface share**: reviewer clicking the nav must not hit mostly login walls. Ensure enough nav destinations are fully public (blog, calculators, prices, about). Consider a public teaser page per premium module (screenshot + explanation) instead of a bare login redirect.
- [ ] **No under-construction signals**: remove/hide "coming soon" items on public pages (e.g. the upgrade page lists "Macro Mastery — soon"). Placeholder anything = rejection fuel.

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

## 6. Session-sized work items (Claude)

1. Public-surface crawl + gap report (broken links, thin pages, gated nav share). (One session)
2. Tool-page content upgrades, one page per session, lot-size pattern. (Repeatable)
3. Premium-module public teaser pages. (One session)
4. Copy scrub public surfaces. (One session)
5. robots/sitemap/middleware crawler verification. (Small)

---

*Changelog*
- 2026-07-05 — doc created as GOOGLE_ADS_APPROVAL.md assuming advertiser denials; corrected same day: denials are AdSense (owner confirmed), renamed + rewritten. Consent Mode v2, footer legal block, refund link shipped (commit 04f0bd7).
