import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Economic Calendar Recap · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Event Recap",
    title: "Economic Calendar",
    subtitle: "Recent high-impact events with the measured release-day market reaction.",
    accent: [139, 92, 246],
  });
}
