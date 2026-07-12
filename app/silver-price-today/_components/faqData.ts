// Plain data module (no "use client") so the FAQ items can feed both the
// client accordion and the server-rendered FAQPage JSON-LD in page.tsx.

export const FAQ_ITEMS = [
  {
    question: "What factors affect the silver price today?",
    answer:
      "Silver typically moves with a mix of macro and industrial forces. Key drivers include the US dollar, real yields, inflation expectations, global growth sentiment, industrial demand (electronics, solar, manufacturing), and shifts in safe-haven positioning. Because silver has both precious metal and industrial characteristics, it can behave differently from gold during risk-on or risk-off phases.",
  },
  {
    question: "What is XAG/USD in silver trading?",
    answer:
      "XAG/USD is the market symbol for silver priced in US dollars, usually quoted per troy ounce. XAG is the standard code used to represent silver in financial markets, and USD is the pricing currency.",
  },
  {
    question: "Why does the silver price differ slightly between websites, brokers, or apps?",
    answer:
      "Small differences are normal. Platforms can display different pricing streams (spot reference vs. derivatives), different refresh speeds, and different spreads. A broker quote may include a bid/ask spread, while a data site may show a mid-price reference. The result is minor variation even when markets are moving in the same direction.",
  },
  {
    question: "How do I convert the silver price per ounce to grams or kilos?",
    answer:
      "Spot silver is quoted per troy ounce, and one troy ounce equals 31.1035 grams. Divide the XAG/USD quote by 31.1035 for the price per gram, and multiply that by 1,000 for the price per kilogram. For example, at $30 per troy ounce, silver costs about $0.96 per gram and $965 per kilo. Physical silver (coins and bars) trades above spot because of fabrication and dealer premiums, which are proportionally larger for silver than for gold.",
  },
  {
    question: "What is the gold/silver ratio and why do traders watch it?",
    answer:
      "The gold/silver ratio is the gold price divided by the silver price — how many ounces of silver one ounce of gold buys. It has historically ranged from below 20 to above 120, and market watchers use it as a rough gauge of relative value between the two metals: a high ratio means silver is cheap relative to gold by historical standards, a low ratio the opposite. It is a descriptive measure, not a timing tool.",
  },
  {
    question: "Why is silver more volatile than gold?",
    answer:
      "The silver market is far smaller and less liquid than the gold market, so the same flow of money moves the price more. On top of that, roughly half of silver demand is industrial, which makes the price sensitive to the economic cycle as well as to the monetary drivers it shares with gold. The combination typically produces larger percentage swings in both directions.",
  },
] as const;
