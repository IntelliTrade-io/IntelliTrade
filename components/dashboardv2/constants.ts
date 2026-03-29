import {
  BookOpen,
  Calculator,
  CalendarDays,
  CandlestickChart,
  FileText,
  Gamepad2,
  Globe2,
  Radar,
  Waves,
} from "lucide-react";
import type {
  ImpactLevel,
  PanelDimension,
  WidgetCatalogEntry,
  WidgetType,
  WorkspaceMode,
  WorkspacePreset,
} from "./types";

export const STORAGE_KEY = "dashboardv2-workspace";
export const SETTINGS_STORAGE_KEY = "dashboardv2-workspace-settings";
export const ACTIVE_WORKSPACE_STORAGE_KEY = "dashboardv2-active-workspace";
export const SAVED_WORKSPACES_STORAGE_KEY = "dashboardv2-saved-workspaces";

export const BASE_GRID_COLUMNS = 12;
export const DEFAULT_WORKSPACE_MODE: WorkspaceMode = "standard";
export const GRID_ROW_HEIGHT = 28;
export const GRID_MARGIN: [number, number] = [20, 20];

export const WORKSPACE_PRESETS: Record<WorkspaceMode, WorkspacePreset> = {
  standard: {
    label: "Standard",
    shortLabel: "Std",
    cols: 12,
    maxWidthClass: "max-w-[1560px]",
  },
  wide: {
    label: "Wide",
    shortLabel: "Wide",
    cols: 16,
    maxWidthClass: "max-w-[1880px]",
  },
  studio: {
    label: "Studio",
    shortLabel: "Studio",
    cols: 20,
    maxWidthClass: "max-w-[2240px]",
  },
};

export const PANEL_DEFAULT_DIMENSIONS: Record<WidgetType, PanelDimension> = {
  chart: { w: 7, h: 11, minW: 1, minH: 8 },
  calendar: { w: 5, h: 11, minW: 1, minH: 8 },
  calculator: { w: 5, h: 10, minW: 1, minH: 8 },
  strength: { w: 5, h: 10, minW: 1, minH: 8 },
  strengthIntraday: { w: 6, h: 10, minW: 1, minH: 8 },
  conflict: { w: 7, h: 11, minW: 1, minH: 8 },
  journal: { w: 7, h: 10, minW: 1, minH: 8 },
  game: { w: 6, h: 9, minW: 1, minH: 8 },
  macro: { w: 6, h: 10, minW: 1, minH: 7 },
};

export const WIDGET_CATALOG: Record<WidgetType, WidgetCatalogEntry> = {
  chart: {
    label: "TradingView chart",
    description: "Neutral chart surface with live market chrome.",
    icon: CandlestickChart,
  },
  calendar: {
    label: "Economic calendar",
    description: "Macro releases with impact filters and source detail.",
    icon: CalendarDays,
  },
  calculator: {
    label: "Lot size calculator",
    description: "Risk sizing utility for entries, stops, and units.",
    icon: Calculator,
  },
  strength: {
    label: "Currency strength · daily",
    description: "Exact embedded daily scanner module.",
    icon: Radar,
  },
  strengthIntraday: {
    label: "Currency strength · intraday",
    description: "Embedded intraday scanner surface for session bias.",
    icon: Waves,
  },
  conflict: {
    label: "Conflict map",
    description: "Bundled geopolitical map with hotspot drilldown.",
    icon: Globe2,
  },
  journal: {
    label: "IntelliJournal",
    description: "Journal overview with equity pulse and recent executions.",
    icon: FileText,
  },
  game: {
    label: "Bull vs Bear",
    description: "Live interactive game module.",
    icon: Gamepad2,
  },
  macro: {
    label: "Macro Mastery",
    description: "Interactive macro reader with guided tracks and chapter depth.",
    icon: BookOpen,
  },
};

export const impactMeta: Record<
  ImpactLevel,
  { label: string; badge: string; dot: string }
> = {
  high: {
    label: "High",
    badge: "border-red-400/20 bg-red-500/10 text-red-200",
    dot: "bg-red-500",
  },
  medium: {
    label: "Medium",
    badge: "border-yellow-400/20 bg-yellow-500/10 text-yellow-100",
    dot: "bg-yellow-400",
  },
  low: {
    label: "Low",
    badge: "border-white/10 bg-white/[0.05] text-white/60",
    dot: "bg-zinc-400",
  },
};

export const CURRENCIES = ["All", "USD", "EUR", "GBP", "CAD"];
