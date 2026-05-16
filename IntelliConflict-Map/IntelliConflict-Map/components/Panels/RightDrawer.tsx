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

  const displayTitle = getDisplayTitle(feature);
  const originalTitle =
    feature?.properties.wasTranslated &&
    feature.properties.title !== displayTitle
      ? feature.properties.title
      : null;

  async function handleCopy() {
    if (!feature) {
      return;
    }

    const summary = isHotspot
      ? [
          `${displayTitle}, ${
            feature.properties.country || "Unknown country"
          }`,
          `Hotspot mentions: ${feature.properties.hotspotCount ?? 1}`,
          `Severity: ${feature.properties.severityLabel} (${feature.properties.severityScore}/100)`,
          `Window: ${windowValue}`,
          feature.properties.locationPrecision === "country"
            ? "Precision: Approximate location (country-level)"
            : "Precision: Exact point"
        ].join(" — ")
      : [
          displayTitle,
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
      className={`pointer-events-auto absolute bottom-4 right-4 top-4 z-20 w-[min(24rem,calc(100vw-2rem))] rounded-[28px] glass-panel transition-transform duration-[200ms] ease-out motion-reduce:transition-none ${
        feature ? "translate-x-0" : "translate-x-[110%]"
      }`}
      aria-hidden={!feature}
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-white/8 px-5 py-5">
          <div className="min-w-0 flex-1 pr-3">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              {isHotspot ? "Hotspot" : "Article-derived signal"}
            </p>
            <h2 className="mt-2 text-xl font-semibold leading-snug text-white">
              {feature ? displayTitle : "Select a signal"}
            </h2>
            {/* Translation indicator */}
            {feature?.properties.wasTranslated ? (
              <p className="mt-1 text-xs text-muted/70">
                Translated
                {feature.properties.translatedFrom
                  ? ` from ${feature.properties.translatedFrom.toUpperCase()}`
                  : ""}
              </p>
            ) : null}
            {originalTitle ? (
              <p className="mt-1 text-xs italic text-muted/50">
                {originalTitle}
              </p>
            ) : null}
            {feature?.properties.country ? (
              <p className="mt-2 text-sm text-muted">
                {feature.properties.country}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            className="focus-ring flex-shrink-0 rounded-full border border-white/10 bg-white/6 px-3 py-1.5 text-sm text-muted hover:text-white"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {feature ? (
            <>
              {/* Severity section */}
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

                {/* Severity explanation */}
                {feature.properties.severityReasons &&
                feature.properties.severityReasons.length > 0 ? (
                  <div className="space-y-1">
                    {feature.properties.severityReasons.map((reason) => (
                      <p
                        key={reason}
                        className="text-xs leading-snug text-muted/80"
                      >
                        · {reason}
                      </p>
                    ))}
                  </div>
                ) : null}

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

              {/* Top articles section */}
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
                        {feature.properties.topArticles.map((article) => {
                          const articleTitle =
                            article.displayTitle ?? article.title;
                          const isTranslated = article.wasTranslated;
                          return (
                            <a
                              key={article.url}
                              href={article.url}
                              target="_blank"
                              rel="noreferrer"
                              className="focus-ring block rounded-2xl border border-white/8 bg-white/4 px-3 py-3 text-sm text-white transition-colors duration-200 hover:border-white/14 hover:bg-white/8"
                            >
                              {articleTitle}
                              {isTranslated ? (
                                <span className="ml-2 inline-block rounded-full border border-white/10 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted/70">
                                  Translated
                                </span>
                              ) : null}
                            </a>
                          );
                        })}
                      </div>
                    </>
                  ) : (
                    <p className="text-sm text-muted">
                      Aggregated hotspot (no direct article links in this view)
                    </p>
                  )}
                </section>
              ) : null}

              {/* Tags */}
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

              {/* Themes */}
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

function getDisplayTitle(feature: ConflictFeature | null): string {
  if (!feature) return "Select a signal";

  if (feature.properties.dataKind === "hotspot") {
    const derivedTitle =
      feature.properties.locationName ??
      feature.properties.title.replace(/^Hotspot:\s*/i, "");
    return derivedTitle || "Hotspot";
  }

  // For articles, prefer translated displayTitle
  return (
    feature.properties.displayTitle ??
    feature.properties.title
  );
}
