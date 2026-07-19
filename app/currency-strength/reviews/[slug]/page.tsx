import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import {
  getPublishedSlugs,
  getReviewBySlug,
  isCsmReviewsEnabled,
  reviewMetaDescription,
  reviewMetaTitle,
  type ReviewDto,
} from "@/lib/api/csmReviews";
import { ReviewChart } from "@/components/strength/reviews/ReviewChart";
import { ReviewLadder } from "@/components/strength/reviews/ReviewLadder";
import { ReviewMetrics } from "@/components/strength/reviews/ReviewMetrics";
import {
  REVIEW_CONVERSION_LEAD,
  REVIEW_CTA_LABEL,
  REVIEW_EDUCATIONAL_NOTE,
} from "@/lib/strength-reviews-copy";

const BASE = "https://intellitrade.tech";

export const revalidate = 3600;
export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  const slugs = await getPublishedSlugs();
  return slugs.map((s) => ({ slug: s.slug }));
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const day = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", timeZone: "UTC" }).format(d);
  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "UTC",
  }).format(d);
  return `${day}, ${time} UTC`;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const review = await getReviewBySlug(slug);
  if (!review) return { title: "Review Not Found · IntelliTrade" };

  const url = `${BASE}/currency-strength/reviews/${slug}`;
  const title = reviewMetaTitle(review);
  const description = reviewMetaDescription(review);

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: { title, description, url, type: "website" },
    twitter: { card: "summary_large_image", title, description },
  };
}

function OriginalReadingCard({ review }: { review: ReviewDto }) {
  const top = review.ladder[0];
  const bottom = review.ladder[review.ladder.length - 1];
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-clip-padding p-5">
      <div className="radial-backdrop" />
      <div className="relative z-10">
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/50">Original reading</h2>
        <dl className="mt-4 space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <dt className="text-white/50">Strongest</dt>
            <dd className="font-mono text-white">{top?.currency} ({top ? top.score.toFixed(1) : "0"})</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-white/50">Weakest</dt>
            <dd className="font-mono text-white">{bottom?.currency} ({bottom ? bottom.score.toFixed(1) : "0"})</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-white/50">Pair</dt>
            <dd className="font-mono text-white">{review.pairSymbol}</dd>
          </div>
          <div className="flex items-center justify-between">
            <dt className="text-white/50">Regime at capture</dt>
            <dd className="text-white">{review.regimeLabel}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  if (!isCsmReviewsEnabled()) notFound();
  const { slug } = await params;
  const review = await getReviewBySlug(slug);
  if (!review) notFound();

  const url = `${BASE}/currency-strength/reviews/${slug}`;

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: review.headline,
    description: review.subtitle,
    url,
    datePublished: review.publishedAt,
    dateModified: review.updatedAt,
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Currency Strength", item: `${BASE}/currency-strength` },
      { "@type": "ListItem", position: 3, name: "Reviews", item: `${BASE}/currency-strength/reviews` },
      { "@type": "ListItem", position: 4, name: review.headline, item: url },
    ],
  };

  const chartSummary = `${review.pairSymbol}: reference close ${review.referenceClose} on ${fmtDate(review.referenceCloseTime)}. Thirty-bar result ${review.shortReturnPct.toFixed(2)} percent, sixty-bar result ${review.longReturnPct.toFixed(2)} percent, classified ${review.classification}.`;

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <div className="mx-auto max-w-5xl px-4 pb-28 pt-10 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/40">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/currency-strength/reviews" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Historical Reviews
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">{review.pairSymbol}</li>
          </ol>
        </nav>

        <div className="mb-8">
          <span className="inline-flex items-center rounded-full border border-emerald-400/25 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-200">
            Completed review
          </span>
          <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {review.headline}
          </h1>
          <p className="mt-2 text-base text-white/50">{review.subtitle}</p>
          <p className="mt-3 text-[13px] text-white/40">
            Captured {fmtDateTime(review.capturedAt)} · Published {fmtDate(review.publishedAt)} · {review.modelGeneration}
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-4 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-6">
            <div className="radial-backdrop" />
            <div className="relative z-10">
              <ReviewChart
                candles={review.candles}
                referenceClose={review.referenceClose}
                referenceCloseTime={review.referenceCloseTime}
                pairSymbol={review.pairSymbol}
                summary={chartSummary}
              />
            </div>
          </div>

          <div className="space-y-6">
            <OriginalReadingCard review={review} />
            <div className="relative overflow-hidden rounded-2xl border border-white/15 bg-clip-padding p-5">
              <div className="radial-backdrop" />
              <div className="relative z-10">
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-[0.18em] text-white/50">
                  Currency strength at capture
                </h2>
                <ReviewLadder ladder={review.ladder} />
              </div>
            </div>
          </div>
        </div>

        <div className="mt-8">
          <ReviewMetrics review={review} />
        </div>

        <div className="relative mt-8 overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10">
            <h2 className="text-lg font-semibold text-white">How the market developed</h2>
            <p className="mt-3 text-sm leading-relaxed text-white/60">{review.explanationText}</p>
          </div>
        </div>

        <div className="relative mt-8 overflow-hidden rounded-3xl border border-brand/25 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-8">
          <div className="radial-backdrop" />
          <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[15px] font-medium text-white">
                Pro members saw this reading live on {fmtDate(review.capturedAt)}.
              </p>
              <p className="mt-2 max-w-lg text-sm leading-relaxed text-white/55">{REVIEW_CONVERSION_LEAD}</p>
            </div>
            <Link
              href="/currency-strength-meter"
              className="inline-flex shrink-0 items-center justify-center gap-2 rounded-full bg-gradient-to-r from-brand to-brandLight px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-brand/35 transition-all hover:opacity-90"
            >
              {REVIEW_CTA_LABEL}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>

        <div className="mt-8 flex flex-wrap items-center gap-4 text-[13px]">
          <Link href="/currency-strength/reviews/methodology" className="text-brand-200/90 transition hover:text-white">
            Methodology
          </Link>
          <Link href="/currency-strength/reviews" className="text-brand-200/90 transition hover:text-white">
            All completed reviews
          </Link>
          <Link href={`/currency-strength/${review.pairSymbol.toLowerCase()}`} className="text-brand-200/90 transition hover:text-white">
            {review.pairSymbol} strength today
          </Link>
        </div>

        <p className="mt-6 text-xs leading-relaxed text-white/35">{REVIEW_EDUCATIONAL_NOTE}</p>
      </div>
    </>
  );
}
