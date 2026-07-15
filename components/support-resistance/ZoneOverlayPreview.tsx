import React from "react";
import { Info } from "lucide-react";
import OpportunityGradeBadge from "./OpportunityGradeBadge";
import { cohortRateTooltip, supportResistanceCopy } from "./copy";
import {
  GRADE_COHORTS,
  GRADE_TOKENS,
  HISTORICAL_REACTION_RATE,
  STRENGTH_BAND_OPACITY,
  dynamicOpportunityGradeConfig,
  formatHistoricalReactionRate,
  gradeSummaryLine,
  staticStrengthConfig,
} from "./gradeConfig";
import { getDynamicGradeRank } from "./model";
import type { OverlayPoint, SupportResistanceZone } from "./types";

interface ZoneOverlayPreviewProps {
  points: OverlayPoint[];
  zones: SupportResistanceZone[];
  selectedZoneId: string | null;
  onSelectZone?: (zoneId: string) => void;
  compact?: boolean;
}

function buildLinePath(points: OverlayPoint[], width: number, height: number, minValue: number, maxValue: number) {
  const xStep = points.length > 1 ? width / (points.length - 1) : width;
  const range = Math.max(0.0001, maxValue - minValue);

  return points
    .map((point, index) => {
      const x = index * xStep;
      const y = height - ((point.close - minValue) / range) * height;
      return `${index === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(" ");
}

/**
 * The public Support & Resistance Alpha preview. Illustrative sample zones on
 * a stylised EURUSD line, one selected zone with the strongest emphasis, and
 * the grade hierarchy taught in ascending order (Blocked → A+). All colours
 * come from GRADE_TOKENS; the selected-zone card always matches the selected
 * band's grade colour.
 */
export function ZoneOverlayPreview({
  points,
  zones,
  selectedZoneId,
  onSelectZone,
  compact = false,
}: ZoneOverlayPreviewProps) {
  if (!points.length || !zones.length) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,13,18,0.94),rgba(8,8,12,0.98))] p-5 text-sm text-white/56">
        Preview data is unavailable right now.
      </section>
    );
  }

  // Teaching order (ascending grade) drives the card grid; the chart stacks
  // zones by price, so band order is data-driven.
  const ascendingZones = [...zones].sort(
    (a, b) => getDynamicGradeRank(a.dynamicGrade) - getDynamicGradeRank(b.dynamicGrade),
  );
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? ascendingZones[ascendingZones.length - 1] ?? null;
  const selectedTokens = selectedZone ? GRADE_TOKENS[selectedZone.dynamicGrade] : null;
  const selectedRate = selectedZone ? HISTORICAL_REACTION_RATE[selectedZone.dynamicGrade] : undefined;
  const selectedCohort = selectedZone ? GRADE_COHORTS[selectedZone.dynamicGrade] : undefined;
  const allValues = [
    ...points.map((point) => point.close),
    ...zones.flatMap((zone) => [zone.zoneLow, zone.zoneHigh]),
  ];
  const minValue = Math.min(...allValues) - 0.0004;
  const maxValue = Math.max(...allValues) + 0.0004;
  const valueRange = Math.max(0.0001, maxValue - minValue);
  const linePath = buildLinePath(points, 100, 100, minValue, maxValue);
  const latestPoint = points[points.length - 1];
  const latestY = latestPoint ? 100 - ((latestPoint.close - minValue) / valueRange) * 100 : 0;
  const tickCount = 5;
  const ticks = Array.from({ length: tickCount }, (_, i) => minValue + ((tickCount - 1 - i) * valueRange) / (tickCount - 1));

  return (
    <section
      aria-labelledby="sr-alpha-preview-title"
      className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_70%_0%,rgba(124,58,237,0.1),transparent_38%),linear-gradient(180deg,rgba(13,13,18,0.94),rgba(8,8,12,0.98))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.32)] sm:p-5"
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
            className="min-w-[240px] rounded-[18px] border px-4 py-3"
            style={{
              borderColor: selectedTokens.border,
              background: `radial-gradient(circle at 12% 0%, ${selectedTokens.fill}, transparent 55%), rgba(255,255,255,0.02)`,
              boxShadow: selectedTokens.glow,
            }}
          >
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/40">Selected zone</div>
            <div className="mt-2">
              <OpportunityGradeBadge grade={selectedZone.dynamicGrade} compact />
            </div>
            <div className="mt-2 text-sm text-white/82">
              {selectedRate !== undefined ? (
                <>
                  <span className="text-2xl font-semibold tracking-tight" style={{ color: selectedTokens.text }}>
                    {formatHistoricalReactionRate(selectedZone.dynamicGrade)}
                  </span>{" "}
                  <span className="text-white/74">historical 0.50R first-reaction rate</span>
                </>
              ) : (
                gradeSummaryLine(selectedZone.dynamicGrade)
              )}
            </div>
            <div className="mt-1 text-[11px] text-white/44">
              {selectedCohort
                ? `${selectedCohort.label} · ${selectedCohort.resolvedSample} resolved events`
                : selectedZone.zoneLabel}
            </div>
          </div>
        ) : null}
      </div>

      <div className={compact ? "mt-4" : "mt-5"}>
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,11,20,0.98),rgba(5,8,14,0.98))] p-3 pr-1">
          <div className={["relative", compact ? "h-[300px]" : "h-[380px]"].join(" ")}>
            {/* Price axis + dotted gridlines */}
            {ticks.map((tick, index) => {
              const y = (index / (tickCount - 1)) * 100;
              return (
                <React.Fragment key={tick}>
                  <div
                    aria-hidden
                    className="absolute left-0 right-14 border-t border-dashed border-white/[0.08]"
                    style={{ top: `${y}%` }}
                  />
                  <span
                    className="absolute right-0 w-12 -translate-y-1/2 text-right font-mono text-[10px] text-white/38"
                    style={{ top: `${y}%` }}
                  >
                    {tick.toFixed(4)}
                  </span>
                </React.Fragment>
              );
            })}

            {/* Plot area (leaves room for the axis labels) */}
            <div className="absolute inset-y-0 left-0 right-14">
              {/* Zone bands: slim pills. Only the selected band gets the strong
                  glow + label; the rest stay muted so the hierarchy is obvious. */}
              {ascendingZones.map((zone) => {
                const tokens = GRADE_TOKENS[zone.dynamicGrade];
                const config = dynamicOpportunityGradeConfig[zone.dynamicGrade];
                const span = zone.previewSpan ?? { start: 0.1, end: 0.6 };
                const mid = (zone.zoneLow + zone.zoneHigh) / 2;
                const top = 100 - ((mid - minValue) / valueRange) * 100;
                const selected = zone.id === selectedZone?.id;
                const baseOpacity = STRENGTH_BAND_OPACITY[zone.staticStrength];
                const strengthLabel = staticStrengthConfig[zone.staticStrength].label.toUpperCase();

                return (
                  <React.Fragment key={zone.id}>
                    {selected ? (
                      <span
                        aria-hidden
                        className="absolute z-[3] -translate-y-full pb-1 text-[9px] font-semibold uppercase tracking-[0.14em]"
                        style={{ left: `${span.start * 100}%`, top: `calc(${top}% - 11px)`, color: tokens.text }}
                      >
                        {config.compactLabel} · {strengthLabel}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onSelectZone?.(zone.id)}
                      aria-label={`Select illustrative ${config.label} support zone (static strength ${staticStrengthConfig[zone.staticStrength].label})`}
                      aria-pressed={selected}
                      className="absolute h-[18px] -translate-y-1/2 rounded-full border transition-all duration-200 hover:opacity-100 motion-reduce:transition-none"
                      style={{
                        left: `${span.start * 100}%`,
                        width: `${(span.end - span.start) * 100}%`,
                        top: `${top}%`,
                        background: `linear-gradient(180deg, ${tokens.fill}, rgba(0,0,0,0.25)), ${tokens.background}`,
                        borderColor: tokens.border,
                        boxShadow: selected
                          ? `0 0 26px ${tokens.border}, inset 0 0 14px ${tokens.fill}`
                          : `inset 0 0 10px ${tokens.fill}`,
                        opacity: selected ? 1 : baseOpacity * 0.72,
                        zIndex: selected ? 3 : 2,
                      }}
                    />
                  </React.Fragment>
                );
              })}

              {/* Price line above the bands */}
              <svg viewBox="0 0 100 100" className="pointer-events-none absolute inset-0 z-[4] h-full w-full overflow-visible" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="sr-line-fill" x1="0%" x2="0%" y1="0%" y2="100%">
                    <stop offset="0%" stopColor="rgba(232,244,255,0.14)" />
                    <stop offset="100%" stopColor="rgba(232,244,255,0)" />
                  </linearGradient>
                </defs>
                <path d={`${linePath} L 100 100 L 0 100 Z`} fill="url(#sr-line-fill)" opacity="0.7" />
                <path
                  d={linePath}
                  fill="none"
                  stroke="#F2F8FF"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>
              {latestPoint ? (
                <span
                  aria-hidden
                  className="absolute z-[5] h-3 w-3 -translate-y-1/2 translate-x-1/2 rounded-full border-2 border-white bg-[#0a1626] shadow-[0_0_12px_rgba(255,255,255,0.65)]"
                  style={{ right: 0, top: `${latestY}%` }}
                />
              ) : null}

              <span
                aria-hidden
                className="absolute bottom-1 left-1 z-[5] text-[9px] font-semibold uppercase tracking-[0.16em] text-white/34"
              >
                Illustrative preview
              </span>
            </div>
          </div>
        </div>

        {/* Grade cards double as the legend AND the zone selector. Teaching
            order is ascending: Blocked → Informational → Watch → Green →
            Elite Green → A+. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
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
                      {cohort ? `${cohort.label} · ${cohort.resolvedSample} resolved` : "historical first-reaction rate"}
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

        {selectedZone?.dynamicGrade === "a_plus" ? (
          <div
            className="mt-3 rounded-[16px] border px-4 py-3 text-sm"
            style={{
              borderColor: GRADE_TOKENS.a_plus.border,
              background: GRADE_TOKENS.a_plus.fill,
              color: GRADE_TOKENS.a_plus.text,
            }}
          >
            A+ is the highest-quality short-term first-reaction context, not a long-term reversal prediction.
          </div>
        ) : null}

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
