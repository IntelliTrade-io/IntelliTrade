import Link from "next/link";

// Shared tail block for every "Price Today" page: cross-links to the other
// live-price pages (internal-linking / discoverability) plus the explicit
// educational disclaimer. Rendered on all four asset pages so none of them
// relies on the global footer alone.

const PRICE_PAGES = [
  { asset: "gold", href: "/gold-price-today", label: "Gold Price Today (XAU/USD)" },
  { asset: "silver", href: "/silver-price-today", label: "Silver Price Today (XAG/USD)" },
  { asset: "oil", href: "/oil-price-today", label: "Oil Price Today (Brent)" },
  { asset: "bitcoin", href: "/bitcoin-price-today", label: "Bitcoin Price Today (BTC/USD)" },
] as const;

export type PriceAsset = (typeof PRICE_PAGES)[number]["asset"];

export const PRICE_PAGE_DISCLAIMER =
  "Educational content only. The prices, charts, and commentary on this page are general market information for educational purposes. They are not investment advice, trading signals, or a recommendation to buy or sell any instrument. Market data can be delayed and can differ between providers. Always do your own research and consider your own situation before making trading decisions.";

export function PricePageFooterNote({ asset }: { asset: PriceAsset }) {
  const others = PRICE_PAGES.filter((page) => page.asset !== asset);

  return (
    <section aria-label="More live prices and disclaimer" className="mt-10">
      <div className="price-surface-card rounded-2xl p-5 md:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-slate-400">
          More live prices
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          {others.map((page) => (
            <Link
              key={page.href}
              href={page.href}
              className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.04] px-4 py-2 text-sm text-slate-200 transition-colors hover:border-white/24 hover:bg-white/[0.08] hover:text-white"
            >
              {page.label}
            </Link>
          ))}
        </div>
      </div>

      <div className="mt-4 rounded-2xl border border-amber-300/16 bg-amber-300/[0.05] px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-amber-100/80">
          Educational disclaimer
        </p>
        <p className="mt-2 text-xs leading-relaxed text-amber-50/75">{PRICE_PAGE_DISCLAIMER}</p>
      </div>
    </section>
  );
}

export default PricePageFooterNote;
