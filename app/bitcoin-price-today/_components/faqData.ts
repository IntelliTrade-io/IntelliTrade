// Plain data module (no "use client") so the FAQ items can feed both the
// client accordion and the server-rendered FAQPage JSON-LD in page.tsx.

export const FAQ_ITEMS = [
  {
    question: "Why does the bitcoin price differ between exchanges?",
    answer:
      "Bitcoin doesn't have one single 'official' global price. Exchanges are separate marketplaces with different liquidity, order books, and spreads, so their last-traded prices can vary slightly. During fast markets or low-liquidity periods, those differences can widen before arbitrage brings them closer again.",
  },
  {
    question: "Is bitcoin traded 24/7?",
    answer:
      "Yes. Bitcoin trades continuously, including weekends and holidays. Because crypto markets never fully close, price moves can happen at any time, and liquidity conditions can change across hours and days.",
  },
  {
    question: "What factors affect the bitcoin price today?",
    answer:
      "Bitcoin is often driven by overall risk sentiment, macro liquidity conditions, major regulatory or market-structure headlines, leverage and liquidation dynamics, and shifts in demand across regions and venues. Short-term moves can be amplified by volatility, spreads, and rapid changes in order-book depth.",
  },
  {
    question: "What does BTC/USD mean?",
    answer:
      "BTC/USD is the price of one bitcoin expressed in US dollars, the most widely quoted bitcoin pair. Like an FX pair, it is a ratio: it can move because bitcoin repriced, because the dollar repriced, or both. Bitcoin also trades against other currencies (EUR, GBP, JPY) and against stablecoins such as USDT, whose prices track the dollar pair closely but not perfectly.",
  },
  {
    question: "How does bitcoin relate to macro markets like the dollar and rates?",
    answer:
      "The relationship shifts over time. In recent years bitcoin has often traded like a high-beta risk asset: firmer when liquidity is ample and equities rally, softer when real yields rise or the dollar strengthens sharply. At other times idiosyncratic crypto events (exchange failures, ETF flows, halving cycles) dominate and the macro correlation weakens. Treating any single correlation as permanent is the most common analytical mistake with bitcoin.",
  },
  {
    question: "Why do bitcoin price moves sometimes accelerate suddenly?",
    answer:
      "A large share of bitcoin trading uses leverage. When price crosses levels where leveraged positions are forced to close, those liquidations become market orders that push price further in the same direction, triggering more liquidations: a cascade. Combined with order books that can thin out quickly, this is why bitcoin can move several percent in minutes without any news at all.",
  },
] as const;
