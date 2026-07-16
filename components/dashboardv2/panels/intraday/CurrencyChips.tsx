"use client";

import { CURRENCIES, CURRENCY_COLORS } from "./constants";
import type { CCY, PairFocus } from "@/lib/intradayFilters";

// Toggleable currency chips plus a "Show all" reset. Hover / keyboard focus
// emphasizes a line on the chart (transient, not a state change) via onEmphasize.

interface CurrencyChipsProps {
  visible: CCY[];
  pairFocus: PairFocus | null;
  onToggle: (ccy: CCY) => void;
  onShowAll: () => void;
  onShowNone: () => void;
  onClearFocus: () => void;
  onEmphasize: (ccy: CCY | null) => void;
}

export function CurrencyChips({
  visible,
  pairFocus,
  onToggle,
  onShowAll,
  onShowNone,
  onClearFocus,
  onEmphasize,
}: CurrencyChipsProps) {
  const allVisible = visible.length === CURRENCIES.length;
  return (
    <div className="flex items-center gap-2 overflow-x-auto pb-1">
      {CURRENCIES.map((c) => {
        const isOn = visible.includes(c);
        const isLast = isOn && visible.length <= 1;
        return (
          <button
            key={c}
            type="button"
            aria-pressed={isOn}
            aria-disabled={isLast}
            onClick={() => !isLast && onToggle(c)}
            onMouseEnter={() => onEmphasize(c)}
            onMouseLeave={() => onEmphasize(null)}
            onFocus={() => onEmphasize(c)}
            onBlur={() => onEmphasize(null)}
            className={`inline-flex h-11 min-w-[44px] shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60 ${
              isOn
                ? "border-white/12 bg-white/[0.06] text-white"
                : "border-white/8 bg-white/[0.02] text-white/40"
            } ${isLast ? "cursor-not-allowed opacity-70" : "hover:border-white/20"}`}
          >
            <span
              className="inline-block h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: CURRENCY_COLORS[c], opacity: isOn ? 1 : 0.35 }}
            />
            {c}
          </button>
        );
      })}

      <button
        type="button"
        aria-pressed={allVisible}
        onClick={allVisible ? onShowNone : onShowAll}
        className="inline-flex h-11 shrink-0 items-center rounded-full border border-white/10 bg-black/30 px-3 text-xs font-semibold text-white/60 transition-all hover:border-white/20 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
      >
        {allVisible ? "Show none" : "Show all"}
      </button>

      {pairFocus && (
        <button
          type="button"
          onClick={onClearFocus}
          className="inline-flex h-11 shrink-0 items-center gap-1 rounded-full border border-violet-400/20 bg-violet-500/[0.12] px-3 text-xs font-semibold text-violet-100 transition-all hover:border-violet-400/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        >
          Clear focus: {pairFocus.base} / {pairFocus.quote}
        </button>
      )}
    </div>
  );
}
