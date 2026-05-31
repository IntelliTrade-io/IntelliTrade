"use client";

import { WidgetShell } from "../ui/widget-shell";
import { PanelActions } from "../ui/panel-actions";
import LotSizeCalculator from "@/components/lot-size-calculator-2";
import type { Panel } from "../types";

interface LotSizePanelProps {
  panel: Panel;
  workspaceCols?: number;
  onToggleLock: () => void;
  onRemove: () => void;
  focused?: boolean;
}

export function LotSizePanel({ panel, onToggleLock, onRemove, focused }: LotSizePanelProps) {
  if (focused) {
    return (
      <div className="h-full overflow-y-auto p-1">
        <LotSizeCalculator />
      </div>
    );
  }

  return (
    <WidgetShell
      title="Lot size calculator"
      tone="brand"
      className="h-full"
      contentClassName="min-h-0 overflow-y-auto"
      headerRight={
        <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
      }
    >
      <LotSizeCalculator className="h-full" />
    </WidgetShell>
  );
}
