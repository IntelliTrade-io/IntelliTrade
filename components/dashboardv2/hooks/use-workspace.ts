"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ACTIVE_WORKSPACE_STORAGE_KEY,
  BASE_GRID_COLUMNS,
  DEFAULT_WORKSPACE_MODE,
  PANEL_DEFAULT_DIMENSIONS,
  SAVED_WORKSPACES_STORAGE_KEY,
  SETTINGS_STORAGE_KEY,
  STORAGE_KEY,
  WIDGET_CATALOG,
  WORKSPACE_PRESETS,
} from "../constants";
import type { Panel, SavedWorkspace, WidgetType, WorkspaceMode } from "../types";

// ─── pure helpers ─────────────────────────────────────────────────────────────

function scaleUnits(units: number, cols: number): number {
  return Math.max(1, Math.round((units / BASE_GRID_COLUMNS) * cols));
}

export function clonePanels(panels: Panel[]): Panel[] {
  return panels.map((p) => ({ ...p }));
}

export function snapshotSignature(workspaceMode: WorkspaceMode, panels: Panel[]): string {
  return JSON.stringify({ workspaceMode, panels });
}

export function getPanelDimensions(type: WidgetType, cols: number) {
  const d = PANEL_DEFAULT_DIMENSIONS[type];
  return {
    w: Math.min(cols, scaleUnits(d.w, cols)),
    h: d.h,
    minW: Math.min(cols, scaleUnits(d.minW, cols)),
    minH: d.minH,
  };
}

function createPanel(id: string, type: WidgetType, cols: number, overrides: Partial<Panel> = {}): Panel {
  const d = getPanelDimensions(type, cols);
  return { id, type, x: 0, y: 0, w: d.w, h: d.h, locked: false, ...overrides };
}

export function getLayoutBottom(panels: Panel[]): number {
  return panels.reduce((max, p) => Math.max(max, p.y + p.h), 0);
}

function getNextPanelIdSeed(panels: Panel[]): number {
  return panels.reduce((max, p) => {
    const m = String(p.id).match(/-(\d+)$/);
    return Math.max(max, m ? Number(m[1]) + 1 : 1);
  }, 1);
}

function buildDefaultPanels(cols: number): Panel[] {
  const chart = getPanelDimensions("chart", cols);
  const cal = getPanelDimensions("calendar", cols);
  const calc = getPanelDimensions("calculator", cols);
  const str = getPanelDimensions("strength", cols);
  return [
    createPanel("chart-1", "chart", cols, { x: 0, y: 0, w: chart.w, h: chart.h }),
    createPanel("calendar-1", "calendar", cols, { x: chart.w, y: 0, w: cal.w, h: cal.h }),
    createPanel("calculator-1", "calculator", cols, { x: 0, y: chart.h, w: calc.w, h: calc.h }),
    createPanel("strength-1", "strength", cols, {
      x: calc.w,
      y: chart.h,
      w: Math.max(str.minW, cols - calc.w),
      h: str.h,
    }),
  ];
}

const LEGACY_DIMS: Record<string, Record<string, { w: number; h: number }>> = {
  chart: { medium: { w: 6, h: 9 }, wide: { w: 7, h: 10 }, hero: { w: 8, h: 11 } },
  calendar: { compact: { w: 4, h: 8 }, medium: { w: 5, h: 10 }, wide: { w: 7, h: 11 } },
  calculator: { compact: { w: 4, h: 8 }, medium: { w: 5, h: 9 }, wide: { w: 6, h: 10 } },
  strength: { compact: { w: 4, h: 8 }, medium: { w: 5, h: 9 }, wide: { w: 6, h: 10 } },
};

function normalizePanels(candidate: unknown, cols: number): Panel[] {
  if (!Array.isArray(candidate) || !candidate.length) return buildDefaultPanels(cols);

  const normalized = (candidate as Panel[]).reduce<Panel[]>((acc, panel, index) => {
    if (!panel || !WIDGET_CATALOG[panel.type as WidgetType]) return acc;

    const defaults = getPanelDimensions(panel.type as WidgetType, cols);
    const id =
      typeof panel.id === "string" && panel.id ? panel.id : `${panel.type}-${index + 1}`;

    if (
      typeof panel.x === "number" &&
      typeof panel.y === "number" &&
      typeof panel.w === "number" &&
      typeof panel.h === "number"
    ) {
      const w = Math.min(cols, Math.max(defaults.minW, Math.round(panel.w)));
      const h = Math.max(defaults.minH, Math.round(panel.h));
      const x = Math.max(0, Math.min(cols - w, Math.round(panel.x)));
      const y = Math.max(0, Math.round(panel.y));
      acc.push(createPanel(id, panel.type as WidgetType, cols, { x, y, w, h, locked: Boolean(panel.locked) }));
      return acc;
    }

    const legacySize = (panel as unknown as Record<string, string>).size;
    const legacy =
      LEGACY_DIMS[panel.type]?.[legacySize] ?? PANEL_DEFAULT_DIMENSIONS[panel.type as WidgetType];
    acc.push(
      createPanel(id, panel.type as WidgetType, cols, {
        x: 0,
        y: getLayoutBottom(acc),
        w: Math.min(cols, scaleUnits(legacy.w, cols)),
        h: legacy.h,
        locked: Boolean(panel.locked),
      }),
    );
    return acc;
  }, []);

  return normalized.length ? normalized : buildDefaultPanels(cols);
}

