import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Smart Support Zones · EURUSD support-zone strength scoring";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Smart Support Zones",
    title: "Most tools draw zones. IntelliTrade scores them.",
    subtitle: "EURUSD support-zone strength scoring: weak, medium or strong.",
    accent: [124, 58, 237],
  });
}
