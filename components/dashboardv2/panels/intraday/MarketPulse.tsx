"use client";

import type { Scores, Expression } from "@/lib/strength";

// Compact context strip: strongest, weakest, clearest strength gap, biggest
// mover. Raw values live in title tooltips. No composite "gap plus percent" cell.

function fmtScore(score: number): string {
  const rounded = Math.round(score);
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

interface PulseCell {
  label: string;
  value: string;
  title: string;
  muted?: boolean;
}

function buildCells(scores: Scores, expressions: Expression[]): PulseCell[] {
  const entries = Object.entries(scores);
  const byScore = [...entries].sort((a, b) => b[1].score - a[1].score);
  const strongest = byScore[0];
  const weakest = byScore[byScore.length - 1];
  const mover = [...entries].sort((a, b) => Math.abs(b[1].rawScore) - Math.abs(a[1].rawScore))[0];
  const top = expressions[0];

  return [
    {
      label: "Strongest right now",
      value: strongest ? `${strongest[0]} ${fmtScore(strongest[1].score)}` : "-",
      title: strongest ? `${strongest[0]} score ${strongest[1].score.toFixed(1)}` : "No data",
    },
    {
      label: "Weakest right now",
      value: weakest ? `${weakest[0]} ${fmtScore(weakest[1].score)}` : "-",
      title: weakest ? `${weakest[0]} score ${weakest[1].score.toFixed(1)}` : "No data",
    },
    {
      label: "Clearest strength gap",
      value: top ? `${top.baseCode} / ${top.quoteCode}` : "-",
      title: top ? `Strength gap ${Math.round(top.spread)}` : "No clear gap",
    },
    {
      label: "Biggest mover",
      value: mover ? mover[0] : "-",
      title: mover ? `Raw change magnitude ${Math.abs(mover[1].rawScore).toFixed(1)}` : "No data",
      muted: true,
    },
  ];
}

export function MarketPulse({ scores, expressions }: { scores: Scores; expressions: Expression[] }) {
  const cells = buildCells(scores, expressions);

  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {cells.map((c) => (
        <div
          key={c.label}
          title={c.title}
          className={`rounded-[18px] border border-white/8 bg-white/[0.03] px-3 py-2.5 ${
            c.muted ? "opacity-60" : ""
          }`}
        >
          <div className="text-[9px] uppercase tracking-[0.18em] text-white/34">{c.label}</div>
          <div className="mt-1 truncate text-sm font-semibold leading-tight text-white">{c.value}</div>
        </div>
      ))}
    </div>
  );
}
