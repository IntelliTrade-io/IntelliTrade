"use client";

import { LineChart } from "lucide-react";
import { SupportResistanceAlphaLive } from "@/components/support-resistance/SupportResistanceAlphaLive";
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

interface SupportResistancePanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
  focused?: boolean;
}

export function SupportResistancePanel({ panel, onToggleLock, onRemove, focused = false }: SupportResistancePanelProps) {
  return (
    <WidgetShell
      title="Support & Resistance Alpha"
      subtitle="Live EURUSD M15 support-zone context."
      className="h-full"
      contentClassName="min-h-0 overflow-y-auto"
      headerRight={
        <>
          <Pill active>
            <LineChart className="h-3.5 w-3.5" />
            Alpha · EURUSD support
          </Pill>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <SupportResistanceAlphaLive compact={!focused} />
    </WidgetShell>
  );
}
