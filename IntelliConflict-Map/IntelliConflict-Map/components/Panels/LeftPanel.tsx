"use client";

import type {
  ConflictStats,
  ConflictWindow,
  SeverityFilter
} from "@/lib/schema";
import type { CategoryId } from "@/lib/scoring";
import { percentage } from "@/lib/utils";

import { Chip } from "@/components/ui/Chip";
import { Input } from "@/components/ui/Input";
import { Segmented } from "@/components/ui/Segmented";

type LeftPanelProps = {
  activeCategories: CategoryId[];
  categoryOptions: { id: CategoryId; label: string }[];
  loading: boolean;
  onCategoryToggle: (categoryId: CategoryId) => void;
  onSearchChange: (value: string) => void;
  onSeverityChange: (value: SeverityFilter) => void;
  onWindowChange: (value: ConflictWindow) => void;
  search: string;
  severity: SeverityFilter;
  stats: ConflictStats;
  totalCount: number;
  windowValue: ConflictWindow;
};

export function LeftPanel({
  activeCategories,
  categoryOptions,
  loading,
  onCategoryToggle,
  onSearchChange,
  onSeverityChange,
  onWindowChange,
  search,
  severity,
  stats,
  totalCount,
  windowValue
}: LeftPanelProps) {
  const countries = loading
    ? Array.from({ length: 5 }, (_, index) => ({
        count: 0,
        key: `loading-${index}`,
        name: "Loading..."
      }))
    : stats.topCountries.map((country) => ({
        ...country,
        key: country.name
      }));

  const totalSeverityCount =
    stats.severityBuckets.low +
    stats.severityBuckets.medium +
    stats.severityBuckets.high;

  return (
    <aside className="pointer-events-auto absolute left-4 top-4 z-20 flex max-h-[calc(100vh-2rem)] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] glass-panel">
      <div className="border-b border-white/8 px-5 py-5">
        <p className="text-xs font-semibold uppercase tracking-[0.28em] text-accent/85">
          IntelliTrade Signal Deck
        </p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white">
          IntelliConflict
        </h1>
        <p className="mt-2 max-w-sm text-sm leading-6 text-muted">
          Live risk signals from global news flow.
        </p>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Time window
          </p>
          <Segmented
            options={[
              { label: "24H", value: "24h" },
              { label: "7D", value: "7d" },
              { label: "30D", value: "30d" }
            ]}
            value={windowValue}
            onChange={onWindowChange}
          />
        </section>

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Severity
          </p>
          <div className="flex flex-wrap gap-2">
            {[
              { label: "All", value: "all" },
              { label: "High", value: "high" },
              { label: "Medium", value: "medium" },
              { label: "Low", value: "low" }
            ].map((option) => (
              <Chip
                key={option.value}
                active={severity === option.value}
                onClick={() => onSeverityChange(option.value as SeverityFilter)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Categories
          </p>
          <div className="flex flex-wrap gap-2">
            {categoryOptions.map((category) => (
              <Chip
                key={category.id}
                active={activeCategories.includes(category.id)}
                onClick={() => onCategoryToggle(category.id)}
              >
                {category.label}
              </Chip>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
            Search
          </p>
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search title, country, tag, theme..."
            aria-label="Search loaded events"
          />
        </section>

        <section className="space-y-4 rounded-[24px] border border-white/8 bg-white/4 p-4">
          <div className="flex items-end justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Total events
              </p>
              <p className="mt-2 text-3xl font-semibold text-white">
                {loading ? "..." : totalCount.toLocaleString()}
              </p>
            </div>
            <div className="rounded-2xl border border-white/8 bg-black/20 px-3 py-2 text-right">
              <p className="text-[11px] uppercase tracking-[0.16em] text-muted">
                Density
              </p>
              <p className="mt-1 text-sm font-semibold text-white">
                {totalCount >= 120
                  ? "Elevated"
                  : totalCount >= 40
                    ? "Active"
                    : "Watching"}
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.16em] text-muted">
              <span>Severity distribution</span>
              <span>{totalSeverityCount.toLocaleString()} tracked</span>
            </div>
            <div className="flex h-3 overflow-hidden rounded-full bg-white/6">
              <div
                className="bg-emerald-400/70"
                style={{
                  width: `${percentage(stats.severityBuckets.low, totalSeverityCount)}%`
                }}
              />
              <div
                className="bg-amber-300/80"
                style={{
                  width: `${percentage(stats.severityBuckets.medium, totalSeverityCount)}%`
                }}
              />
              <div
                className="bg-rose-400/80"
                style={{
                  width: `${percentage(stats.severityBuckets.high, totalSeverityCount)}%`
                }}
              />
            </div>
            <div className="grid grid-cols-3 gap-2 text-xs text-muted">
              <span>Low {stats.severityBuckets.low}</span>
              <span>Medium {stats.severityBuckets.medium}</span>
              <span>High {stats.severityBuckets.high}</span>
            </div>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted">
              Top countries
            </p>
            <div className="space-y-2">
              {countries.map((country) => (
                <div
                  key={country.key}
                  className="flex items-center justify-between rounded-2xl border border-white/6 bg-white/4 px-3 py-2"
                >
                  <span className="text-sm text-white">{country.name}</span>
                  <span className="text-xs font-semibold text-muted">
                    {loading ? "-" : country.count}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </aside>
  );
}
