"use client";

import { Globe2 } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { ConflictMapSurface } = require("../modules/ConflictMapModule.jsx");
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

interface ConflictMapPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

export function ConflictMapPanel({ panel, onToggleLock, onRemove }: ConflictMapPanelProps) {
  return (
    <WidgetShell
      title="Conflict map"
      subtitle="Bundled geopolitical signals with hotspot drilldown."
      className="h-full"
      contentClassName="min-h-0 overflow-hidden"
      headerRight={
        <>
          <Pill active>
            <Globe2 className="h-3.5 w-3.5" />
            Live feed
          </Pill>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <ConflictMapSurface compact />
    </WidgetShell>
  );
}
