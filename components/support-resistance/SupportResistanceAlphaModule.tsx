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
    <div className="rounded-xl border border-white/10 bg-white/[0.03] px-2.5 py-1.5">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-[0.16em] text-white/34">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className="mt-0.5 text-[13px] font-semibold leading-tight text-white">{value}</div>
      {note ? <div className="text-[11px] leading-tight text-white/40">{note}</div> : null}
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
  // ── CHART ZONE SELECTION RULE ─────────────────────────────────────────────
  // A zone is drawn whenever it EXISTS in the current data — strength/grade only
  // affect its badge/colour, never whether it's on the chart. (Earlier this
  // required strong/medium static_strength; but the research scores most zones
  // "weak", so in weak-only markets the chart drew NOTHING despite valid zones.)
  //   (a) genuinely touched in view — a candle LOW dipped into the band, so the
  //       band hugs real price instead of floating over dead space.
  //   (b) top CHART_ZONE_LIMIT by priority; scanner + details still list ALL zones.
  const CHART_ZONE_LIMIT = 5;
  const chartZones = (() => {
    const genuinelyTouched = (zone: (typeof zones)[number]) =>
      candles.some((c) => c.low <= zone.zoneHigh && c.low >= zone.zoneLow);
    const touched = zones.filter(genuinelyTouched);
    const ranked = [...touched].sort(compareZonesByPriority).slice(0, CHART_ZONE_LIMIT);
    if (selectedZone && !ranked.some((z) => z.id === selectedZone.id) && touched.includes(selectedZone)) {
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
            note={selectedZone ? `${selectedZone.pair} / ${selectedZone.timeframe}` : supportResistanceCopy.emptyStates.noReclaim}
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
    <div className="grid gap-3">
      <header className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-[linear-gradient(135deg,rgba(14,20,27,0.94),rgba(8,10,15,0.96))] px-3.5 py-2.5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-sky-300/18 bg-sky-300/[0.08] px-2.5 py-0.5 text-[10px] uppercase tracking-[0.16em] text-sky-100">
            Alpha: EURUSD support only
          </span>
          <span className="text-xs text-white/48">Support-zone opportunity grading · short-term first reactions</span>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:min-w-[360px]">
          <StatCard icon={Shield} label="Stop" value={`${supportResistanceAlphaScope.stopBufferAtr.toFixed(2)} ATR`} note="Buffer" />
          <StatCard icon={Target} label="Target" value={`~${supportResistanceAlphaScope.firstReactionTargetR.toFixed(2)}R`} note="First reaction" />
          <StatCard icon={Clock3} label="Session" value={supportResistanceAlphaScope.sessionFilter} note="M15" />
        </div>
      </header>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.6fr)_minmax(300px,1fr)]">
        <SupportResistanceLightweightChart
          candles={candles}
          zones={chartZones}
          selectedZoneId={selectedZoneId}
          onSelectZone={setSelectedZoneId}
        />
        <div className="max-h-[520px] overflow-y-auto">
          <ZoneDetailsPanel zone={selectedZone} />
        </div>
      </div>

      <div className="grid gap-3 xl:grid-cols-[minmax(0,1.5fr)_minmax(280px,1fr)]">
        <SupportResistanceScanner rows={visibleScannerRows} selectedZoneId={selectedZoneId} onSelectZone={setSelectedZoneId} />

        <aside className="grid gap-3">
          <section className="rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.95))] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Alpha scope</div>
            <div className="mt-2 grid gap-1.5">
              {supportResistanceCopy.scopeNotes.map((note) => (
                <div key={note} className="rounded-[12px] border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/56">
                  {note}
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.95))] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Interpretation help</div>
            <div className="mt-2 grid gap-1.5">
              {(
                [
                  ["Static strength vs dynamic grade", supportResistanceCopy.tooltips.staticVsDynamic],
                  ["Blue zones", supportResistanceCopy.tooltips.blueZones],
                  ["Watch and Blocked states", supportResistanceCopy.tooltips.watchBlocked],
                  ["A+ meaning", supportResistanceCopy.tooltips.aPlusMeaning],
                  ["Research-only framing", supportResistanceCopy.tooltips.notSignal],
                ] as const
              ).map(([label, tip]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-2 rounded-[12px] border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white/64"
                >
                  <span>{label}</span>
                  <EducationalTooltip label={tip} align="right" />
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-[18px] border border-amber-300/16 bg-amber-300/[0.06] p-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-amber-100">Decision-support framing</div>
            <p className="mt-1.5 text-xs leading-relaxed text-amber-50/82">{supportResistanceCopy.disclaimer}</p>
          </section>
        </aside>
      </div>

      <section className="rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(14,14,20,0.88),rgba(8,9,13,0.92))] p-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Research profile</div>
            <h3 className="mt-0.5 text-sm font-semibold text-white">Historical validation sample</h3>
          </div>
          <p className="max-w-xl text-xs leading-relaxed text-white/44">
            Supporting context only. Primary workflow stays chart, details, scanner, then research profile.
          </p>
        </div>
        <div className="mt-2 grid gap-2 lg:grid-cols-3">
          {profiles.map((profile) => (
            <ResearchProfileCard key={profile.id} profile={profile} />
          ))}
        </div>
      </section>
    </div>
  );
}

export default SupportResistanceAlphaModule;