function normalizeSavedWorkspaces(candidate: unknown): SavedWorkspace[] {
  if (!Array.isArray(candidate)) return [];
  return (candidate as SavedWorkspace[])
    .reduce<SavedWorkspace[]>((acc, ws, i) => {
      if (!ws || typeof ws.name !== "string" || !ws.name.trim()) return acc;
      const mode: WorkspaceMode = WORKSPACE_PRESETS[ws.workspaceMode as WorkspaceMode]
        ? ws.workspaceMode
        : DEFAULT_WORKSPACE_MODE;
      acc.push({
        id: typeof ws.id === "string" && ws.id ? ws.id : `workspace-${i + 1}`,
        name: ws.name.trim(),
        workspaceMode: mode,
        panels: normalizePanels(ws.panels, WORKSPACE_PRESETS[mode].cols),
        updatedAt:
          typeof ws.updatedAt === "string" && ws.updatedAt
            ? ws.updatedAt
            : new Date().toISOString(),
      });
      return acc;
    }, [])
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
}

export function formatWorkspaceTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Saved recently";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function scalePanelsToColumns(panels: Panel[], fromCols: number, toCols: number): Panel[] {
  return panels.map((p) => {
    const d = getPanelDimensions(p.type, toCols);
    const w = Math.min(toCols, Math.max(d.minW, Math.round((p.w / fromCols) * toCols)));
    const x = Math.max(0, Math.min(toCols - w, Math.round((p.x / fromCols) * toCols)));
    return { ...p, x, w, h: Math.max(d.minH, p.h) };
  });
}

export function mergeLayoutIntoPanels(
  prev: Panel[],
  next: { i: string; x: number; y: number; w: number; h: number }[],
): Panel[] {
  const byId = new Map(next.map((item) => [item.i, item]));
  let changed = false;
  const merged = prev.map((p) => {
    const item = byId.get(p.id);
    if (!item) return p;
    if (p.x === item.x && p.y === item.y && p.w === item.w && p.h === item.h) return p;
    changed = true;
    return { ...p, x: item.x, y: item.y, w: item.w, h: item.h };
  });
  return changed ? merged : prev;
}

// ─── loaders ──────────────────────────────────────────────────────────────────

function loadWorkspaceMode(): WorkspaceMode {
  if (typeof window === "undefined") return DEFAULT_WORKSPACE_MODE;
  const stored = window.localStorage.getItem(SETTINGS_STORAGE_KEY);
  return stored && WORKSPACE_PRESETS[stored as WorkspaceMode]
    ? (stored as WorkspaceMode)
    : DEFAULT_WORKSPACE_MODE;
}

function loadPanels(cols: number): Panel[] {
  if (typeof window === "undefined") return buildDefaultPanels(cols);
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored) return buildDefaultPanels(cols);
  try {
    return normalizePanels(JSON.parse(stored), cols);
  } catch {
    return buildDefaultPanels(cols);
  }
}

function loadSavedWorkspaces(): SavedWorkspace[] {
  if (typeof window === "undefined") return [];
  const stored = window.localStorage.getItem(SAVED_WORKSPACES_STORAGE_KEY);
  if (!stored) return [];
  try {
    return normalizeSavedWorkspaces(JSON.parse(stored));
  } catch {
    return [];
  }
}

function loadActiveWorkspaceId(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACTIVE_WORKSPACE_STORAGE_KEY);
}

// ─── hook ─────────────────────────────────────────────────────────────────────

