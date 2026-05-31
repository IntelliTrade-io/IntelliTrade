"use client";

import { Clock3, ExternalLink, FileText, Globe2, Info, Mic, Radar, Shield, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { impactMeta } from "../constants";
import type { CalendarEvent } from "../types";
import { FlagIcon } from "./flag-icon";
import { ShellTexture } from "./widget-shell";
import { MetaCard, Tag } from "./primitives";

interface DetailDrawerProps {
  event: CalendarEvent | null;
  onClose: () => void;
}

function getUserTz(): string {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return "Europe/Amsterdam"; }
}

function formatLocalTime(isoUtc: string, tz: string): string {
  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit", minute: "2-digit", timeZone: tz, hour12: false,
    month: "short", day: "numeric",
  }).format(new Date(isoUtc));
}

function humanSourceReliability(val: string | null): string {
  const map: Record<string, string> = {
    official: "Official source",
    curated: "Curated official schedule",
    fallback: "Rule-based / fallback schedule",
    rules: "Rule-based schedule",
    lkg: "Last known good",
    estimated: "Estimated",
    scraper: "Web scraper",
  };
  return val ? (map[val] ?? val) : "Unknown";
}

function humanTimeConfidence(val: string | null): string {
  const map: Record<string, string> = {
    exact: "Exact scheduled time",
    tentative: "Tentative scheduled time",
    date_only: "Date known, time not confirmed",
    assumed: "Assumed scheduled time",
    estimated: "Estimated time",
    unknown: "Time unknown",
  };
  return val ? (map[val] ?? val) : "Unknown";
}

function humanScheduleConfidence(val: string | null): string {
  const map: Record<string, string> = {
    high: "High schedule confidence",
    medium_high: "Medium-high schedule confidence",
    medium: "Medium schedule confidence",
    medium_low: "Medium-low schedule confidence",
    low: "Low schedule confidence",
  };
  return val ? (map[val] ?? val) : "—";
}

