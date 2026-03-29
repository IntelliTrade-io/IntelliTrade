"use client";

import { CandlestickChart, Clock3 } from "lucide-react";
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

interface TradingViewPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onDuplicate: () => void;
  onRemove: () => void;
}

export function TradingViewPanel({
  panel,
  onToggleLock,
  onDuplicate,
  onRemove,
}: TradingViewPanelProps) {
  return (
    <WidgetShell
      title="TradingView chart"
      subtitle="Live chart module with a calm embed surface."
      className="h-full"
      contentClassName="min-h-0"
      headerRight={
        <>
          <Pill>
            <CandlestickChart className="h-3.5 w-3.5" />
            EURUSD
          </Pill>
          <Pill>
            <Clock3 className="h-3.5 w-3.5" />
            1H
          </Pill>
          <PanelActions
            locked={panel.locked}
            onToggleLock={onToggleLock}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
          />
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl">
        <div className="mb-3 flex items-center justify-between gap-3 px-2 pt-1">
          <div className="flex flex-wrap gap-2 text-xs uppercase tracking-[0.18em] text-white/40">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5">
              Chart surface
            </span>
            <span className="rounded-full border border-violet-400/14 bg-violet-500/[0.06] px-3 py-1.5 text-white/74">
              TradingView
            </span>
          </div>
          <div className="hidden items-center gap-2 text-xs text-white/38 sm:flex">
            <Clock3 className="h-3.5 w-3.5" />
            Updated 08:41 UTC
          </div>
        </div>

        <div className="relative min-h-[220px] flex-1 overflow-hidden rounded-[22px] border border-white/10 bg-[#05060a]">
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between border-b border-white/8 bg-[linear-gradient(180deg,rgba(255,255,255,0.025),rgba(255,255,255,0))] px-4 py-3 text-[11px] uppercase tracking-[0.18em] text-white/42">
            <div className="flex items-center gap-3">
              <span className="font-medium text-white/72">EURUSD</span>
              <span>1.0840</span>
              <span className="text-emerald-300/80">+0.18%</span>
            </div>
            <div className="hidden items-center gap-3 sm:flex">
              <span>Bid 1.0839</span>
              <span>Ask 1.0840</span>
            </div>
          </div>

          <div className="pointer-events-none absolute inset-0 opacity-[0.07] [background-image:linear-gradient(rgba(255,255,255,0.16)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.14)_1px,transparent_1px)] [background-size:44px_44px]" />

          <div className="absolute inset-0 flex items-center justify-center">
            <div className="max-w-sm px-6 text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/78">
                <CandlestickChart className="h-7 w-7" />
              </div>
              <h3 className="mt-5 text-lg font-semibold text-white">TradingView container</h3>
              <p className="mt-2 text-sm leading-relaxed text-white/46">Reserved chart embed surface.</p>
            </div>
          </div>
        </div>
      </div>
    </WidgetShell>
  );
}
