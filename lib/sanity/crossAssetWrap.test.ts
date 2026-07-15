import { describe, it, expect } from "vitest";
import {
  parseCrossAssetWrap,
  blockText,
  isWrapHeading,
  type PortableTextBlock,
} from "@/lib/sanity/crossAssetWrap";

type Span = { _type: "span"; text: string; marks?: string[] };

function span(text: string, marks: string[] = []): Span {
  return { _type: "span", text, marks };
}
function heading(text: string, style: "h2" | "h3" | "normal" = "h2"): PortableTextBlock {
  return { _type: "block", style, children: [span(text)] };
}
function bullet(children: Span[]): PortableTextBlock {
  return { _type: "block", style: "normal", listItem: "bullet", children };
}
function normal(text: string): PortableTextBlock {
  return { _type: "block", style: "normal", children: [span(text)] };
}

// Bullets shaped like the real post: strong emoji label span + plain span.
const goldBullet = bullet([
  span("🪙 Gold:", ["strong"]),
  span(
    " Gold is trading near $4,028 after falling around 0.6% today and testing the recent lows. [USD] [REAL YIELDS] [INFLATION]"
  ),
]);
const silverBulletFused = bullet([
  span("🥈 Silver: XAG/USD is near the $57.50 region under the same yield pressure. [USD] [YIELDS] [GROWTH]"),
]);
const oilBullet = bullet([
  span("🛢 Oil (Brent):", ["strong"]),
  span(" Brent is above $84 after a near 10% surge on supply fears. [SUPPLY] [GEOPOLITICS] [INFLATION]"),
]);
const stocksBullet = bullet([
  span("📈 Stocks:", ["strong"]),
  span(" The S&P 500 fell around 0.8% led by technology. [CPI] [TECH] [EARNINGS]"),
]);
const cryptoBullet = bullet([
  span("₿ Crypto:", ["strong"]),
  span(" Bitcoin is trading around $62,800 within a contained range. [LIQUIDITY] [REAL YIELDS] [RISK]"),
]);

describe("blockText", () => {
  it("joins span texts in order", () => {
    expect(blockText(goldBullet)).toBe(
      "🪙 Gold: Gold is trading near $4,028 after falling around 0.6% today and testing the recent lows. [USD] [REAL YIELDS] [INFLATION]"
    );
  });
});

