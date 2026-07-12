import Link from "next/link";
import type { MarketContext } from "@/lib/api/marketContext";

// Optional editorial sections of a Sanity marketContext doc (week recap,
// fact rows, related links, dateline). Rendered inside each price page's
// "Market context" section; every block is skipped when its field is empty,
// so docs created before the schema upgrade render exactly as before.
export function MarketContextExtras({ context }: { context: MarketContext | null }) {
  if (!context) return null;

  const stats = context.stats?.filter((s) => s?.label && s?.value) ?? [];
  const links = context.relatedLinks?.filter((l) => l?.label && l?.href) ?? [];
  const hasRecap = Boolean(context.weekRecap?.trim());
  const hasDate = Boolean(context.date);

  if (!stats.length && !links.length && !hasRecap && !hasDate) return null;

  return (
    <div className="mt-7 max-w-4xl space-y-7">
      {stats.length > 0 && (
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {stats.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              <dt className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-400">
                {stat.label}
              </dt>
              <dd className="mt-1 text-sm font-semibold text-slate-100">{stat.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {hasRecap && (
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-50">
            The bigger picture
          </h3>
          <p className="mt-2 text-[15px] leading-relaxed text-slate-200/90">
            {context.weekRecap}
          </p>
        </div>
      )}

      {links.length > 0 && (
        <div>
          <h3 className="text-lg font-semibold tracking-tight text-slate-50">
            Related reading
          </h3>
          <ul className="mt-2 space-y-1.5 text-[15px]">
            {links.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="text-brand underline-offset-2 hover:underline"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasDate && (
        <p className="text-xs text-slate-500">
          Context updated{" "}
          <time dateTime={context.date!}>
            {new Date(context.date!).toLocaleDateString("en-US", {
              month: "long",
              day: "numeric",
              year: "numeric",
            })}
          </time>{" "}
          by the IntelliTrade desk. Educational market commentary, not investment advice.
        </p>
      )}
    </div>
  );
}
