"use client";

import React from "react";
import { Copy, GripVertical, Lock, LockOpen, X } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// IconAction
// ---------------------------------------------------------------------------

interface IconActionProps {
  label: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function IconAction({
  label,
  onClick,
  active = false,
  className = "",
  children,
}: IconActionProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex h-10 w-10 items-center justify-center rounded-full border transition-all",
        active
          ? "border-violet-400/20 bg-violet-500/[0.10] text-white"
          : "border-white/10 bg-white/[0.04] text-white/60 hover:border-white/18 hover:bg-white/[0.06] hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// DragHandle
// ---------------------------------------------------------------------------

interface DragHandleProps {
  locked?: boolean;
}

export function DragHandle({ locked = false }: DragHandleProps) {
  return (
    <div
      className={cn(
        "widget-drag-handle inline-flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/56 transition-all",
        locked
          ? "cursor-not-allowed opacity-45"
          : "cursor-grab hover:border-white/18 hover:text-white active:cursor-grabbing",
      )}
      title={locked ? "Panel locked" : "Drag panel"}
      aria-hidden="true"
    >
      <GripVertical className="h-4 w-4" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// PanelActions
// ---------------------------------------------------------------------------

interface PanelActionsProps {
  locked: boolean;
  onToggleLock: () => void;
  onRemove: () => void;
  onDuplicate?: () => void;
}

export function PanelActions({
  locked,
  onToggleLock,
  onRemove,
  onDuplicate,
}: PanelActionsProps) {
  return (
    <>
      <DragHandle locked={locked} />
      {onDuplicate ? (
        <IconAction label="Duplicate panel" onClick={onDuplicate}>
          <Copy className="h-4 w-4" />
        </IconAction>
      ) : null}
      <IconAction
        label={locked ? "Unlock panel" : "Lock panel"}
        onClick={onToggleLock}
        active={locked}
      >
        {locked ? <Lock className="h-4 w-4" /> : <LockOpen className="h-4 w-4" />}
      </IconAction>
      <IconAction label="Remove panel" onClick={onRemove}>
        <X className="h-4 w-4" />
      </IconAction>
    </>
  );
}
