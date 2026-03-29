"use client";

import { useState } from "react";
import { Check, ChevronDown, FolderOpen, Save, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { WIDGET_CATALOG, WORKSPACE_PRESETS } from "../constants";
import { formatWorkspaceTimestamp } from "../hooks/use-workspace";
import type { Panel, SavedWorkspace, WidgetType, WorkspaceMode, WorkspacePreset } from "../types";

interface WorkspaceHeaderProps {
  panels: Panel[];
  workspaceConfig: WorkspacePreset;
  workspaceMode: WorkspaceMode;
  lockedCount: number;
  savedWorkspaces: SavedWorkspace[];
  activeWorkspaceId: string | null;
  activeWorkspace: SavedWorkspace | null;
  isWorkspaceDirty: boolean;
  onSaveWorkspace: (name: string) => void;
  onLoadWorkspace: (workspace: SavedWorkspace) => void;
  onDeleteWorkspace: (id: string) => void;
  onChangeMode: (mode: WorkspaceMode) => void;
  onAddPanel: (type: WidgetType) => void;
}

export function WorkspaceHeader({
  panels,
  workspaceConfig,
  workspaceMode,
  lockedCount,
  savedWorkspaces,
  activeWorkspaceId,
  activeWorkspace,
  isWorkspaceDirty,
  onSaveWorkspace,
  onLoadWorkspace,
  onDeleteWorkspace,
  onChangeMode,
  onAddPanel,
}: WorkspaceHeaderProps) {
  const [showWorkspaceMenu, setShowWorkspaceMenu] = useState(false);
  const [showAddMenu, setShowAddMenu] = useState(false);
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");

  const handleSave = () => {
    onSaveWorkspace(workspaceNameDraft);
    setShowWorkspaceMenu(false);
  };

  const toggleWorkspaceMenu = () => {
    setShowAddMenu(false);
    setShowWorkspaceMenu((v) => {
      if (!v) setWorkspaceNameDraft(activeWorkspace?.name ?? "");
      return !v;
    });
  };

  return (
    <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      {/* Title block */}
      <div className="max-w-3xl">
        <div className="inline-flex items-center rounded-full border border-white/12 bg-white/[0.03] px-4 py-2 text-[11px] font-medium uppercase tracking-[0.28em] text-white/72">
          IntelliTrade workspace
        </div>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Custom dashboard
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-white/46 sm:text-base">
          Arrange, resize, and lock premium modules inside a snapped IntelliTrade workspace.
        </p>
      </div>

      {/* Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        {/* Stats */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Panels</div>
            <div className="mt-1 text-lg font-semibold text-white">{panels.length}</div>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur-xl">
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/35">Workspace</div>
            <div className="mt-1 text-lg font-semibold text-white">
              {workspaceConfig.label} · {workspaceConfig.cols} cols
            </div>
            <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/34">
              {lockedCount ? `${lockedCount} locked` : "Snapped grid"}
            </div>
          </div>
        </div>

        {/* Workspace library */}
        <div className="relative">
          <button
            type="button"
            onClick={toggleWorkspaceMenu}
            className="inline-flex h-12 items-center gap-3 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-white transition-all hover:border-white/18"
          >
            <FolderOpen className="h-4 w-4 text-white/70" />
            <span className="max-w-[160px] truncate font-medium">
              {activeWorkspace ? activeWorkspace.name : "Current draft"}
            </span>
            {isWorkspaceDirty ? (
              <span className="rounded-full border border-amber-300/18 bg-amber-400/10 px-2 py-1 text-[10px] uppercase tracking-[0.16em] text-amber-100">
                Unsaved
              </span>
            ) : null}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-white/44 transition-transform",
                showWorkspaceMenu ? "rotate-180" : "",
              )}
            />
          </button>

          {showWorkspaceMenu ? (
            <div className="absolute right-0 z-30 mt-3 w-[360px] overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0b10]/96 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <div className="px-2 pt-1">
                <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">
                  Workspace library
                </div>
                <div className="mt-1 text-sm leading-relaxed text-white/46">
                  Save multiple dashboard setups for analysis, execution, or review.
                </div>
              </div>

              <div className="mt-3 rounded-[20px] border border-white/10 bg-white/[0.03] p-3">
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">
                  Save current layout
                </div>
                <input
                  value={workspaceNameDraft}
                  onChange={(e) => setWorkspaceNameDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSave()}
                  placeholder="Workspace name"
                  className="mt-3 h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 text-white outline-none transition-all placeholder:text-white/28 focus:border-violet-400/22 focus:bg-white/[0.05]"
                />
                <div className="mt-3 flex items-center justify-between gap-3">
                  <div className="text-xs uppercase tracking-[0.18em] text-white/32">
                    {activeWorkspace
                      ? isWorkspaceDirty
                        ? "Update active workspace"
                        : "Save changes or rename"
                      : "Create a named snapshot"}
                  </div>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={!workspaceNameDraft.trim()}
                    className="inline-flex h-10 items-center gap-2 rounded-full border border-violet-400/18 bg-violet-500/[0.10] px-4 text-sm text-white transition-all hover:border-violet-300/26 hover:bg-violet-500/[0.16] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Save className="h-4 w-4" />
                    Save
                  </button>
                </div>
              </div>

              <div className="mb-2 mt-4 px-2 text-[11px] uppercase tracking-[0.22em] text-white/34">
                Saved workspaces
              </div>
              <div className="grid max-h-[320px] gap-2 overflow-y-auto pr-1">
                {savedWorkspaces.length ? (
                  savedWorkspaces.map((ws) => {
                    const isActive = ws.id === activeWorkspaceId;
                    return (
                      <div key={ws.id} className="flex items-stretch gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            onLoadWorkspace(ws);
                            setShowWorkspaceMenu(false);
                          }}
                          className={cn(
                            "flex min-w-0 flex-1 items-start justify-between gap-3 rounded-[20px] border px-4 py-3 text-left transition-all",
                            isActive
                              ? "border-violet-400/18 bg-violet-500/[0.08]"
                              : "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05]",
                          )}
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <div className="truncate text-sm font-medium text-white">
                                {ws.name}
                              </div>
                              {isActive ? (
                                <Check className="h-4 w-4 shrink-0 text-violet-200" />
                              ) : null}
                            </div>
                            <div className="mt-1 text-sm leading-relaxed text-white/46">
                              {WORKSPACE_PRESETS[ws.workspaceMode].label} · {ws.panels.length}{" "}
                              panels
                            </div>
                            <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-white/30">
                              Saved {formatWorkspaceTimestamp(ws.updatedAt)}
                            </div>
                          </div>
                        </button>
                        <button
                          type="button"
                          aria-label={`Delete ${ws.name}`}
                          onClick={() => onDeleteWorkspace(ws.id)}
                          className="inline-flex h-auto w-11 items-center justify-center rounded-[18px] border border-white/10 bg-white/[0.03] text-white/50 transition-all hover:border-white/18 hover:text-white"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <div className="rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-4 text-sm leading-relaxed text-white/46">
                    No saved workspaces yet. Save the current dashboard to start building your
                    library.
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* Mode switcher */}
        <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] p-1 backdrop-blur-xl">
          {(Object.entries(WORKSPACE_PRESETS) as [WorkspaceMode, WorkspacePreset][]).map(
            ([mode, preset]) => (
              <button
                key={mode}
                type="button"
                onClick={() => onChangeMode(mode)}
                className={cn(
                  "inline-flex h-10 items-center rounded-full px-4 text-sm transition-all",
                  workspaceMode === mode
                    ? "border border-violet-400/18 bg-violet-500/[0.10] text-white"
                    : "text-white/58 hover:text-white",
                )}
              >
                {preset.shortLabel}
              </button>
            ),
          )}
        </div>

        {/* Add widget */}
        <div className="relative">
          <button
            onClick={() => {
              setShowWorkspaceMenu(false);
              setShowAddMenu((v) => !v);
            }}
            className="inline-flex h-12 items-center gap-2 rounded-full border border-violet-400/18 bg-violet-500/[0.12] px-5 text-sm font-medium text-white transition-all hover:border-violet-300/26 hover:bg-violet-500/[0.16]"
          >
            <span className="text-lg leading-none">+</span>
            Add widget
          </button>

          {showAddMenu ? (
            <div className="absolute right-0 z-30 mt-3 w-[320px] overflow-hidden rounded-[24px] border border-white/10 bg-[#0b0b10]/96 p-3 shadow-[0_30px_80px_rgba(0,0,0,0.45)] backdrop-blur-2xl">
              <div className="mb-2 px-2 pt-1 text-[11px] uppercase tracking-[0.22em] text-white/34">
                Widget library
              </div>
              <div className="grid gap-2">
                {(Object.entries(WIDGET_CATALOG) as [WidgetType, (typeof WIDGET_CATALOG)[WidgetType]][]).map(
                  ([type, item]) => {
                    const Icon = item.icon;
                    return (
                      <button
                        key={type}
                        onClick={() => {
                          onAddPanel(type);
                          setShowAddMenu(false);
                        }}
                        className="flex items-start gap-3 rounded-[20px] border border-white/10 bg-white/[0.03] px-4 py-3 text-left transition-all hover:border-white/18 hover:bg-white/[0.05]"
                      >
                        <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/76">
                          <Icon className="h-4 w-4" />
                        </div>
                        <div>
                          <div className="text-sm font-medium text-white">{item.label}</div>
                          <div className="mt-1 text-sm leading-relaxed text-white/46">
                            {item.description}
                          </div>
                        </div>
                      </button>
                    );
                  },
                )}
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
