import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";
import {
  STRENGTH_PAIR_SYMBOLS,
  strengthPairFromSlug,
  strengthPairToSlug,
} from "@/lib/strength-pairs";

// Per-pair social card, overriding the generic /currency-strength OG for each
// pair page. Prerendered for every standard pair at build time.
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Currency Strength · IntelliTrade";
export const dynamicParams = false;

export function generateStaticParams(): { pair: string }[] {
  return STRENGTH_PAIR_SYMBOLS.map((symbol) => ({ pair: strengthPairToSlug(symbol) }));
}

export default async function Image({ params }: { params: Promise<{ pair: string }> }) {
  const { pair: slug } = await params;
  const symbol = strengthPairFromSlug(slug);
  const display = symbol ? `${symbol.slice(0, 3)}/${symbol.slice(3)}` : "Forex";

  return renderPriceOg({
    eyebrow: "Daily Reading",
    title: `${display} Currency Strength`,
    subtitle: `Yesterday's strength scores for both sides of ${display}, with the pair's trend detail.`,
    accent: [13, 148, 136],
  });
}
