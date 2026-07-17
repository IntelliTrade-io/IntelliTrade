import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Forex Market Hours & Session Clock · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Free Tool",
    title: "Forex Market Hours",
    subtitle: "Is the market open now? Live Sydney, Tokyo, London, New York sessions.",
    accent: [124, 58, 237],
  });
}
