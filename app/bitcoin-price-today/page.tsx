import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import BitcoinPriceTodayPage from "./_components/BitcoinPriceTodayPage";
import { FAQ_ITEMS } from "./_components/faqData";
import { fetchMarketContext } from "@/lib/api/marketContext";
import { fetchPriceChangeFigures } from "@/lib/api/priceHistory";
import { getDxy, getTenYearYield } from "@/lib/api/marketServer";
import { ProCtaCard } from "@/components/pro/ProCtaCard";

export const metadata: Metadata = {
  title: "Bitcoin Price Today (BTC/USD) · IntelliTrade",
  description:
    "Live bitcoin price in USD. Real-time BTC/USD quote, daily chart, market context, and key market relationships, updated throughout the session.",
  alternates: { canonical: "https://intellitrade.tech/bitcoin-price-today" },
  openGraph: {
    title: "Bitcoin Price Today (BTC/USD) · IntelliTrade",
    description:
      "Live bitcoin price in USD. Real-time BTC/USD quote, daily chart, market context, and key market relationships.",
    url: "https://intellitrade.tech/bitcoin-price-today",
    siteName: "IntelliTrade",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Bitcoin Price Today (BTC/USD) · IntelliTrade",
    description: "Live bitcoin price in USD with daily chart and market context.",
  },
};

const schema = {
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: "Bitcoin Price Today (BTC/USD)",
  description:
    "Live bitcoin price in USD. Real-time BTC/USD quote, daily chart, market context, and key market relationships.",
  url: "https://intellitrade.tech/bitcoin-price-today",
  publisher: { "@type": "Organization", name: "IntelliTrade", url: "https://intellitrade.tech" },
  breadcrumb: {
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Home", item: "https://intellitrade.tech/" },
      { "@type": "ListItem", position: 2, name: "Bitcoin Price Today", item: "https://intellitrade.tech/bitcoin-price-today" },
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
  const [marketContext, priceChanges, tenYearYield, dxy] = await Promise.all([
    fetchMarketContext("bitcoin"),
    fetchPriceChangeFigures("BTC"),
    getTenYearYield(),
    getDxy(),
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
      <BitcoinPriceTodayPage
        marketContext={marketContext}
        priceChanges={priceChanges}
        initialTenYearYield={tenYearYield}
        initialDxy={dxy}
      />
      <section className="w-full px-4 pb-20">
        <div className="mx-auto max-w-5xl">
          <ProCtaCard
            heading="The price is one input. Context is the rest."
            body="IntelliTrade Pro tracks currency strength, event risk and EURUSD zone quality, before you consider a trade."
            href="/pro?src=btc"
            ctaId="price_btc"
            src="btc"
          />
        </div>
      </section>
    </>
  );
}
