import React, { useEffect, useMemo, useRef, useState } from "react";
import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import {
  buildSupportResistanceVisibleLogicalRange,
  getSupportResistanceChartMinHeight,
  getSupportResistanceChartViewportHeight,
} from "./chartSizing";
import { STRENGTH_BAND_OPACITY, dynamicOpportunityGradeConfig } from "./gradeConfig";
import OpportunityGradeBadge from "./OpportunityGradeBadge";
import type { CandleData, StaticZoneStrength, SupportResistanceZone } from "./types";

interface SupportResistanceLightweightChartProps {
  candles: CandleData[];
  zones: SupportResistanceZone[];
  selectedZoneId: string | null;
  onSelectZone?: (zoneId: string) => void;
  compact?: boolean;
}

interface ZoneOverlay {
  id: string;
  label: string;
  grade: SupportResistanceZone["dynamicGrade"];
  strength: StaticZoneStrength;
  left: number;
  top: number;
  width: number;
  height: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function getZoneTimeRange(zone: SupportResistanceZone, candles: CandleData[]) {
  const lastIndex = Math.max(0, candles.length - 1);

  // Anchor the band's left edge to the FIRST candle whose low actually touched
  // the band, and extend to now. This makes the band hug the real interaction
  // instead of stretching full-width across empty space.
  if (candles.length) {
    const touchIndex = candles.findIndex(
      (c) => c.low <= zone.zoneHigh && c.low >= zone.zoneLow,
    );
    if (touchIndex >= 0) {
      return { start: candles[touchIndex]?.time, end: candles[lastIndex]?.time };
    }
  }

  // Fallback: anchor to zone creation time (established level), else full width.
  if (zone.createdTime && candles.length) {
    const createdSec = Math.floor(new Date(zone.createdTime).getTime() / 1000);
    if (Number.isFinite(createdSec)) {
      let startIndex = candles.findIndex((c) => (c.time as number) >= createdSec);
      if (startIndex < 0) startIndex = lastIndex;
      return { start: candles[clamp(startIndex, 0, lastIndex)]?.time, end: candles[lastIndex]?.time };
    }
  }

  const span = zone.previewSpan ?? { start: 0, end: 1 };
  const startIndex = clamp(Math.floor(lastIndex * span.start), 0, lastIndex);
  const endIndex = clamp(Math.ceil(lastIndex * span.end), startIndex, lastIndex);
  return { start: candles[startIndex]?.time, end: candles[endIndex]?.time };
}

export function SupportResistanceLightweightChart({
  candles,
  zones,
  selectedZoneId,
  onSelectZone,
  compact = false,
}: SupportResistanceLightweightChartProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const chartLayerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick", Time> | null>(null);
  const updateOverlaysRef = useRef<(() => void) | null>(null);
  const [overlays, setOverlays] = useState<ZoneOverlay[]>([]);
  const [hoveredZoneId, setHoveredZoneId] = useState<string | null>(null);
  const [chartError, setChartError] = useState<string | null>(null);
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? zones[0] ?? null;
  const latestCandle = candles[candles.length - 1] ?? null;
  const chartMinHeight = getSupportResistanceChartMinHeight(compact);

  const chartData = useMemo(
    () =>
      candles.map((candle) => ({
        time: candle.time as Time,
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
      })),
    [candles],
  );
  const visibleLogicalRange = useMemo(() => buildSupportResistanceVisibleLogicalRange(chartData.length), [chartData.length]);

  useEffect(() => {
    setChartError(null);
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    let unsubscribeVisibleRange: (() => void) | null = null;
    let unsubscribeVisibleLogicalRange: (() => void) | null = null;
    let unsubscribeCrosshair: (() => void) | null = null;
    let animationFrame: number | null = null;
    let scheduleOverlayUpdate: (() => void) | null = null;
    const interactionEvents = ["wheel", "pointerup", "pointermove", "touchmove"] as const;

    async function mountChart() {
      const host = hostRef.current;
      const chartLayer = chartLayerRef.current;
      if (!host || !chartLayer || !chartData.length) {
        return;
      }

      const { CandlestickSeries, ColorType, CrosshairMode, LineStyle, PriceLineSource, createChart } =
        await import("lightweight-charts");

      if (disposed || !hostRef.current || !chartLayerRef.current) {
        return;
      }

      const chart = createChart(chartLayer, {
        width: host.clientWidth,
        height: getSupportResistanceChartViewportHeight(host, chartMinHeight),
        autoSize: true,
        layout: {
          background: { type: ColorType.Solid, color: "transparent" },
          textColor: "rgba(255,255,255,0.56)",
          fontFamily: "Aptos, Segoe UI, sans-serif",
          fontSize: 11,
        },
        grid: {
          vertLines: { color: "rgba(255,255,255,0.05)" },
          horzLines: { color: "rgba(255,255,255,0.07)" },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: "rgba(190,228,255,0.26)", labelBackgroundColor: "#10131a" },
          horzLine: { color: "rgba(190,228,255,0.26)", labelBackgroundColor: "#10131a" },
        },
        localization: {
          priceFormatter: (price: number) => price.toFixed(5),
        },
        rightPriceScale: {
          borderColor: "rgba(255,255,255,0.08)",
          scaleMargins: { top: 0.08, bottom: 0.1 },
        },
        timeScale: {
          borderColor: "rgba(255,255,255,0.08)",
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 3,
          barSpacing: compact ? 9 : 12,
        },
        handleScroll: true,
        handleScale: true,
      });

      const series = chart.addSeries(CandlestickSeries, {
        upColor: "#58D6A6",
        downColor: "#F2687A",
        borderUpColor: "#58D6A6",
        borderDownColor: "#F2687A",
        wickUpColor: "rgba(134,245,201,0.9)",
        wickDownColor: "rgba(255,138,156,0.9)",
        priceLineSource: PriceLineSource.LastBar,
      });

      series.setData(chartData);

      if (latestCandle) {
        series.createPriceLine({
          price: latestCandle.close,
          color: "rgba(190,228,255,0.78)",
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: "Current",
        });
      }

      if (visibleLogicalRange) {
        chart.timeScale().setVisibleLogicalRange(visibleLogicalRange);
      } else {
        chart.timeScale().fitContent();
      }

      chartRef.current = chart;
      seriesRef.current = series;

      scheduleOverlayUpdate = () => {
        if (animationFrame !== null) {
          window.cancelAnimationFrame(animationFrame);
        }

        animationFrame = window.requestAnimationFrame(() => {
          animationFrame = null;
          updateOverlaysRef.current?.();
        });
      };

      const updateOverlays = () => {
        const viewportWidth = host.clientWidth;
        const viewportHeight = getSupportResistanceChartViewportHeight(host, chartMinHeight);

        const nextOverlays = zones.flatMap((zone) => {
          const timeRange = getZoneTimeRange(zone, candles);
          const startX = timeRange.start ? chart.timeScale().timeToCoordinate(timeRange.start as Time) : null;
          const endX = timeRange.end ? chart.timeScale().timeToCoordinate(timeRange.end as Time) : null;
          const topY = series.priceToCoordinate(zone.zoneHigh);
          const bottomY = series.priceToCoordinate(zone.zoneLow);

          if (startX === null || endX === null || topY === null || bottomY === null) {
            return [];
          }

          const rawLeft = Math.min(startX, endX);
          const rawRight = Math.max(startX, endX);
          const rawTop = Math.min(topY, bottomY);
          const rawBottom = Math.max(topY, bottomY);

          if (rawRight < 0 || rawLeft > viewportWidth || rawBottom < 0 || rawTop > viewportHeight) {
            return [];
          }

          const left = clamp(rawLeft, 0, viewportWidth);
          const right = clamp(rawRight, 0, viewportWidth);
          const top = clamp(rawTop, 0, viewportHeight);
          const bottom = clamp(rawBottom, 0, viewportHeight);
          const width = Math.max(12, right - left);
          const height = Math.max(10, bottom - top);
          // Keep the box inside the viewport instead of dropping it when the
          // min-size bump would push it past an edge (thin / edge-of-chart zones).
          const boxLeft = clamp(left, 0, Math.max(0, viewportWidth - width));
          const boxTop = clamp(top, 0, Math.max(0, viewportHeight - height));

          return [
            {
              id: zone.id,
              label: zone.zoneLabel,
              grade: zone.dynamicGrade,
              strength: zone.staticStrength,
              left: boxLeft,
              top: boxTop,
              width,
              height,
            },
          ];
        });

        setOverlays(nextOverlays);
      };

      updateOverlaysRef.current = updateOverlays;
      updateOverlays();

      chart.timeScale().subscribeVisibleTimeRangeChange(scheduleOverlayUpdate);
      unsubscribeVisibleRange = () => scheduleOverlayUpdate && chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleOverlayUpdate);
      chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleOverlayUpdate);
      unsubscribeVisibleLogicalRange = () => scheduleOverlayUpdate && chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleOverlayUpdate);
      chart.subscribeCrosshairMove(scheduleOverlayUpdate);
      unsubscribeCrosshair = () => scheduleOverlayUpdate && chart.unsubscribeCrosshairMove(scheduleOverlayUpdate);
      interactionEvents.forEach((eventName) => {
        chartLayer.addEventListener(eventName, scheduleOverlayUpdate as EventListener, { passive: true });
      });

