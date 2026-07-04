import React, { useState } from "react";
import { Clock3, Radar, Shield, Target } from "lucide-react";
import { supportResistanceCopy } from "./copy";
import { buildScannerRows, compareZonesByPriority, formatReactionRange, selectFeaturedZone } from "./model";
import { supportResistanceAlphaScope, supportResistanceMockCandles, supportResistanceMockZones, supportResistanceResearchProfiles } from "./mockData";
import EducationalTooltip from "./EducationalTooltip";
import ResearchProfileCard from "./ResearchProfileCard";
import SupportResistanceScanner from "./SupportResistanceScanner";
import ZoneDetailsPanel from "./ZoneDetailsPanel";
import SupportResistanceLightweightChart from "./SupportResistanceLightweightChart";
import OpportunityGradeBadge from "./OpportunityGradeBadge";
import type { CandleData, ResearchTierProfile, SupportResistanceZone } from "./types";

interface SupportResistanceAlphaModuleProps {
  zones?: SupportResistanceZone[];
  profiles?: ResearchTierProfile[];
  candles?: CandleData[];
  compact?: boolean;
}

function StatCard({ label, value, note, icon: Icon }: { label: string; value: string; note?: string; icon: React.ComponentType<{ className?: string }> }) {
  return (
    <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-3.5 py-3">
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.2em] text-white/34">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-1.5 text-sm font-semibold text-white">{value}</div>
      {note ? <div className="mt-1 text-sm text-white/44">{note}</div> : null}
    </div>
  );
}