function DrawerContent({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const impact = impactMeta[event.impact];
  const sourceUrl = event.sourceUrl ?? event.extras.source_url_standardized;
  const userTz = getUserTz();
  const userLocalTime = formatLocalTime(event.isoDateTime, userTz);
  const eventLocalTime = event.extras.event_local_tz && event.extras.event_local_tz !== userTz
    ? formatLocalTime(event.isoDateTime, event.extras.event_local_tz)
    : null;

  const allAssets = [
    ...(event.assetFocus ?? []),
    ...(event.extras.pair_relevance?.primary_fx_pairs ?? []),
    ...(event.extras.pair_relevance?.related_assets ?? []),
  ];
  const uniqueAssets = [...new Set(allAssets)];

  return (
    <motion.div
      className="fixed inset-0 z-[99999]"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <button className="absolute inset-0 bg-black/72 backdrop-blur-sm" onClick={onClose} />
      <motion.aside
        initial={{ x: "100%" }}
        animate={{ x: 0 }}
        exit={{ x: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 240 }}
        className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l border-white/10 bg-[linear-gradient(180deg,rgba(12,12,16,0.98),rgba(7,7,10,0.98))] shadow-2xl pt-16 sm:pt-0"
      >
        <div className="relative min-h-full p-5 sm:p-6">
          <ShellTexture />
          <div className="relative z-10">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                  <FlagIcon code={event.flagCode} size={34} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag>{event.currency}</Tag>
                    <span className={cn("rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]", impact.badge)}>
                      {impact.label} impact
                    </span>
                    {event.eventGroupTitle && (
                      <span className="rounded-full border border-violet-400/20 bg-violet-500/10 px-2.5 py-1 text-[11px] text-violet-300 uppercase tracking-[0.16em]">
                        PMI cluster
                      </span>
                    )}
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold leading-tight text-white">{event.title}</h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/48">
                    <span>{event.region}</span>
                    {event.agency && <span>{event.agency}</span>}
                    {event.extras.category && <span>{event.extras.category}</span>}
                  </div>
                </div>
              </div>
              <button
                onClick={onClose}
                className="flex h-11 w-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition-all hover:border-white/18 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Speaker section */}
            {event.extras.speaker_event && (
              <div className="mt-5 rounded-[22px] border border-violet-400/20 bg-violet-500/[0.06] p-4">
                <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-violet-300/70">
                  <Mic className="h-3.5 w-3.5" />
                  Speaker
                </div>
                <div className="grid gap-2 text-sm">
                  {event.extras.speaker_name && (
                    <div className="flex justify-between">
                      <span className="text-white/40 text-xs">Name</span>
                      <span className="text-white font-medium">{event.extras.speaker_name}</span>
                    </div>
                  )}
                  {event.extras.speaker_role && (
                    <div className="flex justify-between">
                      <span className="text-white/40 text-xs">Role</span>
                      <span className="text-white/80">{event.extras.speaker_role}</span>
                    </div>
                  )}
                  {event.extras.speaker_institution && (
                    <div className="flex justify-between">
                      <span className="text-white/40 text-xs">Institution</span>
                      <span className="text-white/80">{event.extras.speaker_institution}</span>
                    </div>
                  )}
                  {event.extras.policy_relevance && (
                    <div className="flex flex-col gap-1 mt-1">
                      <span className="text-white/40 text-xs">Policy relevance</span>
                      <span className="text-white/70 text-xs leading-relaxed">{event.extras.policy_relevance}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Description */}
            {event.extras.event_description && (
              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/74">
                {event.extras.event_description}
              </div>
            )}

            {/* Time & location */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetaCard label="Your local time" value={userLocalTime} icon={Clock3} />
              {eventLocalTime && (
                <MetaCard label={`${event.extras.event_local_tz} time`} value={eventLocalTime} icon={Globe2} />
              )}
              <MetaCard label="Timezone" value={event.extras.event_local_tz} icon={Globe2} />
              {event.extras.category && (
                <MetaCard label="Category" value={event.extras.category} icon={Info} />
              )}
            </div>

            {/* Source confidence */}
            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetaCard
                label="Source reliability"
                value={humanSourceReliability(event.sourceReliability)}
                icon={Shield}
              />
              <MetaCard
                label="Time confidence"
                value={humanTimeConfidence(event.extras.time_confidence || event.sourceReliability)}
                icon={FileText}
              />
              {event.scheduleConfidence && (
                <MetaCard
                  label="Schedule confidence"
                  value={humanScheduleConfidence(event.scheduleConfidence)}
                  icon={FileText}
                />
              )}
              {event.traderRelevanceScore != null && (
                <MetaCard
                  label="Trader relevance"
                  value={`${Math.round(event.traderRelevanceScore * 100)}%`}
                  icon={Radar}
                />
              )}
            </div>

            {/* Market relevance */}
            {uniqueAssets.length > 0 && (
              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/34">
                  <Radar className="h-3.5 w-3.5" />
                  Affected assets
                </div>
                <div className="flex flex-wrap gap-2">
                  {uniqueAssets.map((a) => <Tag key={a}>{a}</Tag>)}
                </div>
              </div>
            )}

            {/* Fallback / LKG metadata */}
            {(event.lkgUsed || event.curatedFallbackAgeDays != null || event.blsSelectedSourcePath) && (
              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/34">Schedule metadata</div>
                <div className="grid gap-2 text-xs text-white/56">
                  {event.lkgUsed && (
                    <div className="flex justify-between">
                      <span className="text-white/40">Source</span>
                      <span>Last-known-good cache</span>
                    </div>
                  )}
                  {event.curatedFallbackAgeDays != null && (
                    <div className="flex justify-between">
                      <span className="text-white/40">Fallback age</span>
                      <span>{event.curatedFallbackAgeDays}d (max {event.curatedFallbackMaxAgeDays}d)</span>
                    </div>
                  )}
                  {event.curatedFallbackReviewedAt && (
                    <div className="flex justify-between">
                      <span className="text-white/40">Schedule reviewed</span>
                      <span>{event.curatedFallbackReviewedAt.slice(0, 10)}</span>
                    </div>
                  )}
                  {event.blsSelectedSourcePath && (
                    <div className="flex justify-between">
                      <span className="text-white/40">BLS source</span>
                      <span className="text-right max-w-[60%] break-all">{event.blsSelectedSourcePath}</span>
                    </div>
                  )}
                  {event.postReleaseStatus && (
                    <div className="flex justify-between">
                      <span className="text-white/40">Release status</span>
                      <span>{event.postReleaseStatus}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Source link */}
            {sourceUrl && (
              <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
                <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/34">
                  Source{event.sourceName ? ` · ${event.sourceName}` : ""}
                </div>
                <div className="rounded-[18px] border border-white/10 bg-black/20 p-3 text-sm leading-relaxed text-white/56 break-all">
                  {sourceUrl}
                </div>
                <a
                  href={sourceUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-2.5 text-sm font-medium text-white transition-all hover:border-white/18 hover:bg-white/[0.08]"
                >
                  Open source
                  <ExternalLink className="h-4 w-4" />
                </a>
              </div>
            )}

          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}

export function DetailDrawer({ event, onClose }: DetailDrawerProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  if (!mounted) return null;

  return createPortal(
    <AnimatePresence>
      {event ? <DrawerContent event={event} onClose={onClose} /> : null}
    </AnimatePresence>,
    document.body,
  );
}
