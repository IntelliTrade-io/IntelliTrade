import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";
import { PER_PAIR_SYMBOLS, describePair, isSupportedPairSlug, pairToSlug, slugToPair } from "@/lib/pair-meta";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Margin Calculator · IntelliTrade";
export const dynamicParams = false;

export function generateStaticParams(): { pair: string }[] {
  return PER_PAIR_SYMBOLS.map((symbol) => ({ pair: pairToSlug(symbol) }));
}

export default async function Image({ params }: { params: Promise<{ pair: string }> }) {
  const { pair: slug } = await params;
  const display = isSupportedPairSlug(slug) ? describePair(slugToPair(slug)).display : "Forex";

  return renderPriceOg({
    eyebrow: "Free Tool",
    title: `${display} Margin Calculator`,
    subtitle: `Required margin to open a leveraged ${display} position, with live rates.`,
    accent: [124, 58, 237],
  });
}
