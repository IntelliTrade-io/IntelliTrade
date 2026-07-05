# Google Ads Approval Plan

Status: **denied ~5×** (as of 2026-07-05). This doc is the working checklist to get approved. Pick up in any session: work top-down, check boxes, date notes. Companion: `OWNER_TODO.md` (owner-only steps), `IMPROVEMENTS.md` (SEO/content).

**Rule #1: stop resubmitting until every section below is done.** Repeated fast rejections escalate to account suspension, which is far harder to undo than a disapproval.

---

## 0. Diagnose first (owner, blocking)

- [ ] From Google Ads → Policy Manager (or the disapproval emails), record the **exact policy names** cited for each of the 5 denials (e.g. "Speculative financial products", "Advertiser verification", "Destination requirements", "Unacceptable business practices"). Paste them into the note here. Everything below is prioritized generically until we know these.
- Note:

Why it matters: "site fixes" only help against destination/content policies. If the denial is **certification/verification**, no amount of site polish fixes it — the certification path (§4) is the whole game.

## 1. Likely root cause: restricted financial vertical

Forex tooling sits in Google's **speculative financial products** orbit (CFDs, forex, spread betting). Google restricts not only brokers but **"instruments related to" them — signal providers, aggregators, affiliates**. A dashboard selling trading signals/opportunities ("SR Alpha opportunities", "best expressions") likely gets classified here.

Two viable postures — pick one deliberately:

- **A. Certify (hard, maybe impossible for us):** certification generally demands a license from the national regulator of every targeted country (NL = AFM; UK = FCA; etc.). We are a tools/analytics company, not a licensed investment firm — likely not licensable, and NL/EEA additionally runs mandatory **financial services advertiser verification**.
- **B. Reposition what we advertise (realistic):** ads + landing pages promote only the **educational/utility surface** — calculators, price pages, market-hours, glossary, blog — with zero signal/performance framing. The subscription product stays on the site but is not the ad destination and not promised returns anywhere ads land. Many tool sites get approved this way.

Recommendation: **B**, while checking A's verification requirement for NL if we target NL at all. Consider initially targeting only geos without extra financial-verification programs.

## 2. Site compliance (Claude can do most; verify against live Vercel deploy)

Legal/trust surface — Google manually eyeballs these:

- [ ] **Privacy policy** page — GDPR-grade (data collected, purpose, processors: Supabase/Stripe/Vercel/analytics, retention, rights, contact). Linked in footer sitewide.
- [ ] **Terms of service** page — incl. subscription terms.
- [ ] **Refund / cancellation policy** page — explicit, findable (Stripe subscription: state the cancel/refund rules). "Unacceptable business practices" denials often come from missing this.
- [ ] **Cookie consent banner + Google Consent Mode v2** — mandatory for EEA ad traffic since 2024. Without it, ads to EEA are a non-starter.
- [ ] **Identity block in footer**: legal entity name, KvK/registration number, physical address, working contact email (not just a form). Google cross-checks this against advertiser verification data — must match exactly.
- [ ] **About page** with the real company/people.
- [ ] **Risk disclaimer**, footer + every tool page: trading involves substantial risk of loss; content is informational/educational, **not investment advice**; past performance ≠ future results.
- [ ] **Scrub performance/earnings claims sitewide**: no "profit", "win rate", "beat the market", "opportunity score that makes you money" phrasing on public pages; no testimonials with result claims. Reword to analytical language ("measures", "ranks", "visualizes").
- [ ] **No thin/broken surface**: every public route renders real content, no placeholder/under-construction pages, no dead links (crawl the live site), custom 404.
- [ ] **Landing pages substantially ungated**: ad destinations must show real content without login/paywall walls. Free tier pages (calculators, prices-today, blog) qualify; premium shells behind middleware do not.
- [ ] **Site ↔ ad consistency**: business name, domain, and payment-profile entity all identical.

## 3. Google account side (owner)

- [ ] Complete **advertiser identity verification** (ID + business docs) — entity must match site footer + payment profile.
- [ ] Complete **business operations verification** if prompted (they ask what you sell, business model; answer as analytics/education tools, consistent with posture B).
- [ ] Payment profile: business (not personal), same legal entity.
- [ ] One clean **campaign shaped for posture B**: destination = free calculator or prices page; ad copy with zero trading-outcome promises; exclude geos with special financial-ads verification (start small: e.g. exclude NL/UK/etc. until verified there).
- [ ] After §2 fully deployed to production: request re-review **once** via Policy Manager, citing the changes.

## 4. If denial = certification/financial verification (from §0)

- [ ] Read the specific certification form Google links in the denial. Determine whether "tools/education, not a broker, no CFDs sold" is a declarable category (in several geo programs it is — there's an exemption path for non-licensed businesses whose services don't require a license).
- [ ] NL targeting: check AFM-verification requirement scope — if our product legally doesn't require an AFM license, the exemption declaration route applies; document why (tools, no order execution, no personal advice).
- [ ] If exemption route fails: drop the geo from targeting rather than re-risking the account.

## 5. If the account got suspended along the way

- [ ] Do NOT create a new account/domain variant (circumvention = permanent ban).
- [ ] Single appeal after §2+§3 are demonstrably done, listing concrete changes with URLs.

## 6. Session-sized work items (Claude)

1. Audit live site against §2, produce gap list. (One session)
2. Write/ship missing legal pages (Sanity or static routes) + footer identity/disclaimer block. (One session; owner supplies entity details, KvK, address)
3. Consent Mode v2 + cookie banner. (One session; touches analytics wiring)
4. Sitewide copy scrub for performance claims (grep "profit|win|earn|guarantee|beat" + manual pass on dashboard marketing pages). (One session)
5. Build the posture-B landing surface if needed (calculator hub page as ad destination). (One session)

---

*Changelog*
- 2026-07-05 — doc created (context: ~5 denials, reasons not yet recorded).
