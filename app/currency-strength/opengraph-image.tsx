import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Currency Strength Meter · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Daily Reading",
    title: "Currency Strength",
    subtitle: "Yesterday's strength scores for the eight major currencies, ranked strongest to weakest.",
    accent: [13, 148, 136],
  });
}
