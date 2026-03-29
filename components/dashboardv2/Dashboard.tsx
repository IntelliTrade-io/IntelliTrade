"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactGridLayout = require("react-grid-layout").default ?? require("react-grid-layout");
import { useContainerWidth } from "react-grid-layout";
import { cn } from "@/lib/utils";
import { GRID_MARGIN, GRID_ROW_HEIGHT } from "./constants";
import { useWorkspace } from "./hooks/use-workspace";
import { WorkspaceHeader } from "./workspace/workspace-header";
import { TradingViewPanel } from "./panels/trading-view-panel";
import { CalendarPanel } from "./panels/calendar-panel";
import { LotSizePanel } from "./panels/lot-size-panel";
import { CurrencyStrengthPanel, CurrencyStrengthIntradayPanel } from "./panels/strength-panel";
import { ConflictMapPanel } from "./panels/conflict-map-panel";
import { JournalPanel } from "./panels/journal-panel";
import { BullBearPanel } from "./panels/bull-bear-panel";
import { MacroMasteryPanel } from "./panels/macro-mastery-panel";
import type { Panel } from "./types";

function renderPanel(
  panel: Panel,
  workspaceCols: number,
  onToggleLock: () => void,
  onRemove: () => void,
  onDuplicate?: () => void,
) {
  const base = { panel, workspaceCols, onToggleLock, onRemove };

  switch (panel.type) {
    case "chart":
      return (
        <TradingViewPanel
          {...base}
          onDuplicate={onDuplicate ?? (() => {})}
        />
      );
    case "calendar":
      return <CalendarPanel {...base} />;
    case "calculator":
      return <LotSizePanel {...base} />;
    case "strength":
      return <CurrencyStrengthPanel {...base} />;
    case "strengthIntraday":
      return <CurrencyStrengthIntradayPanel {...base} />;
    case "conflict":
      return <ConflictMapPanel {...base} />;
    case "journal":
      return <JournalPanel {...base} />;
    case "game":
      return <BullBearPanel {...base} />;
    case "macro":
      return <MacroMasteryPanel {...base} />;
    default:
      return null;
  }
}

export function Dashboard() {
  const {
    panels,
    workspaceMode,
    workspaceConfig,
    savedWorkspaces,
    activeWorkspaceId,
    activeWorkspace,
    isWorkspaceDirty,
    gridLayout,
    lockedCount,
    addPanel,
    saveWorkspace,
    loadWorkspaceSnapshot,
    deleteWorkspace,
    toggleLock,
    duplicatePanel,
    removePanel,
    syncPanelLayout,
    changeWorkspaceMode,
  } = useWorkspace();

  const { width, containerRef } = useContainerWidth({ initialWidth: 1520 });

  return (
    <div className="min-h-screen bg-[#020203] px-6 pb-8 pt-8 text-white sm:px-8 lg:px-10">
      <div className={cn("mx-auto", workspaceConfig.maxWidthClass)}>
        <WorkspaceHeader
          panels={panels}
          workspaceConfig={workspaceConfig}
          workspaceMode={workspaceMode}
          lockedCount={lockedCount}
          savedWorkspaces={savedWorkspaces}
          activeWorkspaceId={activeWorkspaceId}
          activeWorkspace={activeWorkspace}
          isWorkspaceDirty={isWorkspaceDirty}
          onSaveWorkspace={saveWorkspace}
          onLoadWorkspace={loadWorkspaceSnapshot}
          onDeleteWorkspace={deleteWorkspace}
          onChangeMode={changeWorkspaceMode}
          onAddPanel={addPanel}
        />

        <div
          ref={containerRef}
          className="rounded-[36px] border border-white/8 bg-[linear-gradient(180deg,rgba(10,10,14,0.76),rgba(5,5,8,0.82))] p-3 shadow-[0_20px_60px_rgba(0,0,0,0.28)] backdrop-blur-2xl sm:p-4"
        >
          <ReactGridLayout
            className="workspace-grid"
            width={width}
            layout={gridLayout}
            cols={workspaceConfig.cols}
            rowHeight={GRID_ROW_HEIGHT}
            margin={GRID_MARGIN}
            containerPadding={[0, 0]}
            compactType="vertical"
            draggableHandle=".widget-drag-handle"
            resizeHandles={["n", "e", "s", "w", "ne", "nw", "se", "sw"]}
            onLayoutChange={(layout: { i: string; x: number; y: number; w: number; h: number }[]) => syncPanelLayout([...layout])}
          >
            {panels.map((panel) => (
              <div key={panel.id} className="h-full min-h-0">
                {renderPanel(
                  panel,
                  workspaceConfig.cols,
                  () => toggleLock(panel.id),
                  () => removePanel(panel.id),
                  panel.type === "chart" ? () => duplicatePanel(panel.id) : undefined,
                )}
              </div>
            ))}
          </ReactGridLayout>
        </div>
      </div>
    </div>
  );
}

// Named export alias for backwards-compat with any existing imports
export { Dashboard as IntelliTradeDashboardRefinedPreview };
export default Dashboard;
