import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Forex Economic Calendar · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Free Tool",
    title: "Economic Calendar",
    subtitle: "Today's high-impact forex events and the week ahead, in your timezone.",
    accent: [139, 92, 246],
  });
}
