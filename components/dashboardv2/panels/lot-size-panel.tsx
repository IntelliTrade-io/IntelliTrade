"use client";

import { Calculator } from "lucide-react";
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import LotSizeCalculator from "@/components/lot-size-calculator-2";
import type { Panel } from "../types";

interface LotSizePanelProps {
  panel: Panel;
  workspaceCols?: number;
  onToggleLock: () => void;
  onRemove: () => void;
}

export function LotSizePanel({ panel, onToggleLock, onRemove }: LotSizePanelProps) {
  return (
    <WidgetShell
      title="Lot size calculator"
      tone="brand"
      className="h-full"
      contentClassName="min-h-0 overflow-y-auto"
      headerRight={
        <>
          <Pill>
            <Calculator className="h-3.5 w-3.5" />
            Lot Size
          </Pill>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <LotSizeCalculator className="h-full" />
    </WidgetShell>
  );
}
