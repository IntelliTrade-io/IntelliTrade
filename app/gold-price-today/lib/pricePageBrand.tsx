"use client";

// ─── Accent themes ────────────────────────────────────────────────────────────

export type PriceTheme = "gold" | "silver" | "bitcoin" | "oil";

interface ThemeDef {
  r: number; g: number; b: number;
  rL: number; gL: number; bL: number;
  /** Tailwind class names used for the active chart tab */
  tabActiveCls: string;
  /** CSS gradient for the hero price value */
  valueGradient: string;
}

const THEMES: Record<PriceTheme, ThemeDef> = {
  gold: {
    r: 251, g: 191, b: 36,
    rL: 252, gL: 215, bL: 90,
    tabActiveCls: "border-amber-400/20 bg-amber-400/[0.10] text-amber-300",
    valueGradient: "linear-gradient(135deg, #fbbf24 0%, #fde68a 60%, #fbbf24 100%)",
  },
  silver: {
    r: 148, g: 163, b: 184,   // slate-400 — cool silver
    rL: 203, gL: 213, bL: 225, // slate-300
    tabActiveCls: "border-slate-400/20 bg-slate-400/[0.10] text-slate-300",
    valueGradient: "linear-gradient(135deg, #94a3b8 0%, #e2e8f0 55%, #94a3b8 100%)",
  },
  bitcoin: {
    r: 249, g: 115, b: 22,    // orange-500 — Bitcoin orange
    rL: 251, gL: 146, bL: 60, // orange-400
    tabActiveCls: "border-orange-500/20 bg-orange-500/[0.10] text-orange-400",
    valueGradient: "linear-gradient(135deg, #f97316 0%, #fdba74 55%, #f97316 100%)",
  },
  oil: {
    r: 139, g: 92, b: 246,    // violet-500 — brand purple
    rL: 167, gL: 139, bL: 250, // violet-400
    tabActiveCls: "border-violet-500/20 bg-violet-500/[0.10] text-violet-400",
    valueGradient: "linear-gradient(135deg, #8b5cf6 0%, #c4b5fd 55%, #8b5cf6 100%)",
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function accentAlpha(opacity: number, variant?: "light", theme: PriceTheme = "gold"): string {
  const t = THEMES[theme];
  const r = variant === "light" ? t.rL : t.r;
  const g = variant === "light" ? t.gL : t.g;
  const b = variant === "light" ? t.bL : t.b;
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

export function getChartTabClassName(isActive: boolean, theme: PriceTheme = "gold"): string {
  return isActive
    ? `rounded-xl border px-3 py-1.5 text-sm font-medium transition-all ${THEMES[theme].tabActiveCls}`
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

/** Injects all `.price-*` CSS classes, themed per asset */
export function PricePageBrandStyles({ theme = "gold" }: { theme?: PriceTheme }) {
  const t = THEMES[theme];
  const accent = `${t.r}, ${t.g}, ${t.b}`;
  const accentL = `${t.rL}, ${t.gL}, ${t.bL}`;

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
        color: rgba(${accentL}, 0.78);
      }
      .price-value-brand {
        background: ${t.valueGradient};
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .price-widget-chip {
        background: rgba(${accent}, 0.08);
        border-color: rgba(${accent}, 0.22);
      }
      .price-widget-chip:hover {
        background: rgba(${accent}, 0.14);
        border-color: rgba(${accent}, 0.34);
      }
      .price-chart-shell {
        background: rgba(5, 5, 7, 0.58);
        border: 1px solid rgba(255, 255, 255, 0.07);
      }
      .price-chart-shell-hover {
        transition: border-color 200ms;
      }
      .price-chart-shell-hover:hover {
        border-color: rgba(${accent}, 0.14);
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
