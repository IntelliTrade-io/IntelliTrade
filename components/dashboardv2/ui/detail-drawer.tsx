"use client";

import { Clock3, ExternalLink, FileText, Globe2, Info, Radar, X } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
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

function DrawerContent({ event, onClose }: { event: CalendarEvent; onClose: () => void }) {
  const impact = impactMeta[event.impact];
  const sourceUrl = event.extras.source_url_standardized;

  return (
    <motion.div
      className="fixed inset-0 z-50"
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
        className="absolute right-0 top-0 h-full w-full max-w-[520px] overflow-y-auto border-l border-white/10 bg-[linear-gradient(180deg,rgba(12,12,16,0.98),rgba(7,7,10,0.98))] shadow-2xl"
      >
        <div className="relative min-h-full p-5 sm:p-6">
          <ShellTexture />
          <div className="relative z-10">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.05]">
                  <FlagIcon code={event.flagCode} size={34} />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Tag>{event.currency}</Tag>
                    <span
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-[11px] uppercase tracking-[0.16em]",
                        impact.badge,
                      )}
                    >
                      {impact.label} impact
                    </span>
                  </div>
                  <h3 className="mt-3 text-2xl font-semibold leading-tight text-white">
                    {event.title}
                  </h3>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-white/48">
                    <span>{event.region}</span>
                    <span>{event.agency}</span>
                    <span>{event.extras.category}</span>
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

            <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-relaxed text-white/74">
              {event.extras.event_description}
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <MetaCard
                label="Release time"
                value={`${event.extras.release_time_local} local`}
                icon={Clock3}
              />
              <MetaCard label="Timezone" value={event.extras.event_local_tz} icon={Globe2} />
              <MetaCard label="Category" value={event.extras.category} icon={Info} />
              <MetaCard label="Confidence" value={event.extras.time_confidence} icon={FileText} />
            </div>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/34">
                <Radar className="h-3.5 w-3.5" />
                Market relevance
              </div>
              <div className="flex flex-wrap gap-2">
                {event.extras.pair_relevance.primary_fx_pairs.map((pair) => (
                  <Tag key={pair}>{pair}</Tag>
                ))}
                {event.extras.pair_relevance.related_assets.map((asset) => (
                  <Tag key={asset}>{asset}</Tag>
                ))}
              </div>
            </div>

            <div className="mt-5 rounded-[22px] border border-white/10 bg-white/[0.03] p-4">
              <div className="mb-3 text-[11px] uppercase tracking-[0.18em] text-white/34">Source</div>
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
          </div>
        </div>
      </motion.aside>
    </motion.div>
  );
}

export function DetailDrawer({ event, onClose }: DetailDrawerProps) {
  return (
    <AnimatePresence>
      {event ? <DrawerContent event={event} onClose={onClose} /> : null}
    </AnimatePresence>
  );
}
