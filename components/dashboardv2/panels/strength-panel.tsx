"use client";

import { useState } from "react";
import { Radar, RefreshCw, Waves } from "lucide-react";
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { IconAction, PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

interface StrengthPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
  variant?: "daily" | "intraday";
}

export function EmbeddedStrengthPanel({
  panel,
  onToggleLock,
  onRemove,
  variant = "daily",
}: StrengthPanelProps) {
  const [frameVersion, setFrameVersion] = useState(0);
  const isIntraday = variant === "intraday";
  const frameSrc = `${
    isIntraday
      ? "/currency-strength-meter-intraday/index.html"
      : "/currency-strength-meter/index.html"
  }?panel=${panel.id}&v=${frameVersion}`;

  return (
    <WidgetShell
      title={isIntraday ? "Currency strength intraday" : "Currency strength meter"}
      subtitle={
        isIntraday
          ? "Exact intraday scanner module inside the workspace."
          : "Exact daily scanner module inside the workspace."
      }
      className="h-full"
      contentClassName="min-h-0"
      headerRight={
        <>
          <Pill active>
            {isIntraday ? (
              <Waves className="h-3.5 w-3.5" />
            ) : (
              <Radar className="h-3.5 w-3.5" />
            )}
            {isIntraday ? "Intraday" : "Daily"}
          </Pill>
          <IconAction
            label="Reload scanner module"
            onClick={() => setFrameVersion((v) => v + 1)}
          >
            <RefreshCw className="h-4 w-4" />
          </IconAction>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-2 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl">
        <iframe
          key={frameVersion}
          title={`${isIntraday ? "Currency strength intraday" : "Currency strength meter"} ${panel.id}`}
          src={frameSrc}
          className="h-full min-h-0 w-full rounded-[20px] border border-white/10 bg-[#05060a]"
        />
      </div>
    </WidgetShell>
  );
}

export function CurrencyStrengthPanel(props: Omit<StrengthPanelProps, "variant">) {
  return <EmbeddedStrengthPanel {...props} variant="daily" />;
}

export function CurrencyStrengthIntradayPanel(props: Omit<StrengthPanelProps, "variant">) {
  return <EmbeddedStrengthPanel {...props} variant="intraday" />;
}
