import React from "react";
import OpportunityGradeBadge from "./OpportunityGradeBadge";
import GradeLegend from "./GradeLegend";
import {
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

  // Rank order (A+ first) drives DOM + chip order everywhere in this preview.
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
  const plotWidth = 100;
  const plotHeight = 100;
  const linePath = buildLinePath(points, plotWidth, plotHeight, minValue, maxValue);
  const latestPoint = points[points.length - 1];

  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(13,13,18,0.94),rgba(8,8,12,0.98))] p-4 shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">Zone overlay preview</div>
          <h3 className="mt-2 text-xl font-semibold text-white">EURUSD support structure concept</h3>
          <p className="mt-1 text-sm text-white/46">
            Alpha visualization only. This is a clean concept preview, not a charting terminal.
          </p>
        </div>
        {selectedZone ? (
          <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Selected zone</div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <OpportunityGradeBadge grade={selectedZone.dynamicGrade} compact />
              <span className="text-sm text-white/74">{selectedZone.zoneLabel}</span>
            </div>
            <div className="mt-2 text-sm text-white/82">
              {selectedRate !== undefined ? (
                <>
                  <span className="text-lg font-semibold text-white">
                    {formatHistoricalReactionRate(selectedZone.dynamicGrade)}
                  </span>{" "}
                  historical 0.50R reaction rate
                </>
              ) : (
                gradeSummaryLine(selectedZone.dynamicGrade)
              )}
            </div>
            {selectedRate !== undefined ? (
              <div className="mt-0.5 text-[11px] text-white/40">Based on comparable resolved setups</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className={compact ? "mt-4" : "mt-5"}>
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(6,11,20,0.98),rgba(5,8,14,0.98))] p-3">
          <div className={compact ? "h-[250px]" : "h-[340px]"}>
            <svg viewBox="0 0 100 100" className="h-full w-full overflow-visible" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sr-line-fill" x1="0%" x2="0%" y1="0%" y2="100%">
                  <stop offset="0%" stopColor="rgba(116,199,255,0.18)" />
                  <stop offset="100%" stopColor="rgba(116,199,255,0)" />
                </linearGradient>
              </defs>

              {Array.from({ length: 5 }).map((_, index) => {
                const y = 10 + index * 20;
                return <line key={index} x1="0" x2="100" y1={y} y2={y} stroke="rgba(255,255,255,0.08)" strokeDasharray="2 3" />;
              })}

              {rankedZones.map((zone, index) => {
                const gradeConfig = dynamicOpportunityGradeConfig[zone.dynamicGrade];
                const span = zone.previewSpan ?? { start: 0.08 + index * 0.08, end: 0.38 + index * 0.08 };
                const yTop = 100 - ((zone.zoneHigh - minValue) / valueRange) * 100;
                const yBottom = 100 - ((zone.zoneLow - minValue) / valueRange) * 100;
                const x = span.start * 100;
                const width = (span.end - span.start) * 100;
                const selected = zone.id === selectedZone?.id;

                return (
                  <g key={zone.id} onClick={() => onSelectZone?.(zone.id)} className={onSelectZone ? "cursor-pointer" : undefined}>
                    <rect
                      x={x}
                      y={Math.min(yTop, yBottom)}
                      width={width}
                      height={Math.max(2.8, Math.abs(yBottom - yTop))}
                      rx="2"
                      fill={gradeConfig.chartFill}
                      stroke={gradeConfig.chartStroke}
                      strokeWidth={selected ? 0.9 : 0.45}
                      opacity={selected ? 1 : STRENGTH_BAND_OPACITY[zone.staticStrength]}
                    />
                    {selected ? (
                      <rect
                        x={x - 0.4}
                        y={Math.min(yTop, yBottom) - 0.5}
                        width={width + 0.8}
                        height={Math.max(3.6, Math.abs(yBottom - yTop) + 1)}
                        rx="2.6"
                        fill="none"
                        stroke="rgba(255,255,255,0.9)"
                        strokeWidth="0.5"
                        opacity="0.85"
                      />
                    ) : null}
                  </g>
                );
              })}

              <path d={`${linePath} L 100 100 L 0 100 Z`} fill="url(#sr-line-fill)" opacity="0.8" />
              <path d={linePath} fill="none" stroke="#BEE4FF" strokeWidth="1.2" strokeLinejoin="round" strokeLinecap="round" />

              {latestPoint ? (
                <>
                  <line
                    x1="0"
                    x2="100"
                    y1={100 - ((latestPoint.close - minValue) / valueRange) * 100}
                    y2={100 - ((latestPoint.close - minValue) / valueRange) * 100}
                    stroke="rgba(190,228,255,0.34)"
                    strokeDasharray="1.8 2.4"
                  />
                  <circle
                    cx="100"
                    cy={100 - ((latestPoint.close - minValue) / valueRange) * 100}
                    r="1.4"
                    fill="#BEE4FF"
                  />
                </>
              ) : null}
            </svg>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {rankedZones.map((zone) => (
            <button
              key={zone.id}
              type="button"
              onClick={() => onSelectZone?.(zone.id)}
              className={[
                "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs transition-all",
                zone.id === selectedZone?.id
                  ? "border-white/20 bg-white/[0.07] text-white"
                  : "border-white/10 bg-white/[0.03] text-white/62 hover:border-white/18 hover:text-white",
              ].join(" ")}
            >
              <OpportunityGradeBadge grade={zone.dynamicGrade} compact />
              <span>{zone.zoneLabel}</span>
            </button>
          ))}
        </div>

        {selectedZone?.dynamicGrade === "a_plus" ? (
          <div className="mt-4 rounded-[18px] border border-[#F7E38C]/18 bg-[#F7E38C]/[0.06] px-4 py-3 text-sm text-[#FFF1B1]">
            Highest grade tier — short-term first reaction, not a reversal call.
          </div>
        ) : null}

        {!compact ? (
          <div className="mt-4">
            <GradeLegend compact />
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default ZoneOverlayPreview;
