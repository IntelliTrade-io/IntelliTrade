import React from "react";
import { Clock3, Waves } from "lucide-react";
import { supportResistanceCopy } from "./copy";
import { buildZoneDetails, formatReactionRange, formatTypicalR } from "./model";
import EducationalTooltip from "./EducationalTooltip";
import OpportunityGradeBadge from "./OpportunityGradeBadge";
import StaticStrengthMeter from "./StaticStrengthMeter";
import type { SupportResistanceZone } from "./types";

interface ZoneDetailsPanelProps {
  zone: SupportResistanceZone | null;
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-1.5">
      <div className="text-[9px] uppercase tracking-[0.16em] text-white/34">{label}</div>
      <div className="mt-0.5 text-[13px] font-medium text-white">{value}</div>
    </div>
  );
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function ZoneDetailsPanel({ zone }: ZoneDetailsPanelProps) {
  if (!zone) {
    return (
      <aside className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.96))] p-5 text-sm text-white/56">
        {supportResistanceCopy.emptyStates.noReclaim}
      </aside>
    );
  }

  const details = buildZoneDetails(zone);

  return (
    <aside className="rounded-[20px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.96))] p-3 shadow-[0_20px_50px_rgba(0,0,0,0.28)]">
      <div className="flex flex-wrap items-start justify-between gap-2 border-b border-white/8 pb-2.5">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Zone details</div>
          <h3 className="mt-1 text-base font-semibold text-white">{details.zoneLabel}</h3>
          <p className="mt-0.5 text-xs text-white/46">{details.educationalSummary}</p>
        </div>
        <OpportunityGradeBadge grade={details.dynamicGrade} />
      </div>

      <div className="mt-2 grid gap-2">
        <DetailItem label="Pair" value={details.pair} />
        <DetailItem label="Timeframe" value={details.timeframe} />
        <DetailItem label="Zone side" value="Support" />

        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-white/34">
            Static strength
            <EducationalTooltip label={supportResistanceCopy.tooltips.staticVsDynamic} align="right" />
          </div>
          <div className="mt-2">
            <StaticStrengthMeter strength={details.staticStrength} />
          </div>
          <div className="mt-1.5 text-xs text-white/52">{details.staticStrengthNote}</div>
        </div>

        <div className="rounded-xl border border-white/8 bg-white/[0.03] px-2.5 py-2">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-white/34">
            Dynamic opportunity grade
            <EducationalTooltip label={supportResistanceCopy.tooltips.aPlusMeaning} align="right" />
          </div>
          <div className="mt-2">
            <OpportunityGradeBadge grade={details.dynamicGrade} />
          </div>
          <div className="mt-1.5 text-xs text-white/52">{details.dynamicGradeNote}</div>
          <div className="mt-2 rounded-[10px] border border-white/8 bg-black/20 px-2.5 py-1.5 text-[11px] leading-relaxed text-white/48">
            Dynamic grade can upgrade or downgrade as price approaches the zone.
          </div>
        </div>

        <div className="pt-0.5 text-[9px] uppercase tracking-[0.18em] text-white/34">Context quality</div>
        <DetailItem label="Research reaction range" value={formatReactionRange(details.reactionRange)} />
        <DetailItem
          label="Typical minimum reaction"
          value={formatTypicalR(details.typicalMinimumR, details.typicalMaximumR)}
        />
        <DetailItem label="Session quality" value={details.sessionQuality} />
        <DetailItem label="Approach quality" value={details.approachQuality} />
        <DetailItem
          label="Close reclaim"
          value={
            details.closeReclaim
              ? `Confirmed${details.reclaimConfirmedAt ? ` · ${formatTimestamp(details.reclaimConfirmedAt)} UTC` : ""}`
              : "Not currently confirmed"
          }
        />
        <DetailItem label="Research buffer / first-reaction context" value={`${details.stopBufferAtr.toFixed(2)} ATR stop buffer / ~${details.firstReactionTargetR.toFixed(2)}R first reaction`} />
        <DetailItem label="Last updated" value={`${formatTimestamp(details.lastUpdated)} UTC`} />
      </div>

      <div className="mt-2 rounded-[14px] border border-amber-300/16 bg-amber-300/[0.06] px-3 py-2.5">
        <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-amber-100">
          <Clock3 className="h-3 w-3" />
          Educational disclaimer
        </div>
        <p className="mt-1 text-xs leading-relaxed text-amber-50/80">{supportResistanceCopy.disclaimer}</p>
      </div>

      {details.dynamicGrade === "a_plus" ? (
        <div className="mt-2 rounded-[14px] border border-[#F7E38C]/18 bg-[#F7E38C]/[0.06] px-3 py-2.5 text-xs leading-relaxed text-[#FFF1B1]">
          A+ = highest-quality short-term first-reaction setup, not a reversal call.
        </div>
      ) : null}

      {details.notes ? (
        <div className="mt-2 rounded-[14px] border border-white/8 bg-white/[0.03] px-3 py-2.5">
          <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.16em] text-white/34">
            <Waves className="h-3 w-3" />
            Research note
          </div>
          <p className="mt-1 text-xs leading-relaxed text-white/60">{details.notes}</p>
        </div>
      ) : null}
    </aside>
  );
}

export default ZoneDetailsPanel;
