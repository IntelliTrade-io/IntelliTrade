"use client";

import "react-grid-layout/css/styles.css";
import "react-resizable/css/styles.css";
// eslint-disable-next-line @typescript-eslint/no-require-imports
const ReactGridLayout = require("react-grid-layout").default ?? require("react-grid-layout");
import { useContainerWidth } from "react-grid-layout";
import { useState } from "react";
import { BookOpen, CalendarDays, CandlestickChart, Calculator, FileText, Gamepad2, Globe2, LayoutDashboard, Radar } from "lucide-react";
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
import type { Panel, WidgetType } from "./types";

const PANEL_TABS = [
  { id: null,              label: "Dashboard",    icon: LayoutDashboard },
  { id: "calendar",        label: "Calendar",     icon: CalendarDays },
  { id: "calculator",      label: "Calculator",   icon: Calculator },
  { id: "chart",           label: "TradingView",  icon: CandlestickChart },
  { id: "strength",        label: "Strength",     icon: Radar },
  { id: "conflict",        label: "Conflict Map", icon: Globe2 },
  { id: "journal",         label: "Journal",      icon: FileText },
  { id: "game",            label: "Bull vs Bear", icon: Gamepad2 },
  { id: "macro",           label: "Macro Mastery",icon: BookOpen },
] as const;

type TabId = typeof PANEL_TABS[number]["id"];

const FOCUS_PANEL: Panel = { id: "focus-view", type: "chart", x: 0, y: 0, w: 12, h: 24, locked: false };

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

  const [focusedType, setFocusedType] = useState<TabId>(null);

  return (
    <div className="min-h-screen bg-transparent px-6 pb-8 pt-4 text-white sm:px-8 lg:px-10">
      <div className={cn("mx-auto", workspaceConfig.maxWidthClass)}>

        {/* Panel switcher pill nav */}
        <div className="mb-4 flex justify-center">
          <div className="flex max-w-full items-center gap-2 overflow-x-auto rounded-full border border-white/10 bg-black/55 p-2 shadow-[0_18px_48px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
            {PANEL_TABS.map((tab) => {
              const Icon = tab.icon;
              const isActive = focusedType === tab.id;
              return (
                <button
                  key={String(tab.id)}
                  onClick={() => setFocusedType(tab.id)}
                  className={cn(
                    "inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-sm transition-all",
                    isActive
                      ? "border-violet-400/20 bg-violet-500/[0.12] text-white"
                      : "border-white/10 bg-white/[0.04] text-white/68 hover:border-white/18 hover:text-white",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid view — always mounted so containerRef/ResizeObserver stay alive */}
        <div className={focusedType !== null ? "hidden" : ""}>
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
            className="rounded-[36px] border border-white/8 bg-transparent p-3 sm:p-4"
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

        {/* Focused panel view */}
        {focusedType !== null && (
          <div className="h-[calc(100vh-160px)]">
            {renderPanel(
              { ...FOCUS_PANEL, type: focusedType as WidgetType },
              12,
              () => {},
              () => {},
              focusedType === "chart" ? () => {} : undefined,
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Named export alias for backwards-compat with any existing imports
export { Dashboard as IntelliTradeDashboardRefinedPreview };
export default Dashboard;
