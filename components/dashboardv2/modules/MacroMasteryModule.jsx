"use client";

import React from "react";
import { ArrowUpRight, BookOpen, GraduationCap, Sparkles } from "lucide-react";
import MacroMasteryReader from "../generated/MacroMasteryReader.tsx";

const COURSE_TRACKS = [
  { label: "Macro mindset", chapters: "1-3", note: "Cycle framing, expectations, and analyst habits." },
  { label: "Economic engine", chapters: "4-6", note: "GDP, output gaps, labor, and productivity." },
  { label: "Inflation + policy", chapters: "7-10", note: "Money, inflation regimes, central banks, and rates." },
  { label: "Market translation", chapters: "11-15", note: "FX, indices, bonds, commodities, and narrative expression." },
  { label: "Trader workflow", chapters: "16-20", note: "Scenario building, journaling, and repeatable macro process." },
];

const COURSE_STATS = [
  { label: "Chapters", value: "20" },
  { label: "Tracks", value: "5" },
  { label: "Access", value: "Subscriber" },
];

export function MacroMasteryWorkspaceModule({ compact = false }) {
  return (
    <div className="relative flex h-full min-h-0 flex-col gap-4 overflow-auto">
      <section className="relative overflow-hidden rounded-[30px] border border-white/20 bg-white/5 p-5 shadow-[0_32px_80px_rgba(0,0,0,0.72)] backdrop-blur-2xl">
        <div className="absolute inset-x-0 top-0 h-1 bg-white/0">
          <div className="h-full w-[46%] rounded-full bg-gradient-to-r from-[#1FE4FF] via-[#7F5CFF] to-[#1FE4FF]" />
        </div>
        <div className="pointer-events-none absolute -left-10 bottom-[-72px] h-40 w-40 rounded-full bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.32),transparent_72%)] blur-[28px]" />
        <div className="pointer-events-none absolute right-[-36px] top-[-24px] h-32 w-32 rounded-full bg-[radial-gradient(circle_at_center,rgba(31,228,255,0.22),transparent_75%)] blur-[26px]" />

        <div className="relative flex flex-wrap items-start justify-between gap-4">
          <div className="max-w-lg">
            <div className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-white/5 px-4 py-1 text-[11px] font-medium uppercase tracking-[0.22em] text-teal-200/90">
              <GraduationCap className="h-3.5 w-3.5" />
              Macro course
            </div>
            <h3 className="mt-4 text-xl font-semibold tracking-tight text-slate-50">Macro Mastery</h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-300">
              Interactive macro reader for cycle framing, policy interpretation, and trade translation.
            </p>
          </div>

          <div className="grid min-w-[220px] flex-1 gap-2 sm:grid-cols-3">
            {COURSE_STATS.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-white/14 bg-black/20 px-3 py-3 text-left">
                <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/38">{stat.label}</div>
                <div className="mt-2 text-sm font-medium text-white">{stat.value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className={compact ? "grid gap-3" : "grid gap-4 md:grid-cols-2"}>
        {COURSE_TRACKS.map((track) => (
          <article
            key={track.label}
            className="rounded-[26px] border border-white/20 bg-white/5 p-4 shadow-[0_20px_48px_rgba(0,0,0,0.42)] backdrop-blur-xl"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="inline-flex items-center rounded-full bg-[linear-gradient(90deg,#1FE4FF,rgba(31,228,255,0.16))] px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.24em] text-slate-950">
                  Chapters {track.chapters}
                </div>
                <div className="mt-3 text-base font-medium text-slate-50">{track.label}</div>
              </div>
              <div className="flex h-10 w-10 items-center justify-center rounded-full border border-teal-400/30 bg-white/5 text-teal-200/90">
                <BookOpen className="h-4.5 w-4.5" />
              </div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">{track.note}</p>
          </article>
        ))}
      </section>

      <section className="grid gap-3 lg:grid-cols-[1fr_auto]">
        <div className="rounded-[26px] border border-white/18 bg-black/24 px-4 py-4 backdrop-blur-xl">
          <div className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-teal-200/86">
            <Sparkles className="h-3.5 w-3.5" />
            Reader surface
          </div>
          <p className="mt-2 text-sm leading-relaxed text-slate-300">
            Open the standalone route for the full chapter reader, sticky section navigation, and progress-tracked long-form layout.
          </p>
        </div>

        <div className="flex items-center justify-between rounded-[26px] border border-white/18 bg-white/[0.04] px-4 py-4 text-sm text-slate-200 lg:min-w-[220px]">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/36">Launch module</div>
            <div className="mt-2 font-medium text-white">Standalone reader</div>
          </div>
          <div className="flex h-10 w-10 items-center justify-center rounded-full border border-white/14 bg-white/5 text-white/74">
            <ArrowUpRight className="h-4.5 w-4.5" />
          </div>
        </div>
      </section>
    </div>
  );
}

export default function MacroMasteryPage() {
  return <MacroMasteryReader />;
}