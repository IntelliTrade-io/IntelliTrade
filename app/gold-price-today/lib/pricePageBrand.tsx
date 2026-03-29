"use client";

// Amber-gold accent colour used across the gold price page
const ACCENT = { r: 251, g: 191, b: 36 };
const ACCENT_LIGHT = { r: 252, g: 215, b: 90 };

export function accentAlpha(opacity: number, variant?: "light"): string {
  const c = variant === "light" ? ACCENT_LIGHT : ACCENT;
  return `rgba(${c.r}, ${c.g}, ${c.b}, ${opacity})`;
}

export function getChartTabClassName(isActive: boolean): string {
  return isActive
    ? "rounded-xl border border-amber-400/20 bg-amber-400/[0.10] px-3 py-1.5 text-sm font-medium text-amber-300 transition-all"
    : "rounded-xl px-3 py-1.5 text-sm text-slate-400 transition-all hover:bg-white/5 hover:text-slate-200";
}

export function getMarketMoveClassName(move: string): string {
  if (move.trimStart().startsWith("+")) return "text-emerald-400";
  if (move.trimStart().startsWith("-")) return "text-red-400";
  return "text-slate-400";
}

export function getQuoteChangeClassName(isNegative: boolean): string {
  return isNegative ? "text-red-400" : "text-emerald-400";
}

/** Dot-grid radial backdrop — matches house `.radial-backdrop` style */
export function RadialBackdrop() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute z-0"
      style={{
        inset: "-9900%",
        background: "radial-gradient(circle at 50% 50%, #0000 0, #0000 20%, #111111aa 50%)",
        backgroundSize: "3px 3px",
      }}
    />
  );
}

/** Injects all `.price-*` CSS classes used by the gold price page */
export function PricePageBrandStyles() {
  return (
    <style>{`
      .price-surface {
        position: relative;
        background: linear-gradient(180deg, rgba(14, 10, 4, 0.88) 0%, rgba(8, 6, 2, 0.94) 100%);
        border: 1px solid rgba(255, 255, 255, 0.11);
        overflow: hidden;
      }
      .price-surface-card {
        position: relative;
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.09);
        overflow: hidden;
      }
      .price-surface-content {
        position: relative;
        z-index: 1;
      }
      .price-eyebrow {
        color: rgba(251, 191, 36, 0.78);
      }
      .price-value-brand {
        background: linear-gradient(135deg, #fbbf24 0%, #fde68a 60%, #fbbf24 100%);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .price-widget-chip {
        background: rgba(251, 191, 36, 0.08);
        border-color: rgba(251, 191, 36, 0.22);
      }
      .price-widget-chip:hover {
        background: rgba(251, 191, 36, 0.14);
        border-color: rgba(251, 191, 36, 0.34);
      }
      .price-chart-shell {
        background: rgba(5, 5, 7, 0.58);
        border: 1px solid rgba(255, 255, 255, 0.07);
      }
      .price-chart-shell-hover {
        transition: border-color 200ms;
      }
      .price-chart-shell-hover:hover {
        border-color: rgba(251, 191, 36, 0.14);
      }
      .price-divider-top {
        border-color: rgba(255, 255, 255, 0.08);
      }
      .price-faq-hover:hover {
        background: rgba(255, 255, 255, 0.025);
      }
    `}</style>
  );
}
