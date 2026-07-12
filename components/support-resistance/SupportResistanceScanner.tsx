import React from "react";
import { supportResistanceCopy } from "./copy";
import { formatReactionRange, formatTypicalR, isGreenTierGrade } from "./model";
import { gradeBadgeStyle } from "./gradeConfig";
import OpportunityGradeBadge from "./OpportunityGradeBadge";
import StaticStrengthMeter from "./StaticStrengthMeter";
import type { ScannerRow } from "./types";

interface SupportResistanceScannerProps {
  rows: ScannerRow[];
  selectedZoneId: string | null;
  onSelectZone?: (zoneId: string) => void;
  compact?: boolean;
}

function getScannerRowTone(grade: ScannerRow["dynamicGrade"], selected: boolean): string {
  if (selected) {
    return "border-white/24 bg-white/[0.08] shadow-[0_0_0_1px_rgba(255,255,255,0.06)]";
  }

  if (grade === "blocked") {
    return "border-rose-300/12 bg-rose-950/[0.08] opacity-65 hover:border-rose-300/20 hover:opacity-80";
  }

  if (grade === "watch") {
    return "border-blue-400/12 bg-blue-950/[0.08] opacity-75 hover:border-blue-400/20 hover:opacity-90";
  }

  if (grade === "blue") {
    return "border-sky-300/10 bg-sky-950/[0.06] opacity-70 hover:border-sky-300/18 hover:opacity-90";
  }

  return "border-white/10 bg-white/[0.03] hover:border-white/18 hover:bg-white/[0.05]";
}

