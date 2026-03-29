"use client";

import { Gamepad2 } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { BullBearSurface } = require("../modules/BullBearExperience.jsx");
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

interface BullBearPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

export function BullBearPanel({ panel, onToggleLock, onRemove }: BullBearPanelProps) {
  return (
    <WidgetShell
      title="Bull vs Bear"
      subtitle="Live interactive game module."
      className="h-full"
      contentClassName="min-h-0 overflow-hidden"
      headerRight={
        <>
          <Pill>
            <Gamepad2 className="h-3.5 w-3.5" />
            Playable
          </Pill>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <BullBearSurface compact />
    </WidgetShell>
  );
}
