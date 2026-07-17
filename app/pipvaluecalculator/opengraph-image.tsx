import { renderPriceOg, OG_SIZE, OG_CONTENT_TYPE } from "@/lib/og/priceOgImage";

export const alt = "Pip Value Calculator · IntelliTrade";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return renderPriceOg({
    eyebrow: "Free Tool",
    title: "Pip Value Calculator",
    subtitle: "Pip value in your account currency for any pair, with live rates.",
    accent: [124, 58, 237],
  });
}
