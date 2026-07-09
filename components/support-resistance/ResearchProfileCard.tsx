import React from "react";
import { ArrowUpRight, Clock3, Target } from "lucide-react";
import { dynamicOpportunityGradeConfig, gradeBadgeStyle } from "./gradeConfig";
import type { ResearchTierProfile } from "./types";

interface ResearchProfileCardProps {
  profile: ResearchTierProfile;
}

function formatPercent(value: number): string {
  return `${value.toFixed(2)}%`;
}

function formatR(value: number): string {
  return `+${value.toFixed(4)}R`;
}

export function ResearchProfileCard({ profile }: ResearchProfileCardProps) {
  const tone = dynamicOpportunityGradeConfig[profile.id];

  return (
    <article className="rounded-[18px] border border-white/8 bg-white/[0.025] p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div
            className="inline-flex items-center rounded-full border px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[0.18em]"
            style={gradeBadgeStyle(profile.id)}
          >
            {profile.label}
          </div>
          <h3 className="mt-2 text-sm font-semibold text-white">{profile.scopeLabel}</h3>
          <p className="mt-1 text-xs leading-relaxed text-white/42">Research profile for educational decision support.</p>
        </div>
        <div className={["rounded-full border px-2.5 py-1 text-[10px] font-medium", tone.panelClassName, tone.emphasisClassName].join(" ")}>
          {profile.includedGrades.length} tier view
        </div>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        <div className="rounded-[14px] border border-white/8 bg-white/[0.025] px-3 py-2.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/34">
            <Target className="h-3.5 w-3.5" />
            Historical reaction rate
          </div>
          <div className="mt-2 text-sm font-medium text-white">{formatPercent(profile.researchWinRate)}</div>
        </div>
        <div className="rounded-[14px] border border-white/8 bg-white/[0.025] px-3 py-2.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/34">
            <ArrowUpRight className="h-3.5 w-3.5" />
            Avg after cost
          </div>
          <div className="mt-2 text-sm font-medium text-white">{formatR(profile.researchAverageAfterCostR)}</div>
        </div>
        <div className="rounded-[14px] border border-white/8 bg-white/[0.025] px-3 py-2.5">
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-[0.18em] text-white/34">
            <Clock3 className="h-3.5 w-3.5" />
            Cadence
          </div>
          <div className="mt-2 text-sm font-medium text-white">{profile.researchTradesPerWeek.toFixed(2)} / week</div>
        </div>
      </div>

      <div className="mt-3 rounded-[14px] border border-white/8 bg-white/[0.025] px-3 py-2.5">
        <div className="text-[10px] uppercase tracking-[0.18em] text-white/34">Historical validation sample</div>
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-white/70">
          <span>Validation reaction rate {formatPercent(profile.validationWinRate)}</span>
          <span>Average {formatR(profile.validationAverageAfterCostR)}</span>
        </div>
      </div>
    </article>
  );
}

export default ResearchProfileCard;
