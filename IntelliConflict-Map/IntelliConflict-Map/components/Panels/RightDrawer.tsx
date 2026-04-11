"use client";

import { useState } from "react";

import type { ConflictFeature, ConflictWindow } from "@/lib/schema";
import { formatRelativeTime, formatTimestamp } from "@/lib/utils";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";

type RightDrawerProps = {
  feature: ConflictFeature | null;
  onClose: () => void;
  windowValue: ConflictWindow;
};

export function RightDrawer({
  feature,
  onClose,
  windowValue
}: RightDrawerProps) {
  const [copied, setCopied] = useState(false);
  const isHotspot = feature?.properties.dataKind === "hotspot";
  const severityTone =
    feature?.properties.severityLabel === "High"
      ? "high"
      : feature?.properties.severityLabel === "Medium"
        ? "medium"
        : "low";

  async function handleCopy() {
    if (!feature) {
      return;
    }

    const summary = isHotspot
      ? [
          `${getDisplayTitle(feature)}, ${
            feature.properties.country || "Unknown country"
          }`,
          `Hotspot mentions: ${feature.properties.hotspotCount ?? 1}`,
          `Severity: ${feature.properties.severityLabel} (${feature.properties.severityScore}/100)`,
          `Window: ${windowValue}`,
          feature.properties.locationPrecision === "country"
            ? "Precision: Approximate location (country-level)"
            : "Precision: Exact point"
        ].join(" - ")
      : [
          feature.properties.title,
          `Severity: ${feature.properties.severityLabel} (${feature.properties.severityScore}/100)`,
          feature.properties.locationName ||
            feature.properties.country ||
            "Location unavailable",
          feature.properties.locationPrecision === "country"
            ? "Precision: Approximate location (country-level)"
            : "Precision: Exact point",
          `Observed: ${feature.properties.date}`,
          ...(feature.properties.sourceUrl ? [feature.properties.sourceUrl] : [])
        ].join("\n");

    await navigator.clipboard.writeText(summary);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <aside
      className={`pointer-events-auto absolute bottom-4 right-4 top-4 z-20 w-[min(24rem,calc(100vw-2rem))] rounded-[28px] glass-panel transition-transform duration-200 ${
        feature ? "translate-x-0" : "translate-x-[110%]"
      }`}
      aria-hidden={!feature}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-white/8 px-5 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {isHotspot ? "Hotspot" : "Article-derived signal"}
            </p>
            <h2 className="mt-2 text-xl font-semibold text-white">
              {feature ? getDisplayTitle(feature) : "Select a signal"}
            </h2>
            {feature?.properties.country ? (
              <p className="mt-2 text-sm text-muted">
                {feature.properties.country}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="focus-ring rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-muted hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {feature ? (
            <>
              <section className="space-y-3 rounded-[24px] border border-white/8 bg-white/4 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={severityTone}>
                    {feature.properties.severityLabel}
                  </Badge>
                  {isHotspot ? (
                    <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1 text-sm text-white/90">
                      Mentions {feature.properties.hotspotCount ?? 1}
                    </span>
                  ) : null}
                  <span className="text-sm text-white/90">
                    Score {feature.properties.severityScore}
                  </span>
                </div>
                <div className="space-y-1 text-sm text-muted">
                  {!isHotspot ? (
                    <p>{formatRelativeTime(feature.properties.date)}</p>
                  ) : null}
                  <p>{formatTimestamp(feature.properties.date)}</p>
                  <p className="font-medium text-white/90">
                    {feature.properties.locationName || "Location unavailable"}
                    {feature.properties.country
                      ? `, ${feature.properties.country}`
                      : ""}
                  </p>
                  {feature.properties.locationPrecision === "country" ? (
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100/80">
                      Approximate location (country-level)
                    </p>
                  ) : null}
                </div>
              </section>

              {isHotspot ? (
                <section className="space-y-3 rounded-[24px] border border-white/8 bg-white/4 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Top articles
                  </p>
                  {feature.properties.topArticles?.length ? (
                    <>
                      <p className="text-sm text-muted">
                        Showing a few representative articles
                      </p>
                      <div className="space-y-2">
                        {feature.properties.topArticles.map((article) => (
                          <a
                            key={article.url}
                            href={article.url}
                            target="_blank"
                            rel="noreferrer"
                            className="focus-ring block rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-sm text-white transition-colors duration-200 hover:border-white/14 hover:bg-white/8"
                          >
                            {article.title}
                          </a>
                        ))}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      Aggregated hotspot (no direct article links in this view)
                    </p>
                  )}
                </section>
              ) : null}

              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Tags
                </p>
                <div className="flex flex-wrap gap-2">
                  {feature.properties.tags.length > 0 ? (
                    feature.properties.tags.map((tag) => (
                      <Chip key={tag}>{tag}</Chip>
                    ))
                  ) : (
                    <p className="text-sm text-muted">No derived tags.</p>
                  )}
                </div>
              </section>

              <section className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Themes
                </p>
                <div className="flex flex-wrap gap-2">
                  {feature.properties.themes.length > 0 ? (
                    feature.properties.themes.map((theme) => (
                      <Chip key={theme}>{theme}</Chip>
                    ))
                  ) : (
                    <p className="text-sm text-muted">
                      No theme enrichment available.
                    </p>
                  )}
                </div>
              </section>
            </>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted">
              Pick a cluster or event marker to inspect the signal.
            </div>
          )}
        </div>

        <div
          className={`border-t border-white/8 px-5 py-5 ${
            isHotspot ? "" : "grid grid-cols-2 gap-3"
          }`}
        >
          {!isHotspot ? (
            <Button
              variant="primary"
              disabled={!feature?.properties.sourceUrl}
              onClick={() => {
                if (feature?.properties.sourceUrl) {
                  window.open(
                    feature.properties.sourceUrl,
                    "_blank",
                    "noopener,noreferrer"
                  );
                }
              }}
            >
              Open source
            </Button>
          ) : null}
          <Button
            variant={isHotspot ? "primary" : "secondary"}
            className={isHotspot ? "w-full" : undefined}
            disabled={!feature}
            onClick={handleCopy}
          >
            {copied ? "Copied" : "Copy summary"}
          </Button>
        </div>
      </div>
    </aside>
  );
}

function getDisplayTitle(feature: ConflictFeature) {
  if (feature.properties.dataKind === "hotspot") {
    const derivedTitle =
      feature.properties.locationName ??
      feature.properties.title.replace(/^Hotspot:\s*/i, "");

    return derivedTitle || "Hotspot";
  }

  return feature.properties.title;
}
