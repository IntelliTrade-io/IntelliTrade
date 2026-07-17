import { Info } from "lucide-react";
import OpportunityGradeBadge from "./OpportunityGradeBadge";
import SupportZoneIllustrativeChart from "./SupportZoneIllustrativeChart";
import { cohortRateTooltip, supportResistanceCopy } from "./copy";
import {
  GRADE_COHORTS,
  GRADE_TOKENS,
  HISTORICAL_REACTION_RATE,
  dynamicOpportunityGradeConfig,
  formatHistoricalReactionRate,
  gradeSummaryLine,
} from "./gradeConfig";
import { getDynamicGradeRank } from "./model";
import type { SupportResistanceZone } from "./types";

interface ZoneOverlayPreviewProps {
  zones: SupportResistanceZone[];
  selectedZoneId: string | null;
  onSelectZone?: (zoneId: string) => void;
  compact?: boolean;
}

/**
 * The public Support & Resistance Alpha preview. An illustrative EURUSD M15
 * candlestick chart with sample graded support zones, one selected zone
 * highlighted in its grade colour, and the grade hierarchy taught in ascending
 * order (Blocked to A+). The grade cards double as the zone selector because
 * the canvas chart is not interactive. All card colours come from GRADE_TOKENS;
 * the selected-zone card always matches the selected grade colour.
 */
