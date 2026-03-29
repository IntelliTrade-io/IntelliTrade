"use client";

import { FileText } from "lucide-react";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { IntelliJournalSurface } = require("../modules/IntelliJournalModule.jsx");
import { WidgetShell } from "../ui/widget-shell";
import { Pill } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

interface JournalPanelProps {
  panel: Panel;
  onToggleLock: () => void;
  onRemove: () => void;
}

export function JournalPanel({ panel, onToggleLock, onRemove }: JournalPanelProps) {
  return (
    <WidgetShell
      title="IntelliJournal"
      subtitle="Journal overview with equity pulse and recent executions."
      className="h-full"
      contentClassName="min-h-0 overflow-hidden"
      headerRight={
        <>
          <Pill active>
            <FileText className="h-3.5 w-3.5" />
            Journal
          </Pill>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <IntelliJournalSurface compact />
    </WidgetShell>
  );
}
