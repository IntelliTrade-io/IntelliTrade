"use client";

import type { PublicEntryAssistCandidate, EntryAssistResponse } from "@/types/domain/entry-assist";
import type { CCY } from "@/lib/intradayFilters";

// Entry Assist is educational context, never a standalone instruction. States
// always carry a text label, never color alone.

const STATE_LABEL: Record<PublicEntryAssistCandidate["state"], string> = {
  watching: "Watching",
  confirmed: "Confirmed",
  fading: "Fading",
};

const STATE_CLASS: Record<PublicEntryAssistCandidate["state"], string> = {
  watching: "border-amber-400/20 bg-amber-500/10 text-amber-200",
  confirmed: "border-emerald-400/20 bg-emerald-500/10 text-emerald-200",
  fading: "border-white/12 bg-white/[0.05] text-white/60",
};

export function StateChip({ state }: { state: PublicEntryAssistCandidate["state"] }) {
  return (
    <span
      className={`inline-flex h-6 items-center rounded-full border px-2 text-[10px] font-bold uppercase tracking-wider ${STATE_CLASS[state]}`}
    >
      {STATE_LABEL[state]}
    </span>
  );
}

function CandidateCard({
  candidate,
  onFocusPair,
}: {
  candidate: PublicEntryAssistCandidate;
  onFocusPair: (base: CCY, quote: CCY) => void;
}) {
  return (
    <article className="rounded-[16px] border border-white/[0.08] bg-[linear-gradient(180deg,rgba(11,12,15,0.9),rgba(9,10,13,0.92))] px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-mono text-sm font-semibold text-white/90">{candidate.symbol}</div>
          <div className="mt-0.5 text-[10px] text-white/42">{candidate.sessionLabel}</div>
        </div>
        <StateChip state={candidate.state} />
      </div>
      <div className="mt-2 text-[11px] text-white/55">{candidate.reasons.join(" · ")}</div>
      <div className="mt-2">
        <button
          type="button"
          onClick={() => onFocusPair(candidate.baseCode as CCY, candidate.quoteCode as CCY)}
          className="inline-flex h-8 items-center rounded-full border border-white/10 bg-black/30 px-3 text-[11px] font-semibold text-white/60 transition-all hover:border-white/20 hover:text-white/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/60"
        >
          Focus pair
        </button>
      </div>
    </article>
  );
}

interface EntryAssistSectionProps {
  candidates: PublicEntryAssistCandidate[];
  dataStatus: EntryAssistResponse["dataStatus"] | null;
  error: boolean;
  loading: boolean;
  onFocusPair: (base: CCY, quote: CCY) => void;
}

export function EntryAssistSection({
  candidates,
  dataStatus,
  error,
  loading,
  onFocusPair,
}: EntryAssistSectionProps) {
  const shown = candidates.slice(0, 2);

  return (
    <section>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="text-sm font-semibold text-white">Entry Assist</div>
      </div>

      {loading ? (
        <div className="text-[11px] text-white/30">Loading Entry Assist...</div>
      ) : error ? (
        <div className="text-[11px] text-white/40">Entry Assist is unavailable right now.</div>
      ) : dataStatus === "stale" || dataStatus === "unavailable" ? (
        <div className="text-[11px] text-white/40">Waiting for fresh data.</div>
      ) : shown.length === 0 ? (
        <div className="text-[11px] text-white/40">No confirmed Entry Assist candidate right now.</div>
      ) : (
        <div className="space-y-2">
          {shown.map((c) => (
            <CandidateCard key={c.id} candidate={c} onFocusPair={onFocusPair} />
          ))}
        </div>
      )}

      <p className="mt-2 text-[10px] italic text-white/32">
        Entry Assist is context, not a standalone trade instruction.
      </p>
    </section>
  );
}