export function SupportResistanceScanner({
  rows,
  selectedZoneId,
  onSelectZone,
  compact = false,
}: SupportResistanceScannerProps) {
  const alphaQualifiedCount = rows.filter((row) => isGreenTierGrade(row.dynamicGrade)).length;

  if (!rows.length) {
    return (
      <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.95))] p-5 text-sm text-white/56">
        {supportResistanceCopy.emptyStates.noZones}
      </section>
    );
  }

  if (compact) {
    return (
      <section className="rounded-[26px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.95))] p-4">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.2em] text-white/34">Scanner</div>
            <div className="mt-1 text-sm text-white/46">EURUSD support zones ranked by opportunity grade.</div>
          </div>
          <div className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/60">
            {alphaQualifiedCount} Green+
          </div>
        </div>

        <div className="grid gap-3">
          {rows.map((row) => (
            <button
              key={row.id}
              type="button"
              onClick={() => onSelectZone?.(row.id)}
              aria-pressed={row.id === selectedZoneId}
              className={["rounded-[20px] border px-4 py-3 text-left transition-all", getScannerRowTone(row.dynamicGrade, row.id === selectedZoneId)].join(" ")}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-semibold text-white">{row.pair}</div>
                  <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/40">{row.timeframe} / Support</div>
                </div>
                <OpportunityGradeBadge grade={row.dynamicGrade} compact />
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-sm text-white/70">
                <StaticStrengthMeter strength={row.staticStrength} compact />
                <span
                  className="rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={gradeBadgeStyle(row.dynamicGrade)}
                >
                  {row.status}
                </span>
              </div>
              <div className="mt-2 text-sm text-white/58">{formatReactionRange(row.reactionRange)}</div>
            </button>
          ))}
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(17,17,23,0.92),rgba(10,10,15,0.95))] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
      <div className="flex flex-col gap-3 border-b border-white/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">Support zone scanner</div>
          <h3 className="mt-2 text-xl font-semibold text-white">EURUSD support zones, ranked by grade</h3>
          <p className="mt-1 text-sm text-white/46">Static strength and dynamic opportunity grade are separated on every row.</p>
        </div>
        <div className="rounded-[18px] border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/68">
          {alphaQualifiedCount
            ? `${alphaQualifiedCount} Green+ ${alphaQualifiedCount === 1 ? "row" : "rows"} in the latest EURUSD M15 snapshot.`
            : supportResistanceCopy.emptyStates.noGreenPlus}
        </div>
      </div>

      <div className="mt-4 hidden overflow-x-auto rounded-[24px] border border-white/10 lg:block">
        <table className="min-w-full border-collapse">
          <thead className="bg-white/[0.03] text-left text-[10px] uppercase tracking-[0.22em] text-white/34">
            <tr>
              <th className="px-4 py-3 font-medium">Pair</th>
              <th className="px-4 py-3 font-medium">Timeframe</th>
              <th className="px-4 py-3 font-medium">Zone side</th>
              <th className="px-4 py-3 font-medium">Static strength</th>
              <th className="px-4 py-3 font-medium">Opportunity grade</th>
              <th className="px-4 py-3 font-medium">Historical reaction range</th>
              <th className="px-4 py-3 font-medium">Typical minimum R</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                role="button"
                tabIndex={0}
                aria-pressed={row.id === selectedZoneId}
                onClick={() => onSelectZone?.(row.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    onSelectZone?.(row.id);
                  }
                }}
                className={[
                  "cursor-pointer border-t border-white/8 transition-colors focus:outline-none focus-visible:bg-white/[0.08]",
                  row.id === selectedZoneId
                    ? "bg-white/[0.1]"
                    : row.dynamicGrade === "watch"
                      ? "bg-blue-950/[0.04] opacity-80 hover:bg-blue-950/[0.08]"
                      : row.dynamicGrade === "blocked"
                        ? "bg-rose-950/[0.04] opacity-70 hover:bg-rose-950/[0.08]"
                        : row.dynamicGrade === "blue"
                          ? "bg-sky-950/[0.04] opacity-75 hover:bg-sky-950/[0.08]"
                          : "bg-transparent hover:bg-white/[0.03]",
                ].join(" ")}
              >
                <td className="px-4 py-4">
                  <span className="text-sm font-medium text-white">{row.pair}</span>
                </td>
                <td className="px-4 py-4 text-sm text-white/68">{row.timeframe}</td>
                <td className="px-4 py-4 text-sm text-white/68">Support</td>
                <td className="px-4 py-4">
                  <StaticStrengthMeter strength={row.staticStrength} />
                </td>
                <td className="px-4 py-4">
                  <OpportunityGradeBadge grade={row.dynamicGrade} compact />
                </td>
                <td className="px-4 py-4 text-sm text-white/78">{formatReactionRange(row.reactionRange)}</td>
                <td className="px-4 py-4 text-sm text-white/78">
                  {formatTypicalR(row.typicalMinimumR, row.typicalMaximumR)}
                </td>
                <td className="px-4 py-4">
                  <span
                    className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                    style={gradeBadgeStyle(row.dynamicGrade)}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-4 grid gap-3 lg:hidden">
        {rows.map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => onSelectZone?.(row.id)}
            aria-pressed={row.id === selectedZoneId}
            className={["rounded-[22px] border px-4 py-4 text-left transition-all", getScannerRowTone(row.dynamicGrade, row.id === selectedZoneId)].join(" ")}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-white">{row.pair}</div>
                <div className="mt-1 text-xs uppercase tracking-[0.18em] text-white/40">{row.timeframe} / Support</div>
              </div>
              <OpportunityGradeBadge grade={row.dynamicGrade} compact />
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <StaticStrengthMeter strength={row.staticStrength} />
              <div className="text-sm text-white/70">{formatReactionRange(row.reactionRange)}</div>
              <div className="text-sm text-white/70">
                Typical {formatTypicalR(row.typicalMinimumR, row.typicalMaximumR)}
              </div>
              <div>
                <span
                  className="inline-flex rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em]"
                  style={gradeBadgeStyle(row.dynamicGrade)}
                >
                  {row.status}
                </span>
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-white/56">
          {supportResistanceCopy.emptyStates.blueZones}
        </div>
        <div className="rounded-[20px] border border-white/8 bg-white/[0.03] px-4 py-4 text-sm text-white/56">
          {supportResistanceCopy.emptyStates.roadmap}
        </div>
      </div>
    </section>
  );
}

export default SupportResistanceScanner;