export function useWorkspace() {
  const initialModeRef = useRef(loadWorkspaceMode());
  const nextIdRef = useRef(1);

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>(initialModeRef.current);
  const [panels, setPanels] = useState<Panel[]>(() =>
    loadPanels(WORKSPACE_PRESETS[initialModeRef.current].cols),
  );
  const [savedWorkspaces, setSavedWorkspaces] = useState<SavedWorkspace[]>(loadSavedWorkspaces);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(loadActiveWorkspaceId);

  const workspaceConfig = WORKSPACE_PRESETS[workspaceMode];

  useEffect(() => {
    nextIdRef.current = Math.max(nextIdRef.current, getNextPanelIdSeed(panels));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(panels));
  }, [panels]);

  useEffect(() => {
    window.localStorage.setItem(SETTINGS_STORAGE_KEY, workspaceMode);
  }, [workspaceMode]);

  useEffect(() => {
    window.localStorage.setItem(SAVED_WORKSPACES_STORAGE_KEY, JSON.stringify(savedWorkspaces));
  }, [savedWorkspaces]);

  useEffect(() => {
    if (!activeWorkspaceId) {
      window.localStorage.removeItem(ACTIVE_WORKSPACE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_WORKSPACE_STORAGE_KEY, activeWorkspaceId);
    }
  }, [activeWorkspaceId]);

  useEffect(() => {
    if (activeWorkspaceId && !savedWorkspaces.some((ws) => ws.id === activeWorkspaceId)) {
      setActiveWorkspaceId(null);
    }
  }, [activeWorkspaceId, savedWorkspaces]);

  const activeWorkspace = useMemo(
    () => savedWorkspaces.find((ws) => ws.id === activeWorkspaceId) ?? null,
    [activeWorkspaceId, savedWorkspaces],
  );

  const isWorkspaceDirty = useMemo(() => {
    if (!activeWorkspace) return false;
    return (
      snapshotSignature(workspaceMode, panels) !==
      snapshotSignature(activeWorkspace.workspaceMode, activeWorkspace.panels)
    );
  }, [activeWorkspace, workspaceMode, panels]);

  const gridLayout = useMemo(
    () =>
      panels.map((p) => ({
        i: p.id,
        x: p.x,
        y: p.y,
        w: p.w,
        h: p.h,
        minW: getPanelDimensions(p.type, workspaceConfig.cols).minW,
        minH: getPanelDimensions(p.type, workspaceConfig.cols).minH,
        static: p.locked,
      })),
    [panels, workspaceConfig.cols],
  );

  const lockedCount = panels.filter((p) => p.locked).length;

  const addPanel = useCallback(
    (type: WidgetType) => {
      setPanels((prev) => {
        const d = getPanelDimensions(type, workspaceConfig.cols);
        return [
          ...prev,
          createPanel(`${type}-${nextIdRef.current++}`, type, workspaceConfig.cols, {
            x: 0,
            y: getLayoutBottom(prev),
            w: d.w,
            h: d.h,
          }),
        ];
      });
    },
    [workspaceConfig.cols],
  );

  const saveWorkspace = useCallback(
    (name: string) => {
      if (!name.trim()) return;
      const existing =
        (activeWorkspaceId
          ? savedWorkspaces.find((ws) => ws.id === activeWorkspaceId)
          : null) ??
        savedWorkspaces.find((ws) => ws.name.toLowerCase() === name.toLowerCase());
      const next: SavedWorkspace = {
        id: existing?.id ?? `workspace-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: name.trim(),
        workspaceMode,
        panels: clonePanels(panels),
        updatedAt: new Date().toISOString(),
      };
      setSavedWorkspaces((prev) =>
        normalizeSavedWorkspaces([next, ...prev.filter((ws) => ws.id !== next.id)]),
      );
      setActiveWorkspaceId(next.id);
    },
    [activeWorkspaceId, savedWorkspaces, workspaceMode, panels],
  );

  const loadWorkspaceSnapshot = useCallback((ws: SavedWorkspace) => {
    const mode = WORKSPACE_PRESETS[ws.workspaceMode] ? ws.workspaceMode : DEFAULT_WORKSPACE_MODE;
    setWorkspaceMode(mode);
    setPanels(normalizePanels(clonePanels(ws.panels), WORKSPACE_PRESETS[mode].cols));
    setActiveWorkspaceId(ws.id);
  }, []);

  const deleteWorkspace = useCallback(
    (id: string) => {
      setSavedWorkspaces((prev) => prev.filter((ws) => ws.id !== id));
      if (activeWorkspaceId === id) setActiveWorkspaceId(null);
    },
    [activeWorkspaceId],
  );

  const toggleLock = useCallback((id: string) => {
    setPanels((prev) => prev.map((p) => (p.id === id ? { ...p, locked: !p.locked } : p)));
  }, []);

  const duplicatePanel = useCallback(
    (id: string) => {
      setPanels((prev) => {
        const target = prev.find((p) => p.id === id);
        if (!target) return prev;
        return [
          ...prev,
          createPanel(`${target.type}-${nextIdRef.current++}`, target.type, workspaceConfig.cols, {
            x: 0,
            y: getLayoutBottom(prev),
            w: target.w,
            h: target.h,
            locked: false,
          }),
        ];
      });
    },
    [workspaceConfig.cols],
  );

  const removePanel = useCallback((id: string) => {
    setPanels((prev) => (prev.length > 1 ? prev.filter((p) => p.id !== id) : prev));
  }, []);

  const syncPanelLayout = useCallback(
    (next: { i: string; x: number; y: number; w: number; h: number }[]) => {
      setPanels((prev) => mergeLayoutIntoPanels(prev, next));
    },
    [],
  );

  const changeWorkspaceMode = useCallback(
    (nextMode: WorkspaceMode) => {
      if (nextMode === workspaceMode) return;
      setPanels((prev) =>
        scalePanelsToColumns(prev, workspaceConfig.cols, WORKSPACE_PRESETS[nextMode].cols),
      );
      setWorkspaceMode(nextMode);
    },
    [workspaceMode, workspaceConfig.cols],
  );

  return {
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
  };
}