export function ZoneOverlayPreview({
  zones,
  selectedZoneId,
  onSelectZone,
  compact = false,
}: ZoneOverlayPreviewProps) {
  if (!zones.length) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,13,18,0.94),rgba(8,8,12,0.98))] p-5 text-sm text-white/56">
        Preview data is unavailable right now.
      </section>
    );
  }

  // Teaching order (ascending grade) drives the card grid.
  const ascendingZones = [...zones].sort(
    (a, b) => getDynamicGradeRank(a.dynamicGrade) - getDynamicGradeRank(b.dynamicGrade),
  );
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? ascendingZones[ascendingZones.length - 1] ?? null;
  const selectedTokens = selectedZone ? GRADE_TOKENS[selectedZone.dynamicGrade] : null;
  const selectedRate = selectedZone ? HISTORICAL_REACTION_RATE[selectedZone.dynamicGrade] : undefined;
  const selectedCohort = selectedZone ? GRADE_COHORTS[selectedZone.dynamicGrade] : undefined;

  return (
    <section
      aria-labelledby="sr-alpha-preview-title"
      className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,0.1),transparent_38%),linear-gradient(180deg,rgba(13,13,18,0.94),rgba(8,8,12,0.98))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.32)] sm:p-5 [overflow-anchor:none]"
    >
      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-violet-300/90">
            Support &amp; Resistance Alpha preview
          </div>
          <h3 id="sr-alpha-preview-title" className={["mt-2 font-semibold tracking-tight text-white", compact ? "text-lg" : "text-xl sm:text-2xl"].join(" ")}>
            EURUSD support-zone preview
          </h3>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-white/46">
            An illustrative preview of IntelliTrade&apos;s EURUSD M15 support-zone grading. The IntelliTrade Pro
            dashboard uses live candles and current zone data.
          </p>
        </div>
        {selectedZone && selectedTokens ? (
          <div
            className="flex w-full items-center gap-4 rounded-[16px] border px-4 py-2.5 sm:w-[430px]"
            style={{
              borderColor: selectedTokens.border,
              background: `radial-gradient(circle at 12% 0%, ${selectedTokens.fill}, transparent 55%), rgba(255,255,255,0.02)`,
              boxShadow: selectedTokens.glow,
            }}
          >
            <div className="flex shrink-0 flex-col items-center gap-1">
              <OpportunityGradeBadge
                grade={selectedZone.dynamicGrade}
                compact
                className="w-[140px] justify-center"
              />
              {selectedRate !== undefined ? (
                <span className="text-lg font-semibold tracking-tight" style={{ color: selectedTokens.text }}>
                  {formatHistoricalReactionRate(selectedZone.dynamicGrade)}
                </span>
              ) : null}
            </div>
            <div className="flex min-h-[52px] min-w-0 flex-col justify-center text-sm leading-snug text-white/82">
              <div>
                {selectedRate !== undefined
                  ? "historical 0.50R first-reaction rate"
                  : gradeSummaryLine(selectedZone.dynamicGrade)}
              </div>
              <div className="mt-0.5 truncate text-[11px] text-white/44">
                {selectedCohort ? selectedCohort.label : selectedZone.zoneLabel}
              </div>
            </div>
          </div>
        ) : null}
      </div>

      <div className={compact ? "mt-4" : "mt-5"}>
        <SupportZoneIllustrativeChart />

        {/* Grade cards double as the legend AND the zone selector. Teaching
            order is ascending: Blocked → Informational → Watch → Green →
            Elite Green → A+. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ascendingZones.map((zone) => {
            const tokens = GRADE_TOKENS[zone.dynamicGrade];
            const rate = HISTORICAL_REACTION_RATE[zone.dynamicGrade];
            const cohort = GRADE_COHORTS[zone.dynamicGrade];
            const selected = zone.id === selectedZone?.id;

            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => onSelectZone?.(zone.id)}
                aria-pressed={selected}
                aria-label={`${dynamicOpportunityGradeConfig[zone.dynamicGrade].label}: ${gradeSummaryLine(zone.dynamicGrade, true)}`}
                title={rate !== undefined ? cohortRateTooltip(zone.dynamicGrade) : zone.notes}
                className={[
                  "flex min-w-0 flex-col gap-1 rounded-2xl border px-3 py-2.5 text-left transition-all motion-reduce:transition-none",
                  selected ? "bg-white/[0.06]" : "bg-white/[0.02] hover:bg-white/[0.05]",
                ].join(" ")}
                style={{
                  borderColor: selected ? tokens.border : "rgba(255,255,255,0.1)",
                  boxShadow: selected ? tokens.glow ?? `0 0 14px ${tokens.fill}` : undefined,
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: tokens.text }}
                  />
                  <span
                    className="min-w-0 truncate text-[10px] font-semibold uppercase leading-tight tracking-[0.12em]"
                    style={{ color: tokens.text }}
                  >
                    {dynamicOpportunityGradeConfig[zone.dynamicGrade].label}
                  </span>
                </span>
                {rate !== undefined ? (
                  <>
                    <span className="text-base font-semibold text-white">{formatHistoricalReactionRate(zone.dynamicGrade)}</span>
                    <span className="text-[10px] leading-snug text-white/44">
                      {cohort ? cohort.label : "historical first-reaction rate"}
                    </span>
                  </>
                ) : (
                  <span className="text-[11px] leading-snug text-white/56">{gradeSummaryLine(zone.dynamicGrade)}</span>
                )}
              </button>
            );
          })}
        </div>

        <div className="mt-3 flex items-start gap-2.5 rounded-[16px] border border-white/8 bg-white/[0.03] px-3.5 py-3 text-xs leading-relaxed text-white/56">
          <Info aria-hidden className="mt-0.5 h-3.5 w-3.5 shrink-0 text-white/44" />
          <span>{supportResistanceCopy.tooltips.cumulativeCohorts}</span>
        </div>

        {/* Always laid out (visibility toggle, not unmount) so selecting or
            deselecting A+ never changes the preview height and scroll-jumps
            the page. */}
        <div
          aria-hidden={selectedZone?.dynamicGrade !== "a_plus"}
          className={[
            "mt-3 rounded-[16px] border px-4 py-3 text-sm",
            selectedZone?.dynamicGrade === "a_plus" ? "visible" : "invisible",
          ].join(" ")}
          style={{
            borderColor: GRADE_TOKENS.a_plus.border,
            background: GRADE_TOKENS.a_plus.fill,
            color: GRADE_TOKENS.a_plus.text,
          }}
        >
          A+ is the highest-quality short-term first-reaction context, not a long-term reversal prediction.
        </div>

        {!compact ? (
          <footer className="mt-4 flex flex-col gap-3 border-t border-white/8 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="max-w-xl text-xs leading-relaxed text-white/44">{supportResistanceCopy.disclaimer}</p>
            <a
              href="/support-resistance"
              className="inline-flex shrink-0 items-center justify-center rounded-full border border-violet-400/50 bg-[linear-gradient(135deg,rgba(124,58,237,0.82),rgba(76,29,149,0.92))] px-5 py-2.5 text-sm font-semibold text-violet-50 shadow-[0_0_24px_rgba(124,58,237,0.24)] transition-all hover:shadow-[0_0_34px_rgba(124,58,237,0.36)] motion-reduce:transition-none"
            >
              Open Support &amp; Resistance Alpha
            </a>
          </footer>
        ) : (
          <p className="mt-3 text-[11px] leading-relaxed text-white/38">{supportResistanceCopy.disclaimer}</p>
        )}
      </div>
    </section>
  );
}

export default ZoneOverlayPreview;