      resizeObserver = new ResizeObserver(() => {
        chart.resize(host.clientWidth, getSupportResistanceChartViewportHeight(host, chartMinHeight));
        if (visibleLogicalRange) {
          chart.timeScale().setVisibleLogicalRange(visibleLogicalRange);
        }
        scheduleOverlayUpdate?.();
      });
      resizeObserver.observe(host);
    }

    mountChart().catch((err) => {
      if (!disposed) setChartError(err instanceof Error ? err.message : String(err));
    });

    return () => {
      disposed = true;
      unsubscribeVisibleRange?.();
      unsubscribeVisibleLogicalRange?.();
      unsubscribeCrosshair?.();
      resizeObserver?.disconnect();
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      const chartLayer = chartLayerRef.current;
      if (chartLayer && scheduleOverlayUpdate) {
        interactionEvents.forEach((eventName) => {
          chartLayer.removeEventListener(eventName, scheduleOverlayUpdate as EventListener);
        });
      }
      updateOverlaysRef.current = null;
      chartRef.current?.remove();
      chartRef.current = null;
      seriesRef.current = null;
      setOverlays([]);
    };
  }, [candles, chartData, chartMinHeight, latestCandle, visibleLogicalRange, zones]);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      updateOverlaysRef.current?.();
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [selectedZoneId]);

  return (
    <section className="flex min-h-0 flex-col overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,12,18,0.98),rgba(5,7,11,0.98))] shadow-[0_24px_60px_rgba(0,0,0,0.32)]">
      <div className="flex flex-col gap-3 border-b border-white/8 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-white/34">Lightweight chart overlay</div>
          <h3 className="mt-1 text-lg font-semibold text-white">EURUSD Support Reclaim Alpha</h3>
          <p className="mt-1 text-sm text-white/44">Live EURUSD M15 support-zone context. Resistance zones and more pairs are coming later.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-[10px] uppercase tracking-[0.18em] text-white/60">
            Alpha: EURUSD support only
          </span>
          {selectedZone ? <OpportunityGradeBadge grade={selectedZone.dynamicGrade} compact /> : null}
        </div>
      </div>

      <div ref={hostRef} className="relative isolate min-h-0 w-full flex-1 overflow-hidden" style={{ minHeight: `${chartMinHeight}px` }}>
        <div ref={chartLayerRef} className="absolute inset-0" />

        {chartError ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center text-sm text-rose-100/80">
            Chart failed to render: {chartError}
          </div>
        ) : !chartData.length ? (
          <div className="absolute inset-0 z-30 flex items-center justify-center px-6 text-center text-sm text-white/50">
            Waiting for EURUSD candle data…
          </div>
        ) : null}

        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {overlays.map((overlay) => {
            const config = dynamicOpportunityGradeConfig[overlay.grade];
            const selected = overlay.id === selectedZoneId;
            const hovered = overlay.id === hoveredZoneId;
            const mutedGrade = overlay.grade === "blue" || overlay.grade === "watch" || overlay.grade === "blocked";
            const lowPriorityGrade = overlay.grade === "blue" || overlay.grade === "blocked";
            const selectedBorder = overlay.grade === "a_plus" ? "rgba(247,227,140,0.95)" : "rgba(255,255,255,0.82)";

            return (
              <button
                key={overlay.id}
                type="button"
                onClick={() => onSelectZone?.(overlay.id)}
                onMouseEnter={() => setHoveredZoneId(overlay.id)}
                onMouseLeave={() => setHoveredZoneId(null)}
                aria-label={`${config.label} ${overlay.label}`}
                title={`${config.label}: ${config.description}`}
                className={[
                  "pointer-events-auto absolute overflow-hidden rounded-[6px] border text-left transition-all",
                  selected
                    ? "z-20 shadow-[0_0_0_1px_rgba(255,255,255,0.72),0_0_24px_rgba(255,255,255,0.16)]"
                    : hovered
                      ? "z-20 brightness-110"
                      : "z-10",
                ].join(" ")}
                style={{
                  left: `${overlay.left}px`,
                  top: `${overlay.top}px`,
                  width: `${overlay.width}px`,
                  height: `${overlay.height}px`,
                  background: config.chartFill,
                  borderColor: selected ? selectedBorder : config.chartStroke,
                  borderStyle: selected ? "solid" : mutedGrade ? "dashed" : "solid",
                  // Premium outer glow only for elite_green + a_plus (config.glow is
                  // empty for the rest). Selection ring is handled by className.
                  boxShadow: selected ? undefined : config.glow || undefined,
                  // Static strength sets the base visibility (weak subdued → strong
                  // bright); unqualified grades are further muted on top of that.
                  opacity: selected
                    ? 1
                    : hovered
                      ? 0.9
                      : STRENGTH_BAND_OPACITY[overlay.strength] * (lowPriorityGrade ? 0.55 : mutedGrade ? 0.7 : 0.85),
                }}
              >
                {selected ? (
                  <span className="absolute left-2 top-1 flex max-w-[calc(100%-1rem)] items-center gap-2">
                    {overlay.grade === "a_plus" ? (
                      <span className="rounded-full border border-[#F7E38C]/28 bg-[#F7E38C]/[0.12] px-1.5 py-0.5 text-[9px] font-semibold text-[#FFF1B1]">
                        A+
                      </span>
                    ) : null}
                    <span className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-white/88">
                      {config.shortLabel} / {overlay.label}
                    </span>
                  </span>
                ) : (
                  <>
                    <span
                      className={[
                        "absolute left-2 top-1.5 h-2 w-2 rounded-full border",
                        mutedGrade ? "border-white/24 bg-white/18" : "border-white/38 bg-white/34",
                      ].join(" ")}
                    />
                    {hovered ? (
                      <span className="absolute left-5 top-0.5 max-w-[calc(100%-1.5rem)] truncate rounded-full border border-white/12 bg-[#080a0f]/90 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.14em] text-white/72 shadow-[0_10px_24px_rgba(0,0,0,0.28)]">
                        {config.shortLabel}
                      </span>
                    ) : null}
                  </>
                )}
              </button>
            );
          })}
        </div>

        {selectedZone?.dynamicGrade === "a_plus" ? (
          <div className="absolute bottom-2 left-3 right-3 rounded-[8px] border border-[#F7E38C]/16 bg-[#0b0b10]/88 px-3 py-1.5 text-xs leading-relaxed text-[#FFF1B1] shadow-[0_16px_34px_rgba(0,0,0,0.32)] backdrop-blur-xl sm:right-auto sm:max-w-sm">
            Highest-quality short-term first-reaction setup, not a reversal call.
          </div>
        ) : null}
      </div>
    </section>
  );
}

export default SupportResistanceLightweightChart;
