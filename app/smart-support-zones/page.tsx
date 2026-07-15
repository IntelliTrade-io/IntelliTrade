import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import { ArrowRight, ChevronDown } from "lucide-react";
import { SmartSupportZonesPreview } from "@/components/support-resistance/SmartSupportZonesPreview";
import { TrackedLink } from "@/components/layout/TrackedLink";
import { supportResistanceCopy } from "@/components/support-resistance/copy";

export const metadata: Metadata = {
  title: "Smart Support Zones: EURUSD Support Zone Strength Scoring | IntelliTrade",
  description:
    "Smart Support Zones scores EURUSD support zones weak, medium or strong, and explains why: zone behaviour, reclaim confirmation, session context and an opportunity score. Educational decision support, not signals.",
  alternates: { canonical: "https://intellitrade.tech/smart-support-zones" },
  openGraph: {
    title: "Smart Support Zones: EURUSD Support Zone Strength Scoring | IntelliTrade",
    description:
      "Go beyond generic support zones. See whether a EURUSD support zone looks weak, medium or strong, and why.",
    url: "https://intellitrade.tech/smart-support-zones",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Smart Support Zones: EURUSD Support Zone Strength Scoring",
    description:
      "Score EURUSD support zones weak, medium or strong, with reclaim confirmation and an explained opportunity score.",
  },
};

// ─── FAQ (drives both FAQPage JSON-LD and the visible accordion) ───────────────

const FAQ: { q: string; a: string }[] = [
  {
    q: "Does a strong zone mean price will bounce?",
    a: "No. A strong classification means the zone's structure and history have scored well in our evaluation framework. It says nothing certain about the future. Markets can and do break strong support. The classification exists to help you rank areas for your own preparation, not to predict outcomes.",
  },
  {
    q: "Is Smart Support Zones a signal service?",
    a: "No. IntelliTrade does not send trade signals, entries, or recommendations. Smart Support Zones summarizes historical zone behaviour and current context as educational decision support. What you do with that context is your decision.",
  },
  {
    q: "Which markets and timeframes are covered?",
    a: "EURUSD support zones on M15 execution context. Support only; resistance is not currently scored. Coverage is deliberately narrow while the scoring model is refined; more pairs are planned.",
  },
  {
    q: "What is reclaim confirmation?",
    a: "A reclaim is when price dips into a support zone and then closes back above it, rather than merely touching the zone. A confirmed reclaim tells you the zone was tested and, so far, defended, which is different information than an untested zone or an unresolved dip.",
  },
  {
    q: "What data does the preview on this page use?",
    a: "The interactive preview on this page uses illustrative sample data so you can explore how zones, scores and explanations are presented. Live EURUSD zones, refreshed throughout the session, are available inside IntelliTrade Pro.",
  },
  {
    q: "What does a percentage like “86.57% historical reaction rate” mean?",
    a: "It means 86.57% of resolved qualifying events in that cohort reached the model's 0.50R first-reaction target during testing. The figures are cumulative cohorts: Green+ includes Green, Elite Green and A+ (81.94%, 155 resolved events), Elite+ includes Elite Green and A+ (84.40%, 109 resolved events), and A+ stands alone (86.57%, 67 resolved events). Unresolved events are excluded. It is a historical measurement over a bucket of similar setups, not a calibrated probability forecast for any specific live zone. Historical results do not guarantee future performance.",
  },
  {
    q: "How is the opportunity score calculated?",
    a: "The score combines the zone's static strength (structure and history of the shelf) with dynamic context: reclaim status, approach quality, and session timing. Each component is shown with the score, so you can see why a zone is graded the way it is, and disagree with it if your own analysis says otherwise.",
  },
];

const webPageSchema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Smart Support Zones: EURUSD Support Zone Strength Scoring",
  description:
    "Smart Support Zones scores EURUSD support zones weak, medium or strong, with reclaim confirmation and an explained opportunity score. Educational decision support.",
  url: "https://intellitrade.tech/smart-support-zones",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
      { "@type": "ListItem", position: 2, name: "Smart Support Zones", item: "https://intellitrade.tech/smart-support-zones" },
    ],
  },
};

