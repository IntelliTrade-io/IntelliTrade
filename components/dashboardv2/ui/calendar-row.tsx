"use client";

import React from "react";
import { cn } from "@/lib/utils";
import { impactMeta } from "../constants";
import type { CalendarEvent } from "../types";
import { FlagIcon } from "./flag-icon";

interface CalendarRowProps {
  event: CalendarEvent;
  onOpen: (event: CalendarEvent) => void;
  now?: number;
}

function formatCountdown(isoDateTime: string, now: number): { text: string; state: "future" | "soon" | "imminent" | "now" } {
  const diff = new Date(isoDateTime).getTime() - now;
  if (diff <= 0) return { text: "now", state: "now" };
  const totalSeconds = Math.floor(diff / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (days > 0) return { text: `${days}d ${hours}h`, state: "future" };
  if (hours > 0) return { text: `${hours}h ${minutes}m`, state: "future" };
  if (minutes >= 5) return { text: `${minutes}m`, state: "future" };
  if (minutes > 0) return { text: `${minutes}m ${seconds}s`, state: "soon" };
  return { text: `${seconds}s`, state: "imminent" };
}

export function CalendarRow({ event, onOpen, now }: CalendarRowProps) {
  const meta = impactMeta[event.impact];
  const countdown = now !== undefined ? formatCountdown(event.isoDateTime, now) : null;

  return (
    <button
      onClick={() => onOpen(event)}
      className="group relative w-full overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.9),rgba(11,11,16,0.92))] px-3 py-3 text-left transition-all hover:border-white/18"
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02),transparent_40%,transparent_65%,rgba(255,255,255,0.015))]" />
      <div className="relative z-10 flex items-center gap-3">
        {/* Flag */}
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
          <FlagIcon code={event.flagCode} size={20} />
        </div>

        {/* Main content */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-semibold tracking-[0.12em] text-white/84">
              {event.currency}
            </span>
            <span className="text-[10px] uppercase tracking-[0.14em] text-white/30">
              {event.region}
            </span>
            <span className={cn("rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em]", meta.badge)}>
              {meta.label}
            </span>
          </div>
          <div className="truncate text-sm font-semibold text-white leading-tight">
            {event.title}
          </div>
        </div>

        {/* Time + countdown */}
        <div className="shrink-0 text-right">
          <div className="text-[10px] uppercase tracking-[0.14em] text-white/32">
            {event.dateLabel}
          </div>
          <div className="text-base font-semibold leading-tight text-white">
            {event.timeLabel}
          </div>
          {countdown && (
            <div className={cn(
              "text-[10px] font-medium tabular-nums",
              countdown.state === "now" && "animate-pulse text-red-400",
              countdown.state === "imminent" && "text-amber-400",
              countdown.state === "soon" && "text-amber-300/80",
              countdown.state === "future" && "text-white/38",
            )}>
              {countdown.text}
            </div>
          )}
        </div>
      </div>
    </button>
  );
}
