// Plain data module (no "use client") so the FAQ items can feed both the
// client accordion and the server-rendered FAQPage JSON-LD in page.tsx.

export const FAQ_ITEMS = [
  {
    question: "What factors affect the gold price today?",
    answer:
      "The gold price is influenced by several major market drivers, including the strength of the US dollar, Treasury yields, inflation expectations, central bank policy, geopolitical uncertainty, and overall risk sentiment. Because these factors can shift throughout the day, the gold price can move frequently even when the broader trend remains the same.",
  },
  {
    question: "What is XAU/USD in gold trading?",
    answer:
      'XAU/USD is the financial market symbol for gold priced in US dollars. "XAU" represents one troy ounce of gold, while "USD" is the US dollar. When traders search for the live gold price, spot gold, or gold price today, they are often referring to the XAU/USD market.',
  },
  {
    question: "Why does the gold price differ slightly between websites, brokers, or apps?",
    answer:
      "Gold prices can vary slightly across platforms because not every source uses the exact same feed, update speed, or pricing method. Some websites display the live spot XAU/USD price, while others may show futures-based pricing, delayed data, or broker quotes that include a spread. Small differences are normal and do not necessarily mean one price is wrong. On IntelliTrade, the displayed price is intended as a live market reference for XAU/USD.",
  },
  {
    question: "How do I convert the gold price per ounce to grams or kilos?",
    answer:
      "Spot gold is quoted per troy ounce, and one troy ounce equals 31.1035 grams. To get the price per gram, divide the XAU/USD quote by 31.1035; multiply the per-gram price by 1,000 for the price per kilogram. For example, if gold trades at $2,400 per troy ounce, that is about $77.16 per gram and $77,160 per kilo. Retail prices for physical gold (coins, bars, jewellery) add fabrication and dealer premiums on top of the spot value.",
  },
  {
    question: "Why does gold usually move opposite to the US dollar?",
    answer:
      "Gold is priced in dollars, so when the dollar strengthens, one ounce of gold costs more in other currencies and tends to attract less demand, pressuring the dollar price down — and vice versa. The relationship is a tendency, not a law: in stress episodes gold and the dollar can rise together, because both attract safe-haven flows at the same time.",
  },
  {
    question: "What is the difference between spot gold and gold futures?",
    answer:
      "The spot price (XAU/USD) is the price for immediate delivery of gold and is what most live gold trackers show. Futures are exchange-traded contracts for delivery at a set future date; they trade close to spot but differ by carrying costs such as interest and storage, which is why futures quotes are usually slightly above spot. News headlines sometimes cite the front-month futures price, which explains some of the small discrepancies between sources.",
  },
  {
    question: "Is the gold price the same all over the world?",
    answer:
      "The underlying spot market is global, so the dollar price of gold is effectively the same everywhere at any given moment. What differs is the local-currency price — which moves with the exchange rate — and local premiums or taxes on physical gold. A weaker local currency means a higher gold price in that currency even if XAU/USD has not moved at all.",
  },
] as const;
