"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { motion } from "framer-motion";

// ---------- Types ----------
type Section = {
  id: string;
  heading: string;
  body: string;
};

type Chapter = {
  id: string;
  order: number;
  part: string;
  title: string;
  sections: Section[];
};

type ThemeStyle = CSSProperties & {
  "--brand-primary": string;
  "--brand-primary-light": string;
};

// ---------- Content ----------
// Skeleton for all chapters – plug your full manuscript text into each `body` when ready.

const chapters: Chapter[] = [
  {
    id: "ch1",
    order: 1,
    part: "Part I – Macro Mindset and the Big Picture",
    title: "Macro for Traders: What, Why, and How",
    sections: [
      {
        id: "ch1-s1",
        heading: "1.1 Why macro matters for traders",
        body: "Most price moves in FX, indices, bonds, commodities, and even crypto are shaped by four big forces:\n\n- Growth: is the economy speeding up or slowing down?\n- Inflation: are prices under control or not?\n- Policy: are central banks and governments tightening or loosening?\n- Risk sentiment and liquidity: are investors hungry for risk, or hiding in safety?\n\nYou can trade without macro. Many people do. But then:\n\n- Big moves feel random.\n- You get blindsided by data releases and central bank meetings.\n- You copy other people’s narratives instead of understanding them.\n\nMacro does not replace your trading system. It gives you:\n\n- Context – what regime we are in (hiking cycle, easing cycle, recovery, scare, crisis).\n- Focus – which assets and themes matter most right now.\n- Guardrails – what would have to change to make your view wrong.",
      },
      {
        id: "ch1-s2",
        heading: "1.2 Trader, analyst, economist: three layers of macro",
        body: "Think of three layers of macro thinking:\n\nTrader:\n\n- Cares about entries, exits, position size, and risk-reward.\n- Uses macro as “wind direction,” not as a PhD model.\n\nMacro analyst:\n\n- Cares about how data, policy, and narratives fit together across months and quarters.\n- Builds coherent stories and assigns rough probabilities.\n\nEconomist:\n\n- Cares about theory, structural issues, and long-run trends.\n- Writes models and deep policy research that may matter over years.\n\nThis book aims to put you somewhere between “informed trader” and “macro analyst.” You will not become a professional economist, and you do not need to. You will learn to read the same information they use and form your own views.",
      },
      {
        id: "ch1-s3",
        heading: "1.3 How macro views become trades",
        body: "Very simplified, the pipeline looks like this:\n\nMacro story:\n\n- “Inflation is easing, growth is okay, central banks will likely cut in the next year.”\n\nMarket translation:\n\n- “Rate cuts ahead → lower yields over time → support for risk assets → some pressure on the currency → better environment for high-beta assets and carry trades.”\n\nTrade expression (examples, not advice):\n\n- Tilt towards indices or sectors that benefit from lower yields and stable growth.\n- Prefer higher-yielding currencies over low-yielders when volatility is low.\n- Expect gold and some crypto to find support if real yields fall.\n\nAt each step you can be wrong:\n\n- The story is wrong.\n- The story is right, but already fully priced.\n- The trade expression is poor (wrong asset, wrong horizon).\n- The risk management is weak.\n\nThis book will not make you always right. It will make you less random and more structured.",
      },
      {
        id: "ch1-s4",
        heading: "1.4 From headlines to frameworks",
        body: "A non-analyst reads:\n\n- “CPI beats expectations.”\n- “Central bank surprises with hawkish tone.”\n- “Yield curve steepens.”\n\nand reacts emotionally: panic, FOMO, confusion.\n\nAn analyst asks:\n\n- Which pillar is this affecting: rates, growth, inflation, risk sentiment, or liquidity?\n- How does this change my view of the next 6–18 months?\n- Is this genuinely new information or just confirmation?\n- Is the market overreacting, underreacting, or reacting logically?\n\nThe goal of this book is to train you to ask those questions automatically, and to give you enough understanding to answer them in a simple, grounded way.",
      },
    ],
  },
  {
    id: "ch2",
    order: 2,
    part: "Part I – Macro Mindset and the Big Picture",
    title: "Economic Cycles: From Story to Framework",
    sections: [
      {
        id: "ch2-s1",
        heading: "2.1 The business cycle in plain language",
        body: "Economies move in cycles. Ignore equations for a moment and think in four simple phases:\n\nEarly cycle – after a downturn or crisis:\n\n- Growth starts to recover from a low base.\n- Policy is usually very loose (low rates, fiscal support).\n- Risk assets often rebound strongly from depressed levels.\n\nMid cycle – expansion:\n\n- Growth is solid and broad-based.\n- Inflation is manageable, not alarming.\n- Policy becomes more neutral, with fewer big surprises.\n- Earnings grow, credit is available, default risk is low.\n\nLate cycle – overheating and tension:\n\n- Growth is still strong but capacity is tight.\n- Inflation pressures or bottlenecks appear.\n- Central banks become more hawkish and start to tighten aggressively.\n- Markets begin to worry about how long the party can last.\n\nDownturn or recession:\n\n- Growth slows sharply or contracts.\n- Unemployment rises.\n- Policy eventually turns supportive again (rate cuts, stimulus).\n- Risk assets reprice, safe-haven assets and high-quality bonds outperform.\n\nAs an analyst, you rarely get a perfect label. What you need is a working hypothesis, such as “late-cycle with restrictive policy” or “early recovery with easing policy.”",
      },
      {
        id: "ch2-s2",
        heading: "2.2 How the cycle shows up in data",
        body: "Cycles show up across many indicators:\n\n- Real GDP growth and its components (consumption, investment, net exports).\n- Labour market data (employment, unemployment, wages, hours).\n- Surveys (PMIs, business and consumer confidence).\n- Credit growth and lending standards.\n- Asset prices (equities, credit spreads, house prices, FX).\n\nYou rarely get a clean signal from a single series. Analysts look for patterns:\n\n- Are most indicators pointing to acceleration or deceleration?\n- Are forward-looking measures (like PMIs) confirming or contradicting lagging data?\n- Are revisions making past growth look stronger or weaker?",
      },
      {
        id: "ch2-s3",
        heading:
          "2.3 Narratives: soft landing, hard landing, stagflation and more",
        body: "Markets love labels:\n\n- Soft landing – inflation falls without a deep recession.\n- Hard landing – inflation is tamed, but at the cost of a severe slump.\n- No landing – growth stays strong and inflation proves sticky.\n- Stagflation – weak growth and stubbornly high inflation.\n\nYour job is to connect these words to conditions:\n\n- Soft landing: disinflation + resilient employment + gradual policy easing.\n- Hard landing: rapid growth slowdown + rising unemployment + emergency easing.\n- Stagflation: poor growth + stubborn inflation + policy stuck in a tough spot.\n\nAsk yourself:\n\n- Which narrative is dominant right now?\n- What data supports or contradicts it?\n- What could force a narrative change in the next 6–12 months?",
      },
      {
        id: "ch2-s4",
        heading: "2.4 A simple monthly exercise",
        body: "Pick one major economy – for many traders, it will be the United States or the euro area. Once a month, write down:\n\n- Where do I think we are in the cycle (early, mid, late, downturn)?\n- Which data backs that view (even roughly)?\n- Which narrative is dominant in media and markets?\n- What would have to happen for me to change my mind?\n\nThis simple habit moves you from reacting to headlines to quietly building your own cycle view.",
      },
    ],
  },
  {
    id: "ch3",
    order: 3,
    part: "Part I – Macro Mindset and the Big Picture",
    title: "Reading Data Like an Analyst",
    sections: [
      {
        id: "ch3-s1",
        heading: "3.1 Levels, changes, and surprises",
        body: "Every macro release can be understood through three lenses:\n\nLevel:\n\n- Is the number high or low in absolute terms? (For example, 8 percent inflation is high.)\n\nChange:\n\n- Is it rising or falling compared with previous readings? (Did inflation move from 8 to 7 percent or from 8 to 9 percent?)\n\nSurprise:\n\n- Is it above or below what markets expected? (Did it beat or miss consensus forecasts?)\n\nMarkets mostly trade the surprise and what it implies for the future path of policy and growth, not just the level by itself.\n\nFor example, if inflation comes in at 3.5 percent when consensus was 3.0 percent:\n\n- Level: still higher than many central bank targets.\n- Change: maybe it is down from 4.0 percent – that is progress.\n- Surprise: hotter than expected – this is what markets react to first.",
      },
      {
        id: "ch3-s2",
        heading: "3.2 Consensus and expectations",
        body: "Professional forecasters, banks, and analysts submit their predictions ahead of major releases. Data providers compute the consensus or median forecast.\n\nMarkets typically:\n\n- Price in something close to the consensus beforehand.\n- React strongly only if the actual number is meaningfully different.\n\nSo instead of only asking “is the number high or low?” you must also ask:\n\n- “Higher or lower than expected?”\n- “Does this materially change the path of central bank policy or growth?”\n- “Is this the start of a new trend or just noise around a stable trend?”",
      },
      {
        id: "ch3-s3",
        heading: "3.3 Noise, revisions, and the danger of overreacting",
        body: "Single data points are noisy:\n\n- Surveys swing around.\n- Seasonal adjustment and calendar quirks cause bumps.\n- Initial estimates get revised – sometimes significantly.\n\nAnalysts focus on:\n\n- Short-term averages (for example, 3- or 6-month annualised changes).\n- Patterns across multiple series (inflation, wages, PMIs, retail sales together).\n- Revisions that systematically make past data stronger or weaker.\n\nA good rule:\n\n- Never let one noisy print completely overturn your view unless it truly signals a regime shift. Always check the bigger pattern.",
      },
      {
        id: "ch3-s4",
        heading: "3.4 A simple data-tracking habit",
        body: "You do not need to watch everything. Start with a small dashboard for your main economy:\n\n- Growth: one GDP or GDP-nowcast series and one PMI.\n- Inflation: headline and core.\n- Labour: unemployment rate and wage growth.\n- Policy: central bank rate and an implied policy path from futures.\n- Markets: 2-year and 10-year yields, a major stock index, and the main FX pair.\n\nUpdate this once a month or once a week, depending on your timeframe. Ask yourself:\n\n- Are things improving, deteriorating, or unchanged?\n- Are inflation pressures easing or intensifying?\n- Are policy expectations moving in line with data or diverging?\n\nWrite a 5–10 line summary for your own records. Over time, this becomes a personal macro diary that trains your analyst eye.",
      },
    ],
  },
  {
    id: "ch4",
    order: 4,
    part: "Part II – The Economic Engine",
    title: "How Economies Are Measured: GDP, Sectors, and Flows",
    sections: [
      {
        id: "ch4-s1",
        heading: "4.1 What GDP really is",
        body: "Gross Domestic Product (GDP) is the value of all final goods and services produced within a country in a given period.\n\nThere are three equivalent ways to look at it:\n\n- Production: sum of value added across sectors (agriculture, manufacturing, services, etc.).\n- Income: sum of wages, profits, interest, and rents.\n- Spending: C + I + G + (X – M)\n- C = consumption\n- I = investment\n- G = government spending\n- X – M = exports minus imports\n\nAnalysts mostly see the spending breakdown and ask which components are driving growth.",
      },
      {
        id: "ch4-s2",
        heading: "4.2 Why composition matters more than the headline",
        body: "Two countries can both grow at 2 percent, but the quality of that growth can be very different:\n\n- Country A: strong investment and export growth – often more sustainable.\n- Country B: weak investment, consumption financed by rapid credit growth – potentially fragile.\n\nWhen you see GDP numbers, ask:\n\n- Which components are doing the heavy lifting?\n- Is growth broad-based or concentrated in one area?\n- Does the mix look sustainable if policy tightens or global conditions worsen?",
      },
      {
        id: "ch4-s3",
        heading: "4.3 Sectors and how shocks propagate",
        body: "Key sectors to think about:\n\n- Households: consumption, housing.\n- Firms: business investment, hiring, inventory.\n- Government: fiscal policy – taxes, transfers, spending, public investment.\n- Rest of world: trade and external demand.\n\nShock examples:\n\n- Housing downturn: hits construction, real estate, banks, and often consumption.\n- Export slump: hits manufacturing regions, supply chains, and relevant FX crosses.\n- Fiscal tightening: reduces demand in areas dependent on government spending.\n\nAnalysts think in “who is hit, who benefits?” rather than just abstract numbers.",
      },
      {
        id: "ch4-s4",
        heading: "4.4 Flow of funds intuition",
        body: "Without building full accounting tables, remember two simple truths:\n\n- Someone’s spending is someone else’s income.\n- Someone’s asset is someone else’s liability.\n\nWhen you see:\n\n- Rising private sector debt, ask: who is borrowing, for what, and from whom?\n- Large fiscal deficits, ask: who is buying the government bonds?\n- Big current account deficits, ask: who is providing the foreign capital and in what form?\n\nThese questions help you assess where vulnerabilities might sit if conditions change.",
      },
    ],
  },
  {
    id: "ch5",
    order: 5,
    part: "Part II – The Economic Engine",
    title: "Demand, Supply, and Output Gaps (Without the Scary Math)",
    sections: [
      {
        id: "ch5-s1",
        heading: "5.1 Demand, supply, and capacity",
        body: "At its core, macro is about how demand and supply interact at the level of the whole economy.\n\nDemand is total spending:\n\n- Households, firms, government, and foreign buyers.\n\nSupply is the economy’s capacity to produce:\n\n- Workers, machines, buildings, knowledge, and technology.\n\nWhen demand is far below capacity:\n\n- Factories are idle.\n- Workers struggle to find jobs.\n- Inflation tends to be low or falling.\n\nWhen demand is far above capacity:\n\n- Firms run flat-out.\n- Bottlenecks appear.\n- Wages and prices tend to accelerate.",
      },
      {
        id: "ch5-s2",
        heading: "5.2 The output gap",
        body: "Economists talk about the “output gap” – the difference between actual output and potential output.\n\n- Positive gap: economy running “hot,” demand exceeds sustainable capacity.\n- Negative gap: economy running “cold,” slack in labour and capital.\n\nYou do not need the exact number. Analysts instead ask:\n\n- Are we broadly running hot, cold, or close to “just right”?\n- Are pressures building in wages, pricing, and capacity utilisation?",
      },
      {
        id: "ch5-s3",
        heading: "5.3 Demand shocks and supply shocks",
        body: "Demand shocks:\n\n- Changes in policy (rate cuts or hikes, fiscal stimulus or austerity).\n- Credit booms or busts.\n- Shifts in confidence or wealth (house prices, equity rallies or crashes).\n\nSupply shocks:\n\n- Energy price spikes.\n- Natural disasters or pandemics.\n- Geopolitical disruptions to trade.\n- Structural changes (regulation, productivity shifts).\n\nAn inflation spike caused mainly by a demand boom is very different from an inflation spike caused by a one-off energy shock. Analysts care about which dominates because it shapes policy and market reactions.",
      },
      {
        id: "ch5-s4",
        heading: "5.4 Why this matters for traders",
        body: "Once you start seeing the world in terms of:\n\n- Where we are in the cycle.\n- Whether demand or supply shocks dominate.\n- How large the approximate output gap is,\n\nyou can better judge:\n\n- How central banks are likely to respond.\n- Whether inflation is likely to prove sticky or transitory.\n- Which assets are most exposed to a change in macro conditions.",
      },
    ],
  },
  {
    id: "ch6",
    order: 6,
    part: "Part II – The Economic Engine",
    title: "Labour Markets, Wages, and Productivity",
    sections: [
      {
        id: "ch6-s1",
        heading: "6.1 Core labour concepts",
        body: "Key labour indicators:\n\n- Employment and unemployment.\n- Labour force participation (who is working or looking for work).\n- Job vacancies and jobless claims.\n- Wage growth.\n\nTight labour markets:\n\n- Low unemployment and high vacancies.\n- Firms compete for workers, wages tend to rise faster.\n\nLoose labour markets:\n\n- High unemployment or underemployment.\n- Firms have more bargaining power, wage growth is weak.",
      },
      {
        id: "ch6-s2",
        heading: "6.2 Wages, inflation, and consumption",
        body: "Wages are both:\n\n- A cost for businesses.\n- Income for households.\n\nWhen wages rise:\n\n- Firms may raise prices to protect margins (cost push).\n- Households can spend more, supporting demand (demand pull).\n\nAnalysts watch whether wage growth is:\n\n- Broad-based across sectors.\n- Outpacing productivity and inflation over time.",
      },
      {
        id: "ch6-s3",
        heading: "6.3 Productivity: the quiet driver",
        body: "Productivity is output per worker or per hour worked.\n\nIf real wages rise broadly faster than productivity, cost pressures tend to build and inflation risk rises. Sustainable real wage growth usually requires sustained productivity improvements.",
      },
      {
        id: "ch6-s4",
        heading: "6.4 Labour and the cycle",
        body: "In most cycles:\n\n- Labour markets lag turning points in growth.\n- Central banks watch labour closely to judge whether inflation pressures are likely to persist.\n\nFor traders, labour data is a critical piece of the macro puzzle, especially in economies where central banks have dual mandates (inflation and employment).",
      },
    ],
  },
  {
    id: "ch7",
    order: 7,
    part: "Part III – Money, Inflation, and Central Banks",
    title: "Money, Credit, and the Financial System",
    sections: [
      {
        id: "ch7-s1",
        heading: "7.1 What is “money” in practice?",
        body: "In modern economies, money is more than coins and notes:\n\n- Bank deposits in your account.\n- Reserves held by banks at the central bank.\n- Cash in circulation.\n\nCommercial banks create most of the money supply by extending credit. When a bank makes a loan, it credits a deposit in someone’s account – new money appears.",
      },
      {
        id: "ch7-s2",
        heading: "7.2 Credit, leverage, and fragility",
        body: "Credit is powerful:\n\n- It finances investment, housing, consumption, and trade.\n- It can also create vulnerabilities if it grows too fast in the wrong places.\n\nAnalysts look at:\n\n- Which sectors are borrowing heavily (households, firms, government).\n- How credit is funded (domestic deposits, wholesale markets, foreign funding).\n- Leverage in the banking and shadow-banking system.\n\nWhen credit booms go too far, the risk of a painful bust rises, especially if interest rates move sharply higher.",
      },
      {
        id: "ch7-s3",
        heading: "7.3 Financial plumbing and liquidity",
        body: "Liquidity can mean:\n\n- Market liquidity: how easy it is to trade assets without moving the price too much.\n- Funding liquidity: how easy it is for institutions to roll over their short-term funding.\n- System liquidity: the overall ease of credit and money in the system.\n\nTightening financial conditions often show up in:\n\n- Wider credit spreads.\n- Higher funding costs.\n- Weak performance in risk assets.\n\nLoose conditions tend to support risk-taking, carry trades, and leveraged strategies.",
      },
    ],
  },
  {
    id: "ch8",
    order: 8,
    part: "Part III – Money, Inflation, and Central Banks",
    title: "Inflation: Drivers, Regimes, and Narratives",
    sections: [
      {
        id: "ch8-s1",
        heading: "8.1 Demand-pull and cost-push inflation",
        body: "Demand-pull:\n\n- Too much spending chasing limited capacity.\n- Often associated with strong growth, easy policy, and confident households and firms.\n\nCost-push:\n\n- Input costs (energy, wages, materials) rise and firms pass those costs on.\n- Can occur even when demand is not especially strong.\n\nMost inflation episodes are a mix of both, plus changes in expectations about the future.",
      },
      {
        id: "ch8-s2",
        heading: "8.2 Inflation regimes",
        body: "Think of inflation in regimes:\n\n- Low and stable: central bank credibility strong, inflation anchored near target.\n- High and volatile: large shocks, weak credibility, unstable expectations.\n- Disinflation: inflation falling from high levels, often after policy tightening.\n- Deflation risk: inflation too low, growth weak, central banks struggle to stimulate.\n\nYour task as an analyst:\n\n- Identify which regime we are in.\n- Judge whether we are stabilising, worsening, or transitioning.",
      },
      {
        id: "ch8-s3",
        heading: "8.3 Expectations and credibility",
        body: "Inflation expectations matter because they affect behaviour:\n\n- Workers demand wage increases based on expected future prices.\n- Firms set prices factoring in expected future costs.\n\nCentral banks try to keep expectations anchored near target. When they lose credibility, it takes more aggressive action to regain control, which can be painful for growth and markets.",
      },
      {
        id: "ch8-s4",
        heading: "8.4 Why traders obsess over CPI",
        body: "Inflation is central to:\n\n- Central bank decisions.\n- Real yields (nominal yields minus expected inflation).\n- Valuation of assets sensitive to discount rates.\n\nEven if you never trade a bond, inflation data can drive FX, equities, gold, and crypto in major ways.",
      },
    ],
  },
  {
    id: "ch9",
    order: 9,
    part: "Part III – Money, Inflation, and Central Banks",
    title: "Central Banks and Policy Frameworks",
    sections: [
      {
        id: "ch9-s1",
        heading: "9.1 Mandates and goals",
        body: "Central banks usually have mandates such as:\n\n- Price stability (inflation target).\n- Full employment or maximum sustainable employment.\n- Sometimes financial stability as an explicit or implicit goal.\n\nThey cannot hit every goal perfectly at once. Trade-offs are inevitable.",
      },
      {
        id: "ch9-s2",
        heading: "9.2 Main policy tools",
        body: "Key tools include:\n\n- Policy interest rate: their main lever for tightening or easing over short horizons.\n- Forward guidance: signalling future intentions to shape expectations.\n- Balance sheet policies: quantitative easing (QE) or tightening (QT).\n- Liquidity operations and facilities to support financial stability.",
      },
      {
        id: "ch9-s3",
        heading: "9.3 Reaction functions",
        body: "Analysts think in terms of a reaction function:\n\n- “Given growth, inflation, labour, and financial conditions, what does this central bank usually do?”\n- “Are they more hawkish or dovish than the average central bank?”\n\nOver time, you learn:\n\n- Which data points move this central bank most.\n- How sensitive they are to inflation overshoots or undershoots.\n- How much weight they put on financial stability vs inflation.",
      },
      {
        id: "ch9-s4",
        heading: "9.4 Reading central bank communication",
        body: "Key elements:\n\n- Rate decision: hike, cut, or hold.\n- Statement: wording changes, emphasis shifts.\n- Press conference: tone, answers, what they choose to highlight or downplay.\n- Projections: inflation, growth, unemployment, and policy rate paths.\n\nYour job is to compare:\n\n- What they did and said vs what markets expected.\n- Their projections vs your own sense of the economy.\n- How this alters the path of future policy.",
      },
    ],
  },
  {
    id: "ch10",
    order: 10,
    part: "Part III – Money, Inflation, and Central Banks",
    title: "Yield Curves, Term Premia, and Market Expectations",
    sections: [
      {
        id: "ch10-s1",
        heading: "10.1 The yield curve as a story of the future",
        body: "A yield curve plots interest rates for different maturities (for example, 3 months to 30 years).\n\nRoughly:\n\n- Short-end yields are anchored by current and near-term expected policy rates.\n- Long-end yields reflect expectations of future policy plus a term premium.",
      },
      {
        id: "ch10-s2",
        heading: "10.2 Steep, flat, and inverted curves",
        body: "Steep curve:\n\n- Long yields much higher than short yields.\n- Often associated with expected growth and inflation or heavy borrowing at longer tenors.\n\nFlat curve:\n\n- Long and short yields similar.\n- Market sees policy near some “neutral” level for a while.\n\nInverted curve:\n\n- Short yields higher than long yields.\n- Market expects current tight policy to give way to lower rates in the future, often in response to slower growth or recession.",
      },
      {
        id: "ch10-s3",
        heading: "10.3 Term premium and uncertainty",
        body: "The term premium is the extra compensation investors demand to hold long-term bonds rather than rolling short-term ones.\n\nIt can move due to:\n\n- Changes in risk appetite.\n- Supply and demand for long-term bonds.\n- Perceived uncertainty about future inflation and policy.",
      },
      {
        id: "ch10-s4",
        heading: "10.4 Why curves matter for macro and trading",
        body: "Yield curves help you see:\n\n- How restrictive policy is expected to be over time.\n- Whether markets expect a soft landing or a sharper slowdown.\n- Pressure points for duration-sensitive assets and for banks’ balance sheets.\n\nFor traders, curves are a map of expectations and a warning system for potential stress.",
      },
    ],
  },
  {
    id: "ch11",
    order: 11,
    part: "Part IV – Open Economy, FX, and Cross-Asset Macro",
    title: "The Open Economy: Trade, Capital Flows, and Balance of Payments",
    sections: [
      {
        id: "ch11-s1",
        heading: "11.1 The balance of payments in simple terms",
        body: "The balance of payments tracks all transactions between a country and the rest of the world. There are two main parts:\n\nCurrent account:\n\n- Trade in goods and services.\n- Income flows (dividends, interest).\n- Transfers (remittances, aid).\n\nCapital and financial account:\n\n- Portfolio flows (bonds, equities).\n- Foreign direct investment.\n- Other investment and banking flows.\n\nA current account deficit must be financed by capital inflows; a surplus implies net lending to the rest of the world.",
      },
      {
        id: "ch11-s2",
        heading: "11.2 Why this matters for FX and risk",
        body: "Large external deficits funded by short-term or fickle capital can be a vulnerability:\n\n- In good times, funding is easy and the currency can stay strong.\n- In stress, capital rushes out, the currency weakens, and adjustment can be painful.\n\nAnalysts look at:\n\n- Size and persistence of current account imbalances.\n- Composition of capital flows (long-term vs hot money).\n- External debt levels and currency composition.",
      },
    ],
  },
  {
    id: "ch12",
    order: 12,
    part: "Part IV – Open Economy, FX, and Cross-Asset Macro",
    title: "FX: Fair Value, Carry, and Risk Premia",
    sections: [
      {
        id: "ch12-s1",
        heading: "12.1 What drives FX in the medium term",
        body: "Four main forces shape FX over time:\n\n- Relative inflation and price levels.\n- Relative interest rates (carry).\n- Relative growth prospects.\n- Risk sentiment and global liquidity.",
      },
      {
        id: "ch12-s2",
        heading: "12.2 Valuation and purchasing power",
        body: "Purchasing Power Parity (PPP) is a long-run idea that currencies should, over time, adjust to equalise price levels. It is not a short-term trading rule, but:\n\n- Very overvalued or undervalued currencies on PPP can be more vulnerable to macro shocks.\n- Valuation can help you avoid chasing extremes.",
      },
      {
        id: "ch12-s3",
        heading: "12.3 Carry and risk",
        body: "Carry is the interest you earn from holding a higher-yielding currency funded in a lower-yielding one.\n\nIn calm, risk-on environments:\n\n- High-carry currencies often attract flows.\n\nIn risk-off episodes:\n\n- High-carry currencies can sell off sharply as investors unwind positions.",
      },
      {
        id: "ch12-s4",
        heading: "12.4 Building a basic FX view",
        body: "When thinking about a currency pair, ask:\n\n- How does relative growth look?\n- How do interest rates and expected policy paths compare?\n- Is this currency rich or cheap versus history and PPP-type measures?\n- Is global risk sentiment supportive or hostile to carry?",
      },
    ],
  },
  {
    id: "ch13",
    order: 13,
    part: "Part IV – Open Economy, FX, and Cross-Asset Macro",
    title: "Macro and Equities, Credit, Commodities, and Crypto",
    sections: [
      {
        id: "ch13-s1",
        heading: "13.1 Equities",
        body: "Equity indices reflect:\n\n- Earnings (profits).\n- Valuation multiples (what investors are willing to pay for those earnings).\n- Sector and style composition (cyclical vs defensive, growth vs value).\n\nMacro influences:\n\n- Growth and inflation shape top-line revenue and margins.\n- Policy and yields affect discount rates and valuation.\n- Risk sentiment drives flows into and out of the asset class.",
      },
      {
        id: "ch13-s2",
        heading: "13.2 Credit",
        body: "Credit markets price the risk that borrowers will not pay back. Key concepts:\n\n- Credit spreads: yield difference between risky bonds and safe government bonds.\n- Credit cycle: phases of easy lending, tightening, stress, and repair.\n\nMacro and policy affect:\n\n- Default risk (via growth and funding conditions).\n- Risk appetite for holding credit risk.",
      },
      {
        id: "ch13-s3",
        heading: "13.3 Commodities",
        body: "Different groups:\n\n- Energy (oil, gas).\n- Metals (industrial metals, precious metals).\n- Agriculture.\n\nDrivers:\n\n- Supply and demand fundamentals.\n- Inventories and spare capacity.\n- Geopolitics.\n- Macro growth, inflation, and dollar strength.",
      },
      {
        id: "ch13-s4",
        heading: "13.4 Crypto",
        body: "Crypto is a young and evolving asset class, but a few macro links are clear:\n\n- Often trades like a high-beta risk asset sensitive to global liquidity.\n- Narratives can link it to monetary debasement, real yields, or tech adoption.\n- Regulatory and policy shifts can be major catalysts.\n\nAnalysts treat crypto as part of the broader macro-risk complex, not as an isolated universe.",
      },
    ],
  },
  {
    id: "ch14",
    order: 14,
    part: "Part IV – Open Economy, FX, and Cross-Asset Macro",
    title: "Regimes, Correlations, and Macro “Weather Maps”",
    sections: [
      {
        id: "ch14-s1",
        heading: "14.1 Why regimes matter",
        body: "The same data can have different effects depending on the regime. For example:\n\n- In a low-inflation world, strong growth might be unambiguously positive for equities.\n- In a high-inflation world with aggressive tightening, strong data may worry markets about more hikes.\n\nRegimes you might track:\n\n- Inflation shock regime.\n- Growth scare.\n- Policy pivot.\n- Crisis and stress.\n- Recovery and reflation.",
      },
      {
        id: "ch14-s2",
        heading: "14.2 Correlations that flip",
        body: "Correlations are not fixed:\n\n- Stocks and bonds can be negatively correlated in some regimes (bonds as hedge).\n- In inflation shocks, both can sell off together.\n- Gold can trade as a safe haven in some episodes and as a risk asset in others.",
      },
      {
        id: "ch14-s3",
        heading: "14.3 Building a weather map",
        body: "A simple “macro weather map” could track:\n\n- Inflation trend: rising, falling, stable.\n- Growth trend: accelerating, decelerating, stable.\n- Policy stance: easing, neutral, tightening.\n- Risk sentiment: risk-on, mixed, risk-off.\n\nThis gives you a high-level overview of conditions and helps you interpret news and price action.",
      },
    ],
  },
  {
    id: "ch15",
    order: 15,
    part: "Part V – Becoming Your Own Macro Analyst",
    title: "Building a Macro Dashboard",
    sections: [
      {
        id: "ch15-s1",
        heading: "15.1 Keep it small and focused",
        body: "A good dashboard is:\n\n- Small enough to update in under an hour.\n- Comprehensive enough to capture the main macro forces.\n\nStart with:\n\n- Growth, inflation, labour, policy, key markets.\n- For each, one or two indicators you trust.",
      },
      {
        id: "ch15-s2",
        heading: "15.2 Tools and sources",
        body: "Use:\n\n- Official statistics offices and central banks.\n- Reputable data aggregators.\n- Charting tools you already use for trading.\n\nYour goal is not perfect data science; it is a consistent, repeatable process.",
      },
      {
        id: "ch15-s3",
        heading: "15.3 Weekly and monthly routines",
        body: "Weekly:\n\n- Update key market indicators (yields, FX, indices, credit spreads).\n- Scan recent data releases for big surprises.\n\nMonthly:\n\n- Update growth, inflation, and labour charts.\n- Write a one-page macro summary for yourself.\n- Reassess which regime best describes the current environment.",
      },
    ],
  },
  {
    id: "ch16",
    order: 16,
    part: "Part V – Becoming Your Own Macro Analyst",
    title: "Scenarios, Probabilities, and House Views",
    sections: [
      {
        id: "ch16-s1",
        heading: "16.1 Baseline and alternatives",
        body: "A “house view” is just a structured way of saying:\n\n- Here is the most likely macro path.\n- Here are a couple of alternative paths that could happen.\n\nYou might have:\n\n- Baseline: soft-landing style disinflation with mild policy easing.\n- Alternative 1: renewed inflation spike and more tightening.\n- Alternative 2: sharper growth slowdown and earlier, deeper cuts.",
      },
      {
        id: "ch16-s2",
        heading: "16.2 Probabilities without false precision",
        body: "You do not need to attach precise percentages, but rough weightings help:\n\n- Baseline: around half.\n- Alternatives: share the rest.\n\nThe point is to train yourself to think in “more or less likely” rather than all-or-nothing.",
      },
      {
        id: "ch16-s3",
        heading: "16.3 Triggers and signposts",
        body: "For each scenario, define:\n\n- What would confirm it?\n- What would clearly rule it out?\n- Which events or data are key signposts?\n\nThis turns your macro view into a living thing you can update when the world moves.",
      },
    ],
  },
  {
    id: "ch17",
    order: 17,
    part: "Part V – Becoming Your Own Macro Analyst",
    title: "Connecting Macro to Trading Systems and Risk",
    sections: [
      {
        id: "ch17-s1",
        heading: "17.1 Time horizon alignment",
        body: "Macro views usually live in weeks, months, and quarters, not minutes.\n\nIf you are an intraday trader:\n\n- Macro may act more as a filter (for example, avoiding trading against obvious big-picture forces) and as context for volatility and news.\n\nIf you are a swing or position trader:\n\n- Macro can influence which assets you focus on, your directional bias, and how aggressively you size positions.",
      },
      {
        id: "ch17-s2",
        heading: "17.2 Three ways macro can plug into a system",
        body: "Filter:\n\n- Only take trades that do not clash with the dominant macro regime.\n\nTilt:\n\n- Adjust position size or bias slightly based on macro convictions, without overriding the system.\n\nAvoid:\n\n- Stand aside around events or in regimes where your system historically struggles.",
      },
      {
        id: "ch17-s3",
        heading: "17.3 Keeping roles clear",
        body: "Important:\n\n- Macro view: your structured opinion about the world.\n- Trading system: your rules for entries, exits, and risk.\n- Risk management: your position sizing and max loss limits.\n\nDo not let macro views tempt you into ignoring your risk rules.",
      },
    ],
  },
  {
    id: "ch18",
    order: 18,
    part: "Part V – Becoming Your Own Macro Analyst",
    title: "Case Studies: Walking Through Macro Episodes",
    sections: [
      {
        id: "ch18-s1",
        heading: "18.1 Why case studies matter",
        body: "Real episodes teach you how all the pieces come together:\n\n- Data.\n- Policy.\n- Narratives.\n- Price action.\n\nThey show you how messy reality can be and how frameworks still help.",
      },
      {
        id: "ch18-s2",
        heading: "18.2 How to study an episode",
        body: "Pick an event:\n\n- A hiking cycle.\n- An energy shock.\n- A banking scare.\n- A big crypto cycle.\n\nFor that period, ask:\n\n- What was happening in growth, inflation, and labour?\n- What was the central bank doing and saying?\n- How did yield curves, FX, equities, credit, and commodities behave?\n- Which narratives dominated at the time, and how did they evolve?\n\nWrite a short summary. Repeat with multiple episodes over time.",
      },
    ],
  },
  {
    id: "ch19",
    order: 19,
    part: "Part V – Becoming Your Own Macro Analyst",
    title: "Your Macro Playbook: A Practical Checklist",
    sections: [
      {
        id: "ch19-s1",
        heading: "19.1 A quick pre-trading macro check",
        body: "Before you lean into a macro-inspired trade or theme, run through a checklist like this:\n\n- Pillars:\n- Where are we on rates, inflation, growth, risk sentiment, and liquidity?\n- Cycle:\n- Roughly which part of the cycle are we in?\n- Policy:\n- Are central banks tightening, pausing, or easing – and is that priced?\n- Valuation:\n- Are key assets clearly rich or cheap versus history and macro conditions?\n- Scenarios:\n- What are the 2–3 plausible paths ahead and their main triggers?\n- Positioning and sentiment:\n- Is the consensus very crowded in one direction?\n- Trading fit:\n- How does this view align with my system, timeframe, and risk limits?",
      },
      {
        id: "ch19-s2",
        heading: "19.2 Continuous learning",
        body: "Becoming a macro analyst is not about memorising every formula. It is about:\n\n- Asking the right questions consistently.\n- Connecting data, policy, and markets into simple, coherent narratives.\n- Updating your views honestly when the world changes.\n\nIf this book moves you from feeling lost in macro noise to building your own simple, structured views, then it has done its job.\n\nThe rest comes from repetition, curiosity, and time in the market.\n\n- IntelliTrade Technologies\n\nWhere Smarter Trading Starts.",
      },
    ],
  },
];

