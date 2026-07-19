import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { jsonLd } from "@/lib/jsonLd";
import { getMonthlySummary, isCsmReviewsEnabled } from "@/lib/api/csmReviews";
import { ReviewArchiveList } from "@/components/strength/reviews/ReviewArchiveList";
import { MONTHLY_GROUPING_NOTE, OVERLAP_DISCLOSURE } from "@/lib/strength-reviews-copy";

const BASE = "https://intellitrade.tech";

export const revalidate = 3600;
export const dynamicParams = true;

function monthName(year: string, month: string): string {
  const d = new Date(Date.UTC(Number(year), Number(month) - 1, 1));
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}): Promise<Metadata> {
  const { year, month } = await params;
  const label = monthName(year, month);
  const url = `${BASE}/currency-strength/reviews/monthly/${year}/${month}`;
  return {
    title: `Currency Strength Reviews · ${label} | IntelliTrade`,
    description: `Completed currency-strength reviews captured in ${label}, grouped by capture month, with outcome rates and averages.`,
    alternates: { canonical: url },
  };
}

export default async function MonthlyPage({
  params,
}: {
  params: Promise<{ year: string; month: string }>;
}) {
  if (!isCsmReviewsEnabled()) notFound();
  const { year, month } = await params;
  const summary = await getMonthlySummary(year, month);
  if (!summary) notFound();

  const label = monthName(year, month);
  const url = `${BASE}/currency-strength/reviews/monthly/${year}/${month}`;
  const s = summary.stats as Record<string, unknown>;

  const collectionSchema = {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: `Currency Strength Reviews · ${label}`,
    url,
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(collectionSchema) }} />

      <div className="mx-auto max-w-4xl px-4 pb-28 pt-10 sm:px-8">
        <nav aria-label="Breadcrumb" className="mb-6 text-[12px] text-white/40">
          <ol className="flex flex-wrap items-center gap-1.5">
            <li>
              <Link href="/currency-strength/reviews" className="inline-flex items-center gap-1 transition hover:text-white/70">
                <ArrowLeft className="h-3 w-3" />
                Historical Reviews
              </Link>
            </li>
            <li aria-hidden className="text-white/25">/</li>
            <li className="text-white/60">{label}</li>
          </ol>
        </nav>

        <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{label}</h1>
        <p className="mt-2 text-sm text-white/45">{MONTHLY_GROUPING_NOTE}</p>

        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-white/12 bg-white/[0.03] p-4 text-sm text-white/60">
          <span>Cases: <span className="font-mono text-white">{String(s.count ?? summary.items.length)}</span></span>
          <span>Continued: <span className="font-mono text-white">{String(s.continued ?? "-")}</span></span>
          <span>Mixed: <span className="font-mono text-white">{String(s.mixed ?? "-")}</span></span>
          <span>Reversed: <span className="font-mono text-white">{String(s.reversed ?? "-")}</span></span>
          {typeof s.mean_long_return_pct === "number" && (
            <span>Mean 60-bar: <span className="font-mono text-white">{s.mean_long_return_pct}%</span></span>
          )}
        </div>
        <p className="mt-3 text-xs text-white/40">{OVERLAP_DISCLOSURE}</p>

        <div className="mt-8">
          <ReviewArchiveList items={summary.items} />
        </div>
      </div>
    </>
  );
}
