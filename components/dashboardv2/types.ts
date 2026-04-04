import type React from "react";

export type ImpactLevel = "high" | "medium" | "low";
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
  | "macro";

export interface EventExtras {
  release_time_local: string;
  event_local_tz: string;
  time_confidence: string;
  category: string;
  source_url_standardized: string;
  event_description: string;
  pair_relevance: { primary_fx_pairs: string[]; related_assets: string[] };
}

export interface CalendarEvent {
  id: number;
  isoDateTime: string;
  dateLabel: string;
  timeLabel: string;
  currency: string;
  region: string;
  flagCode: string;
  title: string;
  impact: ImpactLevel;
  agency: string;
  source: string;
  rawUrl: string;
  extras: EventExtras;
}

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
}

export interface PanelDimension {
  w: number;
  h: number;
  minW: number;
  minH: number;
}

export interface WidgetCatalogEntry {
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}
