import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import OilPriceTodayPage from "./_components/OilPriceTodayPage";
import { FAQ_ITEMS } from "./_components/faqData";
import { fetchMarketContext } from "@/lib/api/marketContext";
import { ProCtaCard } from "@/components/pro/ProCtaCard";

export const metadata: Metadata = {
  title: "Oil Price Today (Brent Crude) · IntelliTrade",
  description:
    "Live Brent crude oil price in USD. Real-time Brent quote, daily chart, market context, and key market relationships — updated throughout the session.",
  alternates: { canonical: "https://intellitrade.tech/oil-price-today" },
  openGraph: {
    title: "Oil Price Today (Brent Crude) · IntelliTrade",
    description:
      "Live Brent crude oil price in USD. Real-time Brent quote, daily chart, market context, and key market relationships.",
    url: "https://intellitrade.tech/oil-price-today",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Oil Price Today (Brent Crude) · IntelliTrade",
    description: "Live Brent crude oil price in USD with daily chart and market context.",
  },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Oil Price Today (Brent Crude)",
  description:
    "Live Brent crude oil price in USD. Real-time Brent quote, daily chart, market context, and key market relationships.",
  url: "https://intellitrade.tech/oil-price-today",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
      { "@type": "ListItem", position: 2, name: "Oil Price Today", item: "https://intellitrade.tech/oil-price-today" },
    ],
  },
};

const faqSchema = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQ_ITEMS.map((item) => ({
    "@type": "Question",
    name: item.question,
    acceptedAnswer: { "@type": "Answer", text: item.answer },
  })),
};

export default async function Page() {
  const marketContext = await fetchMarketContext("oil");
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(faqSchema) }}
      />
      <OilPriceTodayPage marketContext={marketContext} />
      <section className="w-full px-4 pb-20">
        <div className="mx-auto max-w-5xl">
          <ProCtaCard
            heading="The price is one input. Context is the rest."
            body="IntelliTrade Pro tracks currency strength, event risk and EURUSD zone quality — before you consider a trade."
            href="/pro?src=oil"
            ctaId="price_oil"
            src="oil"
          />
        </div>
      </section>
    </>
  );
}
