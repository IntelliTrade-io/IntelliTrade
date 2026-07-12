import type { Metadata } from "next";
import { jsonLd } from "@/lib/jsonLd";
import BitcoinPriceTodayPage from "./_components/BitcoinPriceTodayPage";
import { ProCtaCard } from "@/components/pro/ProCtaCard";

export const metadata: Metadata = {
  title: "Bitcoin Price Today (BTC/USD) · IntelliTrade",
  description:
    "Live bitcoin price in USD. Real-time BTC/USD quote, daily chart, market context, and key market relationships — updated throughout the session.",
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

export default function Page() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: jsonLd(schema) }}
      />
      <BitcoinPriceTodayPage />
      <section className="w-full px-4 pb-20">
        <div className="mx-auto max-w-5xl">
          <ProCtaCard
            heading="The price is one input. Context is the rest."
            body="IntelliTrade Pro tracks currency strength, event risk and EURUSD zone quality — before you consider a trade."
            href="/pro?src=btc"
            ctaId="price_btc"
            src="btc"
          />
        </div>
      </section>
    </>
  );
}
