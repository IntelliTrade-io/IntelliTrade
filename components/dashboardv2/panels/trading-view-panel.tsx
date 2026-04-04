"use client";

import { useEffect, useRef } from "react";
import { WidgetShell } from "../ui/widget-shell";
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
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Clear any previously injected script on re-mount
    container.innerHTML = "";

    const widgetDiv = document.createElement("div");
    widgetDiv.className = "tradingview-widget-container__widget";
    widgetDiv.style.height = "100%";
    widgetDiv.style.width = "100%";
    container.appendChild(widgetDiv);

    const script = document.createElement("script");
    script.src =
      "https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js";
    script.type = "text/javascript";
    script.async = true;
    script.innerHTML = JSON.stringify({
      allow_symbol_change: true,
      calendar: false,
      details: true,
      hide_side_toolbar: false,
      hide_top_toolbar: false,
      hide_legend: false,
      hide_volume: false,
      hotlist: true,
      interval: "D",
      locale: "en",
      save_image: true,
      style: "1",
      symbol: "FX:EURUSD",
      theme: "dark",
      timezone: "Etc/UTC",
      backgroundColor: "#0d0d13",
      gridColor: "rgba(242, 242, 242, 0.06)",
      watchlist: [],
      withdateranges: true,
      compareSymbols: [],
      studies: [],
      autosize: true,
    });
    container.appendChild(script);

    return () => {
      container.innerHTML = "";
    };
  }, []);

  return (
    <WidgetShell
      title="TradingView chart"
      className="h-full"
      contentClassName="min-h-0"
      headerRight={
        <>
          <PanelActions
            locked={panel.locked}
            onToggleLock={onToggleLock}
            onDuplicate={onDuplicate}
            onRemove={onRemove}
          />
        </>
      }
    >
      <div className="h-full min-h-0 overflow-hidden rounded-[22px] border border-white/10 bg-[#0d0d13]">
        <div
          ref={containerRef}
          className="tradingview-widget-container"
          style={{ height: "100%", width: "100%" }}
        />
      </div>
    </WidgetShell>
  );
}
