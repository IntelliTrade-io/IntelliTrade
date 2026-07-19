import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import { isCsmReviewsEnabled } from "@/lib/api/csmReviews";
import { METHODOLOGY_SECTIONS, REVIEW_EDUCATIONAL_NOTE } from "@/lib/strength-reviews-copy";

const BASE = "https://intellitrade.tech";
const URL = `${BASE}/currency-strength/reviews/methodology`;

export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Currency Strength Review Methodology | IntelliTrade",
  description:
    "How IntelliTrade currency-strength reviews work: how a case qualifies, the thirty and sixty four-hour-bar windows, direction normalization, the classification bands, and the publication policy.",
  alternates: { canonical: URL },
  openGraph: { title: "Currency Strength Review Methodology", description: "How the reviews qualify, evaluate, and publish.", url: URL, type: "website" },
};

export default function MethodologyPage() {
  if (!isCsmReviewsEnabled()) notFound();

  const webPageSchema = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: "Currency Strength Review Methodology",
    description: "How IntelliTrade currency-strength reviews qualify, evaluate, and publish.",
    url: URL,
  };
  const breadcrumbSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: `${BASE}/` },
      { "@type": "ListItem", position: 2, name: "Currency Strength", item: `${BASE}/currency-strength` },
      { "@type": "ListItem", position: 3, name: "Reviews", item: `${BASE}/currency-strength/reviews` },
      { "@type": "ListItem", position: 4, name: "Methodology", item: URL },
    ],
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(webPageSchema) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(breadcrumbSchema) }} />

      <div className="mx-auto max-w-3xl px-4 pb-28 pt-10 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/40">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/currency-strength/reviews" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Historical Reviews
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">Methodology</li>
          </ol>
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Review methodology
        </h1>
        <p className="mt-3 text-sm leading-relaxed text-white/50">
          Reviews are deterministic and reproducible. Nothing on a review page is an opinion; every
          number comes from the same production data that produced the original reading.
        </p>

        <div className="mt-10 space-y-8">
          {METHODOLOGY_SECTIONS.map((section) => (
            <section key={section.heading}>
              <h2 className="text-lg font-semibold text-white">{section.heading}</h2>
              <p className="mt-2 text-sm leading-relaxed text-white/60">{section.body}</p>
            </section>
          ))}
        </div>

        <p className="mt-10 text-xs leading-relaxed text-white/35">{REVIEW_EDUCATIONAL_NOTE}</p>
      </div>
    </>
  );
}
