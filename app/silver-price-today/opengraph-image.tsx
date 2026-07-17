import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Silver Price Today (XAG/USD) · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Live Price",
    title: "Silver Price Today",
    subtitle: "Real-time XAG/USD quote, daily chart and market context.",
    accent: [148, 163, 184],
  });
}