describe("parseCrossAssetWrap", () => {
  it("(1) parses the real-shaped wrap with 5 bullets, ignores stocks, preserves driver tags", () => {
    const body: PortableTextBlock[] = [
      normal("Some intro paragraph."),
      heading("Cross-Asset Wrap:", "h2"),
      goldBullet,
      silverBulletFused,
      oilBullet,
      stocksBullet,
      cryptoBullet,
      normal(""),
      normal("Want to turn this market context into a trading plan?"),
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.gold).toContain("[USD] [REAL YIELDS] [INFLATION]");
    expect(result.entries.gold.startsWith("Gold is trading near $4,028")).toBe(true);
    expect(result.entries.silver).toContain("[USD] [YIELDS] [GROWTH]");
    expect(result.entries.oil).toContain("[SUPPLY] [GEOPOLITICS] [INFLATION]");
    expect(result.entries.bitcoin).toContain("[LIQUIDITY] [REAL YIELDS] [RISK]");
    expect(result.ignoredLabels).toContain("stocks");
    // Stocks paragraph must never leak into a required asset.
    expect(result.entries.gold).not.toContain("S&P 500");
  });

  it("(2) parses entries in a different order", () => {
    const body: PortableTextBlock[] = [
      heading("Cross-Asset Wrap:"),
      cryptoBullet,
      oilBullet,
      goldBullet,
      silverBulletFused,
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.bitcoin).toContain("Bitcoin is trading around $62,800");
    expect(result.entries.gold).toContain("Gold is trading near $4,028");
  });

  it("(3) matches a heading with no colon, odd case and extra whitespace", () => {
    const body: PortableTextBlock[] = [
      heading("  cROSS-asset   WRAP  ", "h3"),
      goldBullet,
      silverBulletFused,
      oilBullet,
      cryptoBullet,
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(true);
  });

  it("(4) accepts oil labelled Oil / Brent / Oil (Brent) with and without the oil emoji variation selector", () => {
    const oilLabels = [
      "Oil:",
      "Brent:",
      "Oil (Brent):",
      "🛢 Oil (Brent):", // no U+FE0F
      "🛢️ Oil (Brent):", // with U+FE0F
    ];
    for (const label of oilLabels) {
      const body: PortableTextBlock[] = [
        heading("Cross-Asset Wrap:"),
        goldBullet,
        silverBulletFused,
        bullet([span(`${label} Brent above $84. [SUPPLY]`)]),
        cryptoBullet,
      ];
      const result = parseCrossAssetWrap(body);
      expect(result.ok, `oil label ${JSON.stringify(label)}`).toBe(true);
      if (!result.ok) continue;
      expect(result.entries.oil).toContain("Brent above $84. [SUPPLY]");
    }
  });

  it("(5) accepts crypto labelled Crypto / Bitcoin / BTC", () => {
    const cryptoLabels = ["Crypto:", "Bitcoin:", "BTC:", "₿ Crypto:"];
    for (const label of cryptoLabels) {
      const body: PortableTextBlock[] = [
        heading("Cross-Asset Wrap:"),
        goldBullet,
        silverBulletFused,
        oilBullet,
        bullet([span(`${label} BTC near $62,800. [RISK]`)]),
      ];
      const result = parseCrossAssetWrap(body);
      expect(result.ok, `crypto label ${JSON.stringify(label)}`).toBe(true);
      if (!result.ok) continue;
      expect(result.entries.bitcoin).toContain("BTC near $62,800. [RISK]");
    }
  });

  it("(6) handles the fused single-span label+paragraph shape", () => {
    const body: PortableTextBlock[] = [
      heading("Cross-Asset Wrap:"),
      bullet([span("🪙 Gold: Gold near $4,000 today. [USD]")]),
      bullet([span("🥈 Silver: Silver near $57. [YIELDS]")]),
      bullet([span("🛢 Oil (Brent): Brent near $84. [SUPPLY]")]),
      bullet([span("₿ Crypto: BTC near $62k. [RISK]")]),
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.gold).toBe("Gold near $4,000 today. [USD]");
  });

  it("(7) excludes CTA/normal blocks after the wrap", () => {
    const body: PortableTextBlock[] = [
      heading("Cross-Asset Wrap:"),
      goldBullet,
      silverBulletFused,
      oilBullet,
      cryptoBullet,
      normal(""),
      // A stray bullet AFTER a normal block must not be consumed.
      bullet([span("🪙 Gold: WRONG later gold text. [X]")]),
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.gold).toContain("Gold is trading near $4,028");
    expect(result.entries.gold).not.toContain("WRONG");
  });

  it("(8) does not parse earlier unrelated bullet lists before the wrap", () => {
    const body: PortableTextBlock[] = [
      heading("Macro Calendar:", "h2"),
      bullet([span("U.S. producer inflation:", ["strong"]), span(" PPI due Wednesday.")]),
      bullet([span("🪙 Gold: EARLY WRONG gold. [X]")]),
      heading("Cross-Asset Wrap:", "h2"),
      goldBullet,
      silverBulletFused,
      oilBullet,
      cryptoBullet,
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.entries.gold).toContain("Gold is trading near $4,028");
    expect(result.entries.gold).not.toContain("EARLY WRONG");
  });

  it("(9) fails as invalid when a required asset is missing", () => {
    const body: PortableTextBlock[] = [
      heading("Cross-Asset Wrap:"),
      goldBullet,
      silverBulletFused,
      // oil omitted
      cryptoBullet,
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
    if (result.reason !== "invalid") return;
    expect(result.missing).toEqual(["oil"]);
  });

  it("(10) returns no-heading when there is no wrap heading", () => {
    const body: PortableTextBlock[] = [
      normal("Just a normal market note."),
      bullet([span("U.S. CPI:", ["strong"]), span(" main event today.")]),
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-heading");
  });

  it("(11) fails as invalid on a duplicate asset", () => {
    const body: PortableTextBlock[] = [
      heading("Cross-Asset Wrap:"),
      goldBullet,
      bullet([span("🪙 Gold: A second gold entry. [X]")]),
      silverBulletFused,
      oilBullet,
      cryptoBullet,
    ];
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("invalid");
    if (result.reason !== "invalid") return;
    expect(result.errors.some((e) => e.includes("Duplicate"))).toBe(true);
  });

  it("(12) does not match 'Cross-Asset Wrap' inside a longer sentence", () => {
    const body: PortableTextBlock[] = [
      normal("Here is the Cross-Asset Wrap: a summary of everything moving today."),
      goldBullet,
      silverBulletFused,
      oilBullet,
      cryptoBullet,
    ];
    expect(isWrapHeading(body[0])).toBe(false);
    const result = parseCrossAssetWrap(body);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("no-heading");
  });
});
