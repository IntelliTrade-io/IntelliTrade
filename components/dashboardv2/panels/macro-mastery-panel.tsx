"use client";

import { BookOpen } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { MacroMasteryWorkspaceModule } = require("../modules/MacroMasteryModule.jsx");
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

interface MacroMasteryPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

export function MacroMasteryPanel({ panel, onToggleLock, onRemove }: MacroMasteryPanelProps) {
  return (
    <WidgetShell
      title="Macro Mastery"
      subtitle="Interactive macro reader with guided tracks and full course depth."
      className="h-full"
      contentClassName="min-h-0 overflow-hidden"
      headerRight={
        <>
          <Pill>
            <BookOpen className="h-3.5 w-3.5" />
            Course
          </Pill>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <MacroMasteryWorkspaceModule compact />
    </WidgetShell>
  );
}
