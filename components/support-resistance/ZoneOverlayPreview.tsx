import React from "react";
import OpportunityGradeBadge from "./OpportunityGradeBadge";
import { reactionRateTooltip } from "./copy";
import {
  GRADE_TOKENS,
  HISTORICAL_REACTION_RATE,
  STRENGTH_BAND_OPACITY,
  dynamicOpportunityGradeConfig,
  formatHistoricalReactionRate,
  gradeSummaryLine,
} from "./gradeConfig";
import { compareZonesByPriority } from "./model";
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
        No active Alpha-qualified EURUSD support opportunities right now.
      </section>
    );
  }

  // Rank order (A+ first) drives DOM + card order everywhere in this preview.
  const rankedZones = [...zones].sort(compareZonesByPriority);
  const selectedZone = rankedZones.find((zone) => zone.id === selectedZoneId) ?? rankedZones[0] ?? null;
  const selectedRate = selectedZone ? HISTORICAL_REACTION_RATE[selectedZone.dynamicGrade] : undefined;
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
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,13,18,0.94),rgba(8,8,12,0.98))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.32)] sm:p-5">
      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">Zone overlay preview</div>
          <h3 className="mt-2 text-xl font-semibold text-white">EURUSD support structure concept</h3>
          <p className="mt-1 text-sm text-white/46">
            Alpha visualization only. This is a clean concept preview, not a charting terminal.
          </p>
        </div>
        {selectedZone ? (
          <div className="min-w-[240px] rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Selected zone</div>
            <div className="mt-2">
              <OpportunityGradeBadge grade={selectedZone.dynamicGrade} compact />
            </div>
            <div className="mt-2 text-sm text-white/82">
              {selectedRate !== undefined ? (
                <>
                  <span
                    className="text-2xl font-semibold tracking-tight"
                    style={{ color: GRADE_TOKENS[selectedZone.dynamicGrade].text }}
                  >
                    {formatHistoricalReactionRate(selectedZone.dynamicGrade)}
                  </span>{" "}
                  <span className="text-white/74">historical 0.50R reaction rate</span>
                </>
              ) : (
                gradeSummaryLine(selectedZone.dynamicGrade)
              )}
            </div>
            <div className="mt-1 text-[11px] text-white/40">
              {selectedRate !== undefined ? "Based on comparable resolved setups" : selectedZone.zoneLabel}
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
              {/* Zone bands: slim glowing pills, HTML so glows don't distort */}
              {rankedZones.map((zone) => {
                const tokens = GRADE_TOKENS[zone.dynamicGrade];
                const span = zone.previewSpan ?? { start: 0.1, end: 0.6 };
                const mid = (zone.zoneLow + zone.zoneHigh) / 2;
                const top = 100 - ((mid - minValue) / valueRange) * 100;
                const selected = zone.id === selectedZone?.id;
                const baseOpacity = STRENGTH_BAND_OPACITY[zone.staticStrength];

                return (
                  <button
                    key={zone.id}
                    type="button"
                    onClick={() => onSelectZone?.(zone.id)}
                    aria-label={`Select ${zone.zoneLabel}`}
                    aria-pressed={selected}
                    className="absolute h-[18px] -translate-y-1/2 rounded-full border transition-all duration-200 hover:opacity-100"
                    style={{
                      left: `${span.start * 100}%`,
                      width: `${(span.end - span.start) * 100}%`,
                      top: `${top}%`,
                      background: `linear-gradient(180deg, ${tokens.fill}, rgba(0,0,0,0.25)), ${tokens.fill}`,
                      borderColor: tokens.border,
                      boxShadow: selected
                        ? `0 0 26px ${tokens.border}, inset 0 0 14px ${tokens.fill}`
                        : `0 0 14px ${tokens.fill}, inset 0 0 10px ${tokens.fill}`,
                      opacity: selected ? 1 : baseOpacity,
                      zIndex: selected ? 3 : 2,
                    }}
                  />
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
            </div>
          </div>
        </div>

        {/* Grade cards double as the legend AND the zone selector — rank order,
            exact historical rates, qualification status for unrated grades. */}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {rankedZones.map((zone) => {
            const tokens = GRADE_TOKENS[zone.dynamicGrade];
            const rate = HISTORICAL_REACTION_RATE[zone.dynamicGrade];
            const selected = zone.id === selectedZone?.id;

            return (
              <button
                key={zone.id}
                type="button"
                onClick={() => onSelectZone?.(zone.id)}
                aria-pressed={selected}
                title={rate !== undefined ? reactionRateTooltip(rate) : zone.notes}
                className={[
                  "flex flex-col gap-1 rounded-2xl border px-3 py-2.5 text-left transition-all",
                  selected ? "bg-white/[0.06]" : "bg-white/[0.02] hover:bg-white/[0.05]",
                ].join(" ")}
                style={{
                  borderColor: selected ? tokens.border : "rgba(255,255,255,0.1)",
                  boxShadow: selected ? `0 0 18px ${tokens.fill}` : undefined,
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: tokens.text, boxShadow: `0 0 8px ${tokens.border}` }}
                  />
                  <span
                    className="min-w-0 text-[10px] font-semibold uppercase leading-tight tracking-[0.12em]"
                    style={{ color: tokens.text }}
                  >
                    {dynamicOpportunityGradeConfig[zone.dynamicGrade].label}
                  </span>
                </span>
                {rate !== undefined ? (
                  <>
                    <span className="text-base font-semibold text-white">{formatHistoricalReactionRate(zone.dynamicGrade)}</span>
                    <span className="text-[10px] leading-snug text-white/44">historical reaction rate</span>
                  </>
                ) : (
                  <span className="text-[11px] leading-snug text-white/56">{gradeSummaryLine(zone.dynamicGrade)}</span>
                )}
              </button>
            );
          })}
        </div>

        {selectedZone?.dynamicGrade === "a_plus" ? (
          <div className="mt-4 rounded-[18px] border border-[#F7E38C]/18 bg-[#F7E38C]/[0.06] px-4 py-3 text-sm text-[#FFF1B1]">
            Highest grade tier — short-term first reaction, not a reversal call.
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default ZoneOverlayPreview;
