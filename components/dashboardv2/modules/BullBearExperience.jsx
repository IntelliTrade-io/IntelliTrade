"use client";

import React from "react";
import { Gamepad2, Trophy, Zap } from "lucide-react";
import ModulePageShell from "./ModulePageShell.jsx";
import BullBearGame from "../generated/BullBearGame.jsx";

function SmallNote({ label, value }) {
  return (
    <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-3">
      <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">{label}</div>
      <div className="mt-1 text-sm font-medium text-white">{value}</div>
    </div>
  );
}

export function BullBearSurface({ compact = false }) {
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
      {!compact ? (
        <div className="grid gap-4 sm:grid-cols-3">
          <SmallNote label="Start" value="Tap, Space, or Up" />
          <SmallNote label="Loop" value="Local best score persists" />
          <SmallNote label="Surface" value="Exact game module" />
        </div>
      ) : null}

      <div className="rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(245,245,247,0.98))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.26)]">
        <BullBearGame />
      </div>
    </div>
  );
}

export default function BullBearPage() {
  return (
    <ModulePageShell
      eyebrow="IntelliTrade interactive"
      title="Bull vs Bear: An IntelliTrade Original Mini Game"
      description="The original canvas game is now part of the local runner and can be added as a live panel inside the custom workspace."
      actions={
        <>
          <div className="inline-flex items-center rounded-full border border-white/10 bg-white/[0.04] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/60">
            Playable module
          </div>
          <div className="inline-flex items-center rounded-full border border-violet-400/18 bg-violet-500/[0.08] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-white/86">
            Widget ready
          </div>
        </>
      }
      maxWidth="max-w-[1720px]"
    >
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <BullBearSurface />

        <div className="grid gap-4">
          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72">
                <Gamepad2 className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Controls</div>
                <div className="mt-1 text-sm font-medium text-white">Tap, Space, or Up Arrow</div>
              </div>
            </div>
            <p className="mt-4 text-sm leading-relaxed text-white/48">
              The module keeps the original gameplay logic and best-score persistence while fitting into the IntelliTrade runner.
            </p>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72">
                <Trophy className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Session target</div>
                <div className="mt-1 text-sm font-medium text-white">Survive long enough to manage flyers</div>
              </div>
            </div>
          </div>

          <div className="rounded-[30px] border border-white/10 bg-white/[0.03] p-5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/72">
                <Zap className="h-4 w-4" />
              </div>
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Builder use</div>
                <div className="mt-1 text-sm font-medium text-white">Can be pinned as a live workspace tile</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ModulePageShell>
  );
}