import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Bitcoin Price Today (BTC/USD) · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Live Price",
    title: "Bitcoin Price Today",
    subtitle: "Real-time BTC/USD quote, daily chart and market context.",
    accent: [249, 115, 22],
  });
}
