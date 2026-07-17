import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Compounding Calculator · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Free Tool",
    title: "Compounding Calculator",
    subtitle: "Project trading account growth over time, period by period.",
    accent: [124, 58, 237],
  });
}