export function SupportResistanceAlphaModule({
  zones = supportResistanceMockZones,
  profiles = supportResistanceResearchProfiles,
  candles = supportResistanceMockCandles,
  compact = false,
}: SupportResistanceAlphaModuleProps) {
  const defaultZone = selectFeaturedZone(zones);
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(defaultZone?.id ?? null);
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? defaultZone ?? null;
  // ── CHART ZONE SELECTION RULE (approved) ──────────────────────────────────
  // Draw only the support shelves worth watching, grounded in the research
  // engine's own quality label (NOT invented heuristics):
  //   (a) medium or strong static_strength — the research scores most zones
  //       "weak" (thin / over-tested); those are noise, kept off the chart.
  //   (b) genuinely touched in view — a candle LOW dipped into the band (support
  //       tested from above), so bands hug real price, not float over dead space.
  //   (c) top CHART_ZONE_LIMIT by priority; scanner + details still list ALL zones.
  // TO REVERT to "draw all zones": set chartZones = zones (and remove this block).
  const CHART_ZONE_LIMIT = 5;
  const chartZones = (() => {
    const genuinelyTouched = (zone: (typeof zones)[number]) =>
      candles.some((c) => c.low <= zone.zoneHigh && c.low >= zone.zoneLow);
    const notable = zones.filter(
      (zone) =>
        genuinelyTouched(zone) &&
        (zone.staticStrength === "strong" || zone.staticStrength === "medium"),
    );
    const ranked = [...notable].sort(compareZonesByPriority).slice(0, CHART_ZONE_LIMIT);
    if (selectedZone && !ranked.some((z) => z.id === selectedZone.id) && notable.includes(selectedZone)) {
      ranked.push(selectedZone);
    }
    return ranked;
  })();
  const scannerRows = buildScannerRows(zones);
  const selectedScannerRow = scannerRows.find((row) => row.id === selectedZoneId) ?? null;
  const baseScannerRows = scannerRows.slice(0, 4);
  const visibleScannerRows =
    selectedScannerRow && !baseScannerRows.some((row) => row.id === selectedScannerRow.id)
      ? [selectedScannerRow, ...baseScannerRows.filter((row) => row.id !== selectedScannerRow.id)].slice(0, 4)
      : baseScannerRows;

  if (compact) {
    return (
      <div className="flex h-full min-h-0 flex-col gap-4 overflow-auto">
        <div className="grid gap-3 sm:grid-cols-2">
          <StatCard
            icon={Radar}
            label="Research reaction range"
            value={selectedZone ? formatReactionRange(selectedZone.reactionRange) : "No active row"}
            note={selectedZone ? `${selectedZone.pair} / ${selectedZone.timeframe}` : supportResistanceCopy.emptyStates.noneQualified}
          />
          <StatCard
            icon={Shield}
            label="Risk context"
            value={`${supportResistanceAlphaScope.stopBufferAtr.toFixed(2)} ATR / ~${supportResistanceAlphaScope.firstReactionTargetR.toFixed(2)}R`}
            note={supportResistanceAlphaScope.sessionFilter}
          />
        </div>

        {selectedZone ? (
          <div className="rounded-[22px] border border-white/10 bg-white/[0.03] px-4 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Featured Alpha row</div>
                <div className="mt-2 text-base font-semibold text-white">{selectedZone.zoneLabel}</div>
                <div className="mt-1 text-sm text-white/48">{selectedZone.educationalSummary}</div>
              </div>
              <OpportunityGradeBadge grade={selectedZone.dynamicGrade} />
            </div>
          </div>
        ) : null}

        {/* shrink-0 (no fixed height): the compact column is a flex/overflow-auto
            stack; the chart section's min-h-0 otherwise lets flexbox squeeze it to
            zero. shrink-0 keeps the section at its natural height (header + canvas)
            so it neither collapses nor overflows onto the scanner below. */}
        <div className="shrink-0">
          <SupportResistanceLightweightChart
            candles={candles}
            zones={chartZones}
            selectedZoneId={selectedZoneId}
            onSelectZone={setSelectedZoneId}
            compact
          />
        </div>

        <SupportResistanceScanner rows={visibleScannerRows} selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} compact />

        <div className="rounded-[22px] border border-amber-300/16 bg-amber-300/[0.06] px-4 py-4 text-sm leading-relaxed text-amber-50/80">
          {supportResistanceCopy.disclaimer}
        </div>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <header className="rounded-[24px] border border-white/10 bg-[linear-gradient(135deg,rgba(14,20,27,0.94),rgba(8,10,15,0.96))] px-4 py-4 shadow-[0_18px_42px_rgba(0,0,0,0.24)] sm:px-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold tracking-[-0.02em] text-white sm:text-2xl">EURUSD Support Reclaim Alpha</h2>
              <span className="rounded-full border border-sky-300/18 bg-sky-300/[0.08] px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-sky-100">
                Alpha: EURUSD support only
              </span>
            </div>
            <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-white/58">
              Research-backed support-zone opportunity grading for short-term first reactions.
            </p>
            <p className="mt-1 text-xs text-white/38">Resistance zones, more pairs, and live Supabase scoring are coming later.</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 lg:min-w-[520px]">
            <StatCard
              icon={Shield}
              label="Stop context"
              value={`${supportResistanceAlphaScope.stopBufferAtr.toFixed(2)} ATR`}
              note="Buffer reference"
            />
            <StatCard
              icon={Target}
              label="Target context"
              value={`~${supportResistanceAlphaScope.firstReactionTargetR.toFixed(2)}R`}
              note="First reaction"
            />
            <StatCard icon={Clock3} label="Session filter" value={supportResistanceAlphaScope.sessionFilter} note="M15 context" />
          </div>
        </div>
      </header>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.7fr)]">
        <SupportResistanceLightweightChart
          candles={candles}
          zones={chartZones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
        />
        <ZoneDetailsPanel zone={selectedZone} />
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
        <SupportResistanceScanner rows={visibleScannerRows} selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} />

        <aside className="grid gap-4">
          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.95))] p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">Alpha scope</div>
            <h3 className="mt-2 text-lg font-semibold text-white">{supportResistanceAlphaScope.alphaName}</h3>
            <p className="mt-2 text-sm leading-relaxed text-white/46">
              Alpha v1 is limited to EURUSD M15 support-reclaim research context. It does not cover resistance zones, other assets, or execution guidance.
            </p>
            <div className="mt-3 grid gap-2">
              {supportResistanceCopy.scopeNotes.map((note) => (
                <div key={note} className="rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/58">
                  {note}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.95))] p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">Interpretation help</div>
            <div className="mt-3 grid gap-2">
              <div className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/64">
                <span>Static strength vs dynamic grade</span>
                <EducationalTooltip label={supportResistanceCopy.tooltips.staticVsDynamic} align="right" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/64">
                <span>Blue zones</span>
                <EducationalTooltip label={supportResistanceCopy.tooltips.blueZones} align="right" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/64">
                <span>Watch and Blocked states</span>
                <EducationalTooltip label={supportResistanceCopy.tooltips.watchBlocked} align="right" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/64">
                <span>A+ meaning</span>
                <EducationalTooltip label={supportResistanceCopy.tooltips.aPlusMeaning} align="right" />
              </div>
              <div className="flex items-center justify-between gap-3 rounded-[16px] border border-white/8 bg-white/[0.03] px-3 py-2.5 text-sm text-white/64">
                <span>Research-only framing</span>
                <EducationalTooltip label={supportResistanceCopy.tooltips.notSignal} align="right" />
              </div>
            </div>
          </section>

          <section className="rounded-[24px] border border-amber-300/16 bg-amber-300/[0.06] p-4">
            <div className="text-[11px] uppercase tracking-[0.22em] text-amber-100">Decision-support framing</div>
            <p className="mt-2 text-sm leading-relaxed text-amber-50/82">{supportResistanceCopy.disclaimer}</p>
          </section>
        </aside>
      </div>

      <section className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,14,20,0.88),rgba(8,9,13,0.92))] p-4">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">Research profile</div>
            <h3 className="mt-1 text-lg font-semibold text-white">Historical validation sample</h3>
          </div>
          <p className="max-w-xl text-sm leading-relaxed text-white/46">
            Supporting context only. The primary workflow stays chart, details, scanner, then research profile.
          </p>
        </div>
        <div className="mt-3 grid gap-3 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ResearchProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default SupportResistanceAlphaModule;
