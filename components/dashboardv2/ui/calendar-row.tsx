"use client";

import React from "react";
import { ArrowRight } from "lucide-react";
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
  if (days > 0) return { text: `in ${days}d ${hours}h`, state: "future" };
  if (hours > 0) return { text: `in ${hours}h ${minutes}m`, state: "future" };
  if (minutes >= 5) return { text: `in ${minutes}m ${seconds}s`, state: "future" };
  if (minutes > 0) return { text: `in ${minutes}m ${seconds}s`, state: "soon" };
  return { text: `in ${seconds}s`, state: "imminent" };
}

export function CalendarRow({ event, onOpen, now }: CalendarRowProps) {
  const meta = impactMeta[event.impact];
  const countdown = now !== undefined ? formatCountdown(event.isoDateTime, now) : null;

  return (
    <button
      onClick={() => onOpen(event)}
      className="group relative w-full overflow-hidden rounded-[22px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.9),rgba(11,11,16,0.92))] px-4 py-4 text-left transition-all hover:border-white/18"
    >
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(255,255,255,0.02),transparent_40%,transparent_65%,rgba(255,255,255,0.015))]" />
      <div className="relative z-10 grid gap-4 xl:grid-cols-[minmax(0,1fr)_140px_40px] xl:items-center">
        <div className="flex min-w-0 items-center gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]">
            <FlagIcon code={event.flagCode} size={28} />
          </div>
          <div className="min-w-0">
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm font-semibold tracking-[0.14em] text-white/84">
                {event.currency}
              </span>
              <span className="text-xs uppercase tracking-[0.16em] text-white/30">
                {event.region}
              </span>
              <span
                className={cn(
                  "rounded-full border px-2 py-1 text-[10px] uppercase tracking-[0.18em]",
                  meta.badge,
                )}
              >
                {meta.label}
              </span>
            </div>
            <div className="truncate pr-2 text-base font-semibold text-white">
              {event.title}
            </div>
          </div>
        </div>
        <div className="text-left xl:text-right">
          <div className="text-xs uppercase tracking-[0.16em] text-white/32">
            {event.dateLabel}
          </div>
          <div className="mt-1 text-xl font-semibold leading-none text-white">
            {event.timeLabel}
          </div>
          {countdown && (
            <div
              className={cn(
                "mt-1.5 text-[11px] font-medium tabular-nums",
                countdown.state === "now" && "animate-pulse text-red-400",
                countdown.state === "imminent" && "text-amber-400",
                countdown.state === "soon" && "text-amber-300/80",
                countdown.state === "future" && "text-white/38",
              )}
            >
              {countdown.text}
            </div>
          )}
        </div>
        <div className="hidden h-10 w-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/60 transition-all group-hover:border-violet-400/18 group-hover:bg-white/[0.06] group-hover:text-white xl:flex">
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </div>
      </div>
    </button>
  );
}
