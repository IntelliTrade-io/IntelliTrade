import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Gold Price Today (XAU/USD) · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Live Price",
    title: "Gold Price Today",
    subtitle: "Real-time XAU/USD quote, daily chart and market context.",
    accent: [251, 191, 36],
  });
}
