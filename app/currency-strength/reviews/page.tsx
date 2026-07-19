import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import { getPublishedReviews, isCsmReviewsEnabled } from "@/lib/api/csmReviews";
import { ReviewArchiveList } from "@/components/strength/reviews/ReviewArchiveList";
import { REVIEW_ARCHIVE_EMPTY, REVIEW_ARCHIVE_INTRO } from "@/lib/strength-reviews-copy";

const BASE = "https://intellitrade.tech";
const URL = `${BASE}/currency-strength/reviews`;

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Currency Strength Reviews | What Happened Next | IntelliTrade",
  description:
    "Completed reviews of past daily currency-strength readings: what the strongest-versus-weakest pair did over the following weeks, measured and classified. Every qualifying case, positive or negative.",
  alternates: { canonical: URL },
  openGraph: {
    title: "Currency Strength Reviews",
    description: "What happened after each daily currency-strength reading, measured over the following weeks.",
    url: URL,
    type: "website",
  },
};

export default async function ReviewsArchivePage() {
  if (!isCsmReviewsEnabled()) notFound();
  const items = await getPublishedReviews();

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Currency Strength Reviews",
    description: "Completed reviews of past daily currency-strength readings.",
    url: URL,
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Currency Strength", item: `${BASE}/currency-strength` },
      { "@type": "ListItem", position: 3, name: "Reviews", item: URL },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/40">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/currency-strength" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Currency Strength
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">Reviews</li>
          </ol>
        </nav>

        <div className="mb-8">
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Currency Strength Reviews
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-white/50 sm:text-base">
            {REVIEW_ARCHIVE_INTRO}
          </p>
          <div className="mt-4 flex flex-wrap gap-4 text-[13px]">
            <Link href="/currency-strength/reviews/methodology" className="text-brand-200/90 transition hover:text-white">
              Methodology
            </Link>
            <Link href="/currency-strength/reviews/scorecard" className="text-brand-200/90 transition hover:text-white">
              Scorecard
            </Link>
          </div>
        </div>

        {items.length === 0 ? (
          <p className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-white/45">
            {REVIEW_ARCHIVE_EMPTY}
          </p>
        ) : (
          <ReviewArchiveList items={items} />
        )}
      </div>
    </>
  );
}
