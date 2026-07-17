import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

// Covers /lotsizecalculator and its nested /faq route (file convention
// cascades to nested segments).
export const alt = "Lot Size Calculator · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Free Tool",
    title: "Lot Size Calculator",
    subtitle: "Size every position to your risk, with live exchange rates.",
    accent: [124, 58, 237],
  });
}
