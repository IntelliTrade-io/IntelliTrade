"use client";

// Candlestick chart for a completed review (lightweight-charts, client-only).
// Shows the approved candle range with a "Scan captured" marker at the reference
// candle and a dashed reference-price line. No strength overlay line, and no
// entry/stop/target artifacts of any kind. A visually-hidden summary keeps the
// data accessible when the canvas cannot be read.
import { useEffect, useRef } from "react";
import type { IChartApi } from "lightweight-charts";
import type { ReviewCandleDto } from "@/lib/api/csmReviews";

interface Props {
  candles: ReviewCandleDto[];
  referenceClose: number;
  referenceCloseTime: string;
  pairSymbol: string;
  summary: string;
}

export function ReviewChart({
  candles,
  referenceClose,
  referenceCloseTime,
  pairSymbol,
  summary,
}: Props) {
  const hostRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;
    let chart: IChartApi | null = null;

    async function mount() {
      const host = hostRef.current;
      if (!host || candles.length === 0) return;

      const {
        CandlestickSeries,
        ColorType,
        LineStyle,
        createChart,
        createSeriesMarkers,
      } = await import("lightweight-charts");
      if (disposed || !hostRef.current) return;

      chart = createChart(host, {
        width: host.clientWidth,
        height: host.clientHeight || 360,
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
        rightPriceScale: { borderColor: "rgba(255,255,255,0.08)" },
        timeScale: {
          borderColor: "rgba(255,255,255,0.08)",
          timeVisible: true,
          secondsVisible: false,
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
      });
      series.setData(
        candles.map((c) => ({ time: c.time as never, open: c.o, high: c.h, low: c.l, close: c.c })),
      );

      series.createPriceLine({
        price: referenceClose,
        color: "rgba(190,228,255,0.78)",
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: true,
        title: "Reference",
      });

      const referenceOpenSec = Math.floor(Date.parse(referenceCloseTime) / 1000) - 4 * 3600;
      createSeriesMarkers(series, [
        {
          time: referenceOpenSec as never,
          position: "aboveBar",
          color: "rgba(190,228,255,0.9)",
          shape: "arrowDown",
          text: "Scan captured",
        },
      ]);

      chart.timeScale().fitContent();
    }

    mount();
    return () => {
      disposed = true;
      if (chart) chart.remove();
    };
  }, [candles, referenceClose, referenceCloseTime]);

  return (
    <figure className="m-0">
      <div
        ref={hostRef}
        role="img"
        aria-label={`${pairSymbol} four-hour candles for the review window`}
        className="h-[340px] w-full lg:h-[420px]"
      />
      <figcaption className="sr-only">{summary}</figcaption>
    </figure>
  );
}
