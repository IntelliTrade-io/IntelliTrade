// Plain data module (no "use client") so the FAQ items can feed both the
// client accordion and the server-rendered FAQPage JSON-LD in page.tsx.

export const FAQ_ITEMS = [
  {
    question: "What is Brent crude and why is it a global benchmark?",
    answer:
      "Brent crude is a widely used benchmark for pricing global oil. It's especially important for Europe, Africa, and much of Asia, and is commonly referenced in news headlines and institutional pricing models.",
  },
  {
    question: "What factors move the Brent oil price today?",
    answer:
      "Brent prices are influenced by supply and demand expectations, OPEC+ policy, geopolitical risk and shipping disruptions, inventory data, refinery demand, global growth expectations, and the US dollar. Because oil is a globally transported commodity, changes in logistics and risk premia can matter as much as pure consumption trends.",
  },
  {
    question: "Why can the Brent oil price differ between websites or brokers?",
    answer:
      "Different platforms may show different instruments. Some display a Brent futures contract, others show a CFD or a spot reference, and prices can vary by contract month (front-month vs next-month) and how rollovers are handled. Broker quotes also include spreads, which can widen during volatility or outside peak liquidity.",
  },
  {
    question: "What is the difference between Brent and WTI?",
    answer:
      "Brent and WTI (West Texas Intermediate) are the two most-quoted oil benchmarks. Brent prices seaborne crude from the North Sea and anchors pricing for Europe, Africa and Asia; WTI is the US benchmark, delivered inland at Cushing, Oklahoma. They usually track each other closely, with a spread that reflects transport costs, regional supply-demand differences and export logistics. When a headline says 'oil', European coverage usually means Brent and US coverage often means WTI.",
  },
  {
    question: "How does the oil price affect currency markets?",
    answer:
      "Oil is a major input cost and a major export revenue, so sustained price moves redistribute income between countries. Currencies of large exporters (the Canadian dollar and Norwegian krone are the classic examples) tend to firm when oil rallies, while heavy importers such as Japan and India face pressure on their trade balances. Oil also feeds directly into inflation expectations, which shapes central-bank policy and, through it, exchange rates.",
  },
  {
    question: "Why do oil prices sometimes spike on news that hasn't reduced supply yet?",
    answer:
      "Oil trades on expectations, and a large share of physical supply moves through a small number of chokepoints; the Strait of Hormuz alone carries roughly a fifth of global oil flows. Events that raise the probability of future disruption (conflict near a chokepoint, sanctions threats, attacks on infrastructure) add a risk premium to the price immediately, before any barrel is actually lost. That premium can fade just as quickly if the threat de-escalates.",
  },
] as const;