// ---------- Hooks ----------

function useScrollProgress() {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const onScroll = () => {
      const scrollTop = window.scrollY || document.documentElement.scrollTop;
      const docHeight =
        document.documentElement.scrollHeight - window.innerHeight;
      const p = docHeight > 0 ? scrollTop / docHeight : 0;
      setProgress(Math.min(Math.max(p, 0), 1));
    };

    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return progress;
}

function useActiveChapter(chapters: Chapter[]) {
  const [activeId, setActiveId] = useState<string | null>(
    chapters[0]?.id ?? null,
  );

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActiveId(entry.target.id);
          }
        });
      },
      {
        root: null,
        rootMargin: "-45% 0px -45% 0px",
        threshold: 0.1,
      },
    );

    chapters.forEach((ch) => {
      const el = document.getElementById(ch.id);
      if (el) observer.observe(el);
    });

    return () => observer.disconnect();
  }, [chapters]);

  return activeId;
}

// ---------- Page Component ----------

const brandThemeStyle: ThemeStyle = {
  "--brand-primary": "139 92 246",
  "--brand-primary-light": "232 121 249",
};

export default function MacroMasteryReader() {
  const progress = useScrollProgress();
  const activeChapterId = useActiveChapter(chapters);

  const handleNavClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div
      className="relative min-h-screen bg-gradient-to-b from-black via-black to-black text-slate-100"
      style={brandThemeStyle}
    >
      {/* Top progress bar */}
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-[#2E1065] via-[#5B21B6] to-[#2E1065]"
          style={{ width: `${progress * 100}%`, transition: "width 120ms linear" }}
        />
      </div>

      {/* Background: white web particles on black */}
      <div className="pointer-events-none fixed inset-0 z-0">
        {/* Stronger web-like particle cluster bottom-left */}
        <div className="absolute bottom-0 left-0 h-[26rem] w-[26rem]">
          {/* Big blurred glow */}
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.7),transparent_65%)] blur-[30px] opacity-90" />

          {/* Dense particle nodes */}
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute left-6 bottom-10 h-[4px] w-[4px] rounded-full bg-white/95 blur-[3px]" />
            <div className="absolute left-16 bottom-16 h-[5px] w-[5px] rounded-full bg-white/90 blur-[3px]" />
            <div className="absolute left-10 bottom-24 h-[6px] w-[6px] rounded-full bg-white/85 blur-[4px]" />
            <div className="absolute left-24 bottom-12 h-[4px] w-[4px] rounded-full bg-white/90 blur-[3px]" />
            <div className="absolute left-28 bottom-22 h-[5px] w-[5px] rounded-full bg-white/95 blur-[3px]" />
            <div className="absolute left-20 bottom-30 h-[3px] w-[3px] rounded-full bg-white/90 blur-[3px]" />
            <div className="absolute left-32 bottom-18 h-[4px] w-[4px] rounded-full bg-white/95 blur-[3px]" />

            {/* Simple connecting lines to suggest a web */}
            <div className="absolute left-7 bottom-11 h-[1px] w-[60px] origin-left rotate-[-12deg] bg-white/40 blur-[4px]" />
            <div className="absolute left-18 bottom-17 h-[1px] w-[80px] origin-left rotate-[8deg] bg-white/30 blur-[4px]" />
            <div className="absolute left-13 bottom-25 h-[1px] w-[70px] origin-left rotate-[18deg] bg-white/25 blur-[4px]" />
          </div>
        </div>

        {/* Light secondary cluster mid-left for depth */}
        <div className="absolute left-[-4rem] top-1/3 h-60 w-60 opacity-60">
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.45),transparent_70%)] blur-[28px]" />
        </div>

        {/* Additional soft clusters around the canvas for depth */}
        <div className="absolute right-[-5rem] top-10 h-52 w-52 opacity-55">
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_bottom_left,rgba(255,255,255,0.45),transparent_70%)] blur-[28px]" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute right-10 top-16 h-[4px] w-[4px] rounded-full bg-white/85 blur-[3px]" />
            <div className="absolute right-5 top-24 h-[3px] w-[3px] rounded-full bg-white/80 blur-[3px]" />
            <div className="absolute right-14 top-10 h-[4px] w-[4px] rounded-full bg-white/90 blur-[3px]" />
          </div>
        </div>

        <div className="absolute right-6 bottom-1/3 h-40 w-40 opacity-45">
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_top_left,rgba(255,255,255,0.4),transparent_72%)] blur-[26px]" />
          <div className="pointer-events-none absolute inset-0">
            <div className="absolute right-8 bottom-8 h-[3px] w-[3px] rounded-full bg-white/80 blur-[3px]" />
            <div className="absolute right-4 bottom-14 h-[4px] w-[4px] rounded-full bg-white/85 blur-[3px]" />
          </div>
        </div>

        <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 opacity-30">
          <div className="h-full w-full rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.35),transparent_75%)] blur-[26px]" />
        </div>
      </div>

      {/* Main content layout */}
      <div className="relative z-10 mx-auto flex max-w-6xl gap-8 px-4 pb-32 pt-8 lg:px-8 lg:pt-16">
        {/* Left: sticky navigation */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 flex max-h-[calc(100vh-7rem)] flex-col gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                IntelliTrade Macro Mastery
              </p>
              <h1 className="mt-2 text-sm font-medium text-slate-100">
                From Beginner to Macro Analyst
              </h1>
            </div>
            <div className="h-px bg-white/10" />
            <nav className="min-h-0 space-y-2 overflow-y-auto pb-2 pr-2 text-sm">
              {chapters.map((ch) => {
                const isActive = ch.id === activeChapterId;
                return (
                  <button
                    key={ch.id}
                    type="button"
                    onClick={() => handleNavClick(ch.id)}
                    className={[
                      "group flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition",
                      isActive ? "bg-white/10" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-[0.26em] text-[#A78BFA]/95">
                      {ch.part}
                    </span>
                    <span className="mt-1 text-[13px] font-medium text-slate-100 group-hover:text-white">
                      {ch.title}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Right: main content */}
        <main className="flex-1 space-y-24">
          {/* Intro card */}
          <motion.section
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center rounded-full border border-[#5B21B6]/35 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-[#C4B5FD]/95">
              MACRO COURSE • SUBSCRIBER EXCLUSIVE
            </div>
            <div className="rounded-3xl border border-white/20 bg-white/5 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:p-10">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-3xl">
                IntelliTrade Macro Mastery
              </h1>
              <p className="mt-2 text-sm font-medium text-slate-300">
                How to Think, Read, and Act Like a Macro Strategist – Without Needing a PhD
              </p>
              <p className="mt-4 text-[15px] leading-relaxed text-slate-200/90">
                This interactive ebook is designed for traders who want to go from macro beginner
                to someone who can build real views, read central bank communication with
                confidence, and connect global macro to their own trading process.
              </p>
              <p className="mt-3 text-[13px] text-slate-400">
                Scroll down to review the copyright and permitted-use notice before entering Chapter 1. Your progress bar at the top shows how far you have come through the course.
              </p>
            </div>
          </motion.section>

          <motion.section
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-20% 0px -40% 0px" }}
            transition={{ duration: 0.6 }}
          >
            <div className="mb-4 inline-flex items-center rounded-full border border-white/20 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-slate-200/90">
              COPYRIGHT • PERMITTED USE
            </div>
            <div className="rounded-3xl border border-white/20 bg-white/5 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:p-10">
              <h2 className="text-xl font-semibold tracking-tight text-slate-50 md:text-2xl">
                Copyright and permitted use
              </h2>
              <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-slate-200/90">
                <p>Copyright © 2025 IntelliTrade Technologies. All rights reserved.</p>
                <p>This ebook, course, and all related content are the exclusive property of IntelliTrade Technologies and are protected by international copyright and intellectual property laws.</p>
                <p>This publication is provided to you for your personal, non-transferable, non-commercial use only. You may not copy, reproduce, redistribute, share, upload, publish, sell, resell, license, or otherwise make this ebook, course, or any substantial part of its content available to any third party in any form, whether digital or printed, without the prior written consent of IntelliTrade Technologies, except for brief quotations used in reviews or commentary as permitted by applicable copyright law.</p>
                <p>You may not modify, adapt, translate, reverse engineer, or create derivative works based on this ebook or course, or use it as training material for any machine learning or AI system without express written permission.</p>
                <p>By accessing, reading, or using this ebook or course, you agree to these terms of use.</p>
              </div>
            </div>
          </motion.section>

          {chapters.map((ch, index) => (
            <section key={ch.id} id={ch.id} className="scroll-mt-28">
              <motion.div
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20% 0px -40% 0px" }}
                transition={{ duration: 0.6, delay: index * 0.04 }}
                className="rounded-3xl border border-white/20 bg-white/5 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:p-10"
              >
                <div className="inline-flex items-center rounded-full bg-[linear-gradient(90deg,#5B21B6,rgba(91,33,182,0.15))] px-4 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-slate-100">
                  {ch.part}
                </div>

                <h2 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                  {ch.order}. {ch.title}
                </h2>

                <div className="mt-8 space-y-10 text-[15px] leading-relaxed text-slate-100/90">
                  {ch.sections.map((sec) => (
                    <article key={sec.id} className="space-y-3">
                      <h3 className="text-base font-semibold text-slate-50">
                        {sec.heading}
                      </h3>
                      {sec.body
                        .split("\n\n")
                        .filter((para) => para.trim().length > 0)
                        .map((para, idx) => (
                          <p
                            key={idx}
                            className="whitespace-pre-line text-[15px] text-slate-200/90"
                          >
                            {para}
                          </p>
                        ))}
                    </article>
                  ))}
                </div>
              </motion.div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