const softwareAppSchema = {
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  name: "IntelliTrade Smart Support Zones",
  applicationCategory: "FinanceApplication",
  operatingSystem: "Web",
  description:
    "Support-zone strength scoring for EURUSD (M15). Evaluates whether a support zone looks weak, medium or strong, with reclaim confirmation and an explained opportunity score.",
  url: "https://intellitrade.tech/smart-support-zones",
  offers: { "@type": "Offer", price: "15", priceCurrency: "EUR" },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ.map(({ q, a }) => ({
    "@type": "Question",
    name: q,
    acceptedAnswer: { "@type": "Answer", text: a },
  })),
};

// ─── Small presentational helpers ──────────────────────────────────────────────

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/36 mb-2">{children}</p>
  );
}

export default function SmartSupportZonesPage() {
  return (
    <div className="w-full px-4 pb-24 pt-16 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(softwareAppSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }} />

      <div className="mx-auto max-w-7xl">
        {/* ── Hero ── */}
        <section className="mb-14 text-center">
          <div className="inline-flex items-center rounded-full border border-violet-400/30 bg-violet-500/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-300 mb-6">
            IntelliTrade Pro · Smart Support Zones
          </div>
          <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-white leading-tight mb-6">
            Know how strong a support<br className="hidden sm:block" /> zone really is.
          </h1>
          <p className="text-base sm:text-lg text-white/50 max-w-2xl mx-auto mb-8 leading-relaxed">
            Smart Support Zones scores EURUSD support zones weak, medium or strong, and shows you why:
            zone behaviour, reclaim confirmation, session context, and an explained opportunity score.
          </p>
          <TrackedLink
            href="/pro?src=ssz"
            event="cta_click"
            params={{ cta_id: "ssz_hero", destination: "/pro", src: "ssz" }}
            className="inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_32px_rgba(139,92,246,0.35)] transition-all hover:bg-violet-500"
          >
            See IntelliTrade Pro
            <ArrowRight className="h-4 w-4" />
          </TrackedLink>
        </section>

        {/* ── Interactive preview ── */}
        <section className="mb-16">
          <div className="mb-3 flex items-center justify-between">
            <Eyebrow>Interactive preview</Eyebrow>
            <span className="text-[11px] text-white/34">Sample data for illustration</span>
          </div>
          <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-3 sm:p-4">
            <SmartSupportZonesPreview />
          </div>
          <p className="mt-3 text-center text-xs text-white/34">
            Live EURUSD zones, refreshed throughout the session, are available inside IntelliTrade Pro.
          </p>
        </section>

        {/* ── Educational content ── */}
        <section className="mx-auto max-w-3xl space-y-10 text-[15px] leading-relaxed text-white/70">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">What is a support zone?</h2>
            <p>
              A support zone is a price area where a market has repeatedly slowed down, paused, or turned
              after falling. Traders watch these areas because they often mark where buying interest has
              appeared before. But &ldquo;often&rdquo; is doing a lot of work in that sentence: not all
              support is equal, and treating every zone the same is one of the most common mistakes in
              retail trading.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">Why generic zone tools fall short</h2>
            <p>
              Most support and resistance indicators draw lines or boxes wherever price has touched a level
              a few times. They answer one question: <em>where</em> has price reacted? They stay silent on
              the question that actually matters for preparation: <em>how good is this area now?</em> A
              shelf that held twice in quiet conditions and a shelf that has been defended repeatedly during
              active sessions look identical as rectangles on a chart. They are not the same thing.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">What Smart Support Zones does differently</h2>
            <p className="mb-4">
              Smart Support Zones evaluates each EURUSD support zone on the M15 timeframe and assigns it a
              strength classification (weak, medium or strong) based on how the zone has actually behaved:
              how it was formed, how price has approached it, and how it has held. On top of the static
              strength of the shelf itself, the tool grades the <em>current</em> context around the zone,
              including whether a reclaim has been confirmed: that is, whether price has closed back above
              the zone after dipping into it, rather than merely touching it.
            </p>
            <p>
              The result is an opportunity score with an explanation attached. Instead of a bare rectangle,
              you see why a zone is classified the way it is, what would strengthen or weaken that reading,
              and whether the surrounding session context supports paying attention to it at all. Zones that
              fail the context filters are explicitly marked as watch-only or blocked, with the reason stated.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">What the classifications mean</h2>
            <ul className="space-y-2">
              <li><span className="text-white/90 font-medium">Strong / medium / weak</span> describe the underlying shelf: its structure and history.</li>
              <li><span className="text-white/90 font-medium">The dynamic grade</span> describes the current situation around that shelf, including reclaim confirmation and session timing. A structurally strong shelf can still grade poorly if the current approach is messy or the timing filter fails.</li>
              <li><span className="text-white/90 font-medium">Informational zones</span> are the neutral baseline: a support zone exists, but no validated historical edge is attached to it.</li>
              <li><span className="text-white/90 font-medium">Watch</span> means the setup is below the activation threshold; <span className="text-white/90 font-medium">Blocked</span> means one or more required conditions were not met.</li>
            </ul>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">Honest scope</h2>
            <p>
              Smart Support Zones currently covers EURUSD support zones on M15 execution context. Support
              only; resistance zones are not scored. More pairs and resistance coverage are on the roadmap.
              We would rather ship one pair scored honestly than twenty pairs scored loosely.
            </p>
          </div>

          <div>
            <h2 className="text-2xl font-semibold tracking-tight text-white mb-3">What this is, and is not</h2>
            <p>
              Smart Support Zones is educational decision support for your pre-trade preparation. A strong
              zone is not a prediction that price will bounce, and an opportunity score is not a
              recommendation to buy. The tool helps you understand whether a support area deserves a place
              in your preparation for a potential trade setup; the decision itself stays yours.
            </p>
          </div>
        </section>

        {/* ── Disclaimer band ── */}
        <div className="mx-auto mt-10 max-w-3xl rounded-[22px] border border-amber-300/16 bg-amber-300/[0.06] px-5 py-4 text-sm leading-relaxed text-amber-50/80">
          {supportResistanceCopy.disclaimer}
        </div>

        {/* ── FAQ ── */}
        <section className="mx-auto mt-16 max-w-3xl">
          <Eyebrow>FAQ</Eyebrow>
          <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-white mb-6">Common questions</h2>
          <div className="space-y-2">
            {FAQ.map(({ q, a }) => (
              <details key={q} className="group rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between text-[15px] font-medium text-white">
                  {q}
                  <ChevronDown className="h-4 w-4 shrink-0 text-white/40 transition-transform group-open:rotate-180" />
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-white/60">{a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── CTA band ── */}
        <section className="relative mx-auto mt-16 max-w-3xl overflow-hidden rounded-[28px] border border-violet-500/20 bg-violet-500/[0.05] p-8 text-center">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(139,92,246,0.12),transparent_60%)]" />
          <h2 className="relative z-10 text-2xl font-semibold tracking-tight text-white mb-2">
            Smart Support Zones is included in IntelliTrade Pro.
          </h2>
          <p className="relative z-10 mx-auto mb-6 max-w-xl text-sm text-white/55">
            Founding Member: €15/month for the first 100 members. Keep the price for as long as you stay
            subscribed.
          </p>
          <TrackedLink
            href="/pro?src=ssz"
            event="cta_click"
            params={{ cta_id: "ssz_footer", destination: "/pro", src: "ssz" }}
            className="relative z-10 inline-flex items-center gap-2 rounded-full bg-violet-600 px-6 py-3 text-sm font-semibold text-white shadow-[0_0_32px_rgba(139,92,246,0.35)] transition-all hover:bg-violet-500"
          >
            Explore IntelliTrade Pro
            <ArrowRight className="h-4 w-4" />
          </TrackedLink>
        </section>
      </div>
    </div>
  );
}
