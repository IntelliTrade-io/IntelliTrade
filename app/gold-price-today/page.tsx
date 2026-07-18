import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import GoldPriceTodayPage from "./_components/GoldPriceTodayPage";
import { FAQ_ITEMS } from "./_components/faqData";
import { fetchMarketContext } from "@/lib/api/marketContext";
import { fetchPriceChangeFigures } from "@/lib/api/priceHistory";
import { ProCtaCard } from "@/components/pro/ProCtaCard";

export const metadata: Metadata = {
  title: "Gold Price Today (XAU/USD) · IntelliTrade",
  description:
    "Live gold price in USD. Real-time XAU/USD quote, daily chart, market context, and key market relationships, updated throughout the session.",
  alternates: { canonical: "https://intellitrade.tech/gold-price-today" },
  openGraph: {
    title: "Gold Price Today (XAU/USD) · IntelliTrade",
    description:
      "Live gold price in USD. Real-time XAU/USD quote, daily chart, market context, and key market relationships.",
    url: "https://intellitrade.tech/gold-price-today",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Gold Price Today (XAU/USD) · IntelliTrade",
    description: "Live gold price in USD with daily chart and market context.",
  },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Gold Price Today (XAU/USD)",
  description:
    "Live gold price in USD. Real-time XAU/USD quote, daily chart, market context, and key market relationships.",
  url: "https://intellitrade.tech/gold-price-today",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
      { "@type": "ListItem", position: 2, name: "Gold Price Today", item: "https://intellitrade.tech/gold-price-today" },
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
  const [marketContext, priceChanges] = await Promise.all([
    fetchMarketContext("gold"),
    fetchPriceChangeFigures("XAU"),
  ]);
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
      <GoldPriceTodayPage marketContext={marketContext} priceChanges={priceChanges} />
      <section className="w-full px-4 pb-20">
        <div className="mx-auto max-w-5xl">
          <ProCtaCard
            heading="The price is one input. Context is the rest."
            body="IntelliTrade Pro tracks currency strength, event risk and EURUSD zone quality, before you consider a trade."
            href="/pro?src=gold"
            ctaId="price_gold"
            src="gold"
          />
        </div>
      </section>
    </>
  );
}
