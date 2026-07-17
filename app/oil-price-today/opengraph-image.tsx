import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Brent Oil Price Today · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Live Price",
    title: "Brent Oil Price Today",
    subtitle: "Real-time Brent crude quote, daily chart and market context.",
    accent: [139, 92, 246],
  });
}
