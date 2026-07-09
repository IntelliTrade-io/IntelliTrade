import type React from "react";

// Calendar domain types moved to types/domain/calendar.ts (plan 5.6);
// re-exported here so existing imports keep working.
export type { ImpactLevel, EventExtras, CalendarEvent } from "@/types/domain/calendar";

export type WorkspaceMode = "standard" | "wide" | "studio";
export type WidgetType =
  | "chart"
  | "calendar"
  | "calculator"
  | "strength"
  | "strengthIntraday"
  | "conflict"
  | "journal"
  | "game"
  | "macro"
  | "supportResistance";


export interface Panel {
  id: string;
  type: WidgetType;
  x: number;
  y: number;
  w: number;
  h: number;
  locked: boolean;
}

export interface SavedWorkspace {
  id: string;
  name: string;
  workspaceMode: WorkspaceMode;
  panels: Panel[];
  updatedAt: string;
}

export interface WorkspacePreset {
  label: string;
  shortLabel: string;
  cols: number;
  maxWidthClass: string;
  maxWidth: string;
}

export interface PanelDimension {
  w: number;
  h: number;
  minW: number;
  minH: number;
  maxW?: number;
}

export interface WidgetCatalogEntry {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  comingSoon?: boolean;
}
