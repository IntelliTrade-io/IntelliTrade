import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "IntelliTrade Pro · Your pre-trade routine in one workspace";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "IntelliTrade Pro",
    title: "Your pre-trade routine, in one workspace.",
    subtitle: "Support-zone quality, currency strength, event risk and position sizing.",
    accent: [124, 58, 237],
  });
}
