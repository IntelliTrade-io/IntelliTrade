import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

// Site-wide default social card: any route without its own opengraph-image
// inherits this. Replaces the untouched Next + Supabase starter template PNG.
// Twitter cards fall back to the OG image, so this covers both.
export const alt = "IntelliTrade — pre-trade analysis for disciplined traders";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "IntelliTrade",
    title: "Stop trading blind. Start with context.",
    subtitle: "Support-zone quality, currency strength, event risk and position sizing.",
    accent: [124, 58, 237],
  });
}
