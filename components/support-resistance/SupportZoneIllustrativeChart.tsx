"use client";

import React, { useEffect, useRef } from "react";

type GradeKey =
  | "blocked"
  | "informational"
  | "watch"
  | "green"
  | "elite"
  | "aPlus";

type Candle = {
  open: number;
  high: number;
  low: number;
  close: number;
};

type Zone = {
  key: GradeKey;
  low: number;
  high: number;
  start: number;
  end: number;
};

type LongPosition = {
  key: "green" | "elite" | "aPlus";
  entry: number;
  stop: number;
  target: number;
  start: number;
  end: number;
  label: string;
};

const COLORS: Record<
  GradeKey,
  {
    label: string;
    color: string;
    border: string;
    fill: string;
    glow: string;
    badgeBackground: string;
  }
> = {
  blocked: {
    label: "BLOCKED",
    color: "#FB7185",
    border: "rgba(251, 113, 133, 0.74)",
    fill: "rgba(190, 24, 93, 0.15)",
    glow: "rgba(251, 113, 133, 0.18)",
    badgeBackground: "rgba(7, 10, 17, 0.84)",
  },
  informational: {
    label: "INFORMATIONAL",
    color: "#94A3B8",
    border: "rgba(148, 163, 184, 0.60)",
    fill: "rgba(100, 116, 139, 0.12)",
    glow: "rgba(148, 163, 184, 0.14)",
    badgeBackground: "rgba(7, 10, 17, 0.84)",
  },
  watch: {
    label: "WATCH",
    color: "#F59E0B",
    border: "rgba(245, 158, 11, 0.80)",
    fill: "rgba(245, 158, 11, 0.14)",
    glow: "rgba(245, 158, 11, 0.18)",
    badgeBackground: "rgba(7, 10, 17, 0.84)",
  },
  // Green (lower tier) = deeper emerald; Elite Green (higher tier) = brighter
  // mint, matching GRADE_TOKENS, so the stronger grade always reads brighter.
  green: {
    label: "GREEN",
    color: "#10B981",
    border: "rgba(16, 185, 129, 0.94)",
    fill: "rgba(4, 120, 87, 0.22)",
    glow: "rgba(16, 185, 129, 0.30)",
    badgeBackground: "rgba(6, 78, 59, 0.32)",
  },
  elite: {
    label: "ELITE GREEN",
    color: "#86EFAC",
    border: "rgba(134, 239, 172, 0.80)",
    fill: "rgba(74, 222, 128, 0.14)",
    glow: "rgba(74, 222, 128, 0.20)",
    badgeBackground: "rgba(7, 10, 17, 0.84)",
  },
  aPlus: {
    label: "A+",
    color: "#8B5CF6",
    border: "rgba(139, 92, 246, 0.98)",
    fill: "rgba(124, 58, 237, 0.22)",
    glow: "rgba(139, 92, 246, 0.50)",
    badgeBackground: "rgba(76, 29, 149, 0.36)",
  },
};

const ZONES: Zone[] = [
  { key: "blocked", low: 1.08715, high: 1.08755, start: 5, end: 31 },
  { key: "informational", low: 1.08605, high: 1.08642, start: 18, end: 48 },
  { key: "watch", low: 1.08465, high: 1.08502, start: 35, end: 67 },

  // Post-structure-shift zones are intentionally spaced farther apart.
  { key: "green", low: 1.0834, high: 1.08375, start: 78, end: 103 },
  { key: "elite", low: 1.08395, high: 1.0843, start: 108, end: 136 },
  { key: "aPlus", low: 1.08495, high: 1.08535, start: 140, end: 168 },
];

const LONG_POSITIONS: LongPosition[] = [
  {
    key: "green",
    entry: 1.08368,
    stop: 1.08314,
    target: 1.08495,
    start: 89,
    end: 102,
    label: "Illustrative long",
  },
  {
    key: "elite",
    entry: 1.08422,
    stop: 1.08368,
    target: 1.08605,
    start: 119,
    end: 134,
    label: "Illustrative long",
  },
  {
    key: "aPlus",
    entry: 1.08528,
    stop: 1.08468,
    target: 1.0882,
    start: 147,
    end: 168,
    label: "Illustrative long",
  },
];

const ANCHORS: Array<[number, number]> = [
  [0, 1.08945],
  [12, 1.08805],
  [25, 1.08635],
  [39, 1.0849],
  [50, 1.0834],
  [61, 1.08445],
  [68, 1.08365],
  [77, 1.08495],
  [89, 1.08355],
  [98, 1.08505],
  [112, 1.08412],
  [124, 1.08615],
  [139, 1.08516],
  [153, 1.0874],
  [168, 1.08845],
];

function seededRandom(seed: number) {
  let state = seed >>> 0;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function interpolateBaseline(index: number) {
  for (let i = 0; i < ANCHORS.length - 1; i += 1) {
    const [x0, y0] = ANCHORS[i]!;
    const [x1, y1] = ANCHORS[i + 1]!;

    if (index >= x0 && index <= x1) {
      const t = (index - x0) / (x1 - x0);
      const smooth = t * t * (3 - 2 * t);
      return y0 + (y1 - y0) * smooth;
    }
  }

  return ANCHORS[ANCHORS.length - 1]![1];
}

function createIllustrativeCandles(): Candle[] {
  const random = seededRandom(96241);
  const candles: Candle[] = [];
  let previousClose = interpolateBaseline(0);

  const forcedCloses: Record<number, number> = {
    20: 1.08702,
    35: 1.08592,
    49: 1.08452,
    50: 1.08342,

    // Lower high, higher low, then a decisive close through the prior swing high.
    61: 1.08442,
    68: 1.08368,
    75: 1.08458,
    76: 1.08498,
    77: 1.08512,

    // Green: first post-break pullback and measured bounce.
    88: 1.08378,
    89: 1.08356,
    90: 1.08402,
    94: 1.08472,
    98: 1.08506,

    // Elite Green: higher low and stronger extension.
    111: 1.08438,
    112: 1.08412,
    113: 1.08462,
    118: 1.08535,
    124: 1.08616,

    // A+: highest post-break support, largest reaction and sustained uptrend.
    138: 1.08548,
    139: 1.08516,
    140: 1.08572,
    146: 1.08665,
    153: 1.08742,
    161: 1.08805,
    168: 1.08845,
  };

  for (let i = 0; i < 169; i += 1) {
    const baseline = interpolateBaseline(i);
    const open =
      i === 0
        ? baseline + 0.00008
        : previousClose + (random() - 0.5) * 0.00013;

    let close = baseline + (random() - 0.5) * 0.0002;

    const forcedClose = forcedCloses[i];
    if (forcedClose !== undefined) {
      close = forcedClose;
    }

    let high = Math.max(open, close) + 0.00011 + random() * 0.00018;
    let low = Math.min(open, close) - 0.00011 - random() * 0.00018;

    if (i === 139) {
      low = 1.08503;
      high = Math.max(open, close) + 0.00017;
    }

    if (i >= 140) {
      low = Math.max(low, 1.08505);
    }

    candles.push({ open, high, low, close });
    previousClose = close;
  }

  return candles;
}

function roundedRectPath(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
) {
  const r = Math.min(radius, width / 2, height / 2);

  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function drawBadge(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string,
  background: string,
  border: string,
  glow: string
) {
  context.save();
  context.font = "800 10px Inter, ui-sans-serif, system-ui, sans-serif";

  const width = context.measureText(text).width + 20;
  const height = 24;

  roundedRectPath(context, x, y, width, height, 12);
  context.fillStyle = background;
  context.shadowColor = glow;
  context.shadowBlur = text.startsWith("A+") ? 18 : 8;
  context.fill();

  context.strokeStyle = border;
  context.lineWidth = 1;
  context.stroke();

  context.shadowBlur = 0;
  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, x + 10, y + height / 2 + 0.5);
  context.restore();
}

/**
 * Zone badges live in a dedicated lane at the top of the canvas (one row on
 * wide charts, two staggered rows on narrow ones) with a thin dashed leader
 * line tracing down to each zone. Keeps the plot area itself uncluttered.
 */
function drawZoneBadgeLane(
  context: CanvasRenderingContext2D,
  x: (index: number) => number,
  y: (price: number) => number,
  width: number,
  padding: { left: number; right: number },
  rows: number
) {
  const laneTop = 10;
  const badgeHeight = 24;
  const rowGap = 6;
  const gap = 8;
  const minX = padding.left;
  const maxX = width - padding.right;

  context.save();
  context.font = "800 10px Inter, ui-sans-serif, system-ui, sans-serif";

  const items = ZONES.map((zone, index) => {
    const grade = COLORS[zone.key];
    const anchorX = (x(zone.start) + x(zone.end)) / 2;
    const badgeWidth = context.measureText(grade.label).width + 20;

    return {
      zone,
      grade,
      anchorX,
      width: badgeWidth,
      x: anchorX - badgeWidth / 2,
      row: rows === 2 ? index % 2 : 0,
    };
  });

  // Per row: clamp into the plot, resolve overlaps left-to-right, then sweep
  // back right-to-left so nothing hangs past the right edge.
  for (let row = 0; row < rows; row += 1) {
    const rowItems = items.filter((item) => item.row === row);

    rowItems.forEach((item) => {
      item.x = Math.min(Math.max(item.x, minX), maxX - item.width);
    });

    for (let i = 1; i < rowItems.length; i += 1) {
      const previous = rowItems[i - 1]!;
      const current = rowItems[i]!;

      if (current.x < previous.x + previous.width + gap) {
        current.x = previous.x + previous.width + gap;
      }
    }

    let limit = maxX;
    for (let i = rowItems.length - 1; i >= 0; i -= 1) {
      const current = rowItems[i]!;
      current.x = Math.min(current.x, limit - current.width);
      limit = current.x - gap;
    }
  }

  // Leader lines first, badges second, so a line never crosses over a badge.
  items.forEach((item) => {
    const badgeY = laneTop + item.row * (badgeHeight + rowGap);
    const zoneTopY = y(item.zone.high);

    context.save();
    context.strokeStyle = item.grade.border;
    context.globalAlpha = 0.45;
    context.lineWidth = 1;
    context.setLineDash([2, 4]);
    context.beginPath();
    context.moveTo(item.x + item.width / 2, badgeY + badgeHeight + 2);
    context.lineTo(item.anchorX, zoneTopY - 4);
    context.stroke();
    context.setLineDash([]);

    context.globalAlpha = 1;
    context.fillStyle = item.grade.color;
    context.beginPath();
    context.arc(item.anchorX, zoneTopY - 4, 2.2, 0, Math.PI * 2);
    context.fill();
    context.restore();
  });

  items.forEach((item) => {
    const badgeY = laneTop + item.row * (badgeHeight + rowGap);

    drawBadge(
      context,
      item.grade.label,
      item.x,
      badgeY,
      item.grade.color,
      item.grade.badgeBackground,
      item.grade.border,
      item.grade.glow
    );
  });

  context.restore();
}

function drawCallout(
  context: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color: string
) {
  context.save();
  context.font = "700 10px Inter, ui-sans-serif, system-ui, sans-serif";

  const width = context.measureText(text).width + 18;
  const height = 24;

  roundedRectPath(context, x, y, width, height, 12);
  context.fillStyle = "rgba(5, 9, 20, 0.86)";
  context.fill();

  context.strokeStyle = color;
  context.globalAlpha = 0.84;
  context.stroke();
  context.globalAlpha = 1;

  context.fillStyle = color;
  context.textBaseline = "middle";
  context.fillText(text, x + 9, y + height / 2 + 0.5);
  context.restore();
}

function drawLongPosition(
  context: CanvasRenderingContext2D,
  position: LongPosition,
  x: (index: number) => number,
  y: (price: number) => number
) {
  const grade = COLORS[position.key];
  const startX = x(position.start);
  const endX = x(position.end);
  const width = Math.max(46, endX - startX);

  const targetY = y(position.target);
  const entryY = y(position.entry);
  const stopY = y(position.stop);

  context.save();

  // Reward area
  context.fillStyle =
    position.key === "aPlus"
      ? "rgba(139, 92, 246, 0.12)"
      : "rgba(34, 197, 94, 0.11)";
  context.fillRect(startX, targetY, width, entryY - targetY);

  context.strokeStyle =
    position.key === "aPlus"
      ? "rgba(167, 139, 250, 0.70)"
      : "rgba(134, 239, 172, 0.58)";
  context.lineWidth = 1;
  context.strokeRect(startX, targetY, width, entryY - targetY);

  // Risk area
  context.fillStyle = "rgba(248, 113, 113, 0.10)";
  context.fillRect(startX, entryY, width, stopY - entryY);

  context.strokeStyle = "rgba(248, 113, 113, 0.48)";
  context.strokeRect(startX, entryY, width, stopY - entryY);

  // Entry line
  context.strokeStyle = grade.color;
  context.setLineDash([4, 4]);
  context.beginPath();
  context.moveTo(startX, entryY);
  context.lineTo(startX + width, entryY);
  context.stroke();

  context.setLineDash([]);

  context.fillStyle = "rgba(226, 232, 240, 0.70)";
  context.font = "700 8px Inter, ui-sans-serif, system-ui, sans-serif";
  context.fillText("TARGET", startX + width - 40, targetY + 11);
  context.fillText("ENTRY", startX + width - 34, entryY - 4);
  context.fillText("STOP", startX + width - 28, stopY - 4);

  context.restore();
}

/**
 * "ILLUSTRATIVE LONG" title pill for a long position. Drawn in a late pass —
 * after the candles and callouts — so it always sits on top (highest z), and
 * positioned just above the reward box so it never overlaps the box contents.
 */
function drawLongLabel(
  context: CanvasRenderingContext2D,
  position: LongPosition,
  x: (index: number) => number,
  y: (price: number) => number
) {
  const grade = COLORS[position.key];
  const startX = x(position.start);
  const targetY = y(position.target);

  const labelText = position.label.toUpperCase();
  context.save();
  context.font = "800 9px Inter, ui-sans-serif, system-ui, sans-serif";

  const labelWidth = context.measureText(labelText).width + 14;
  const labelHeight = 17;
  const labelX = startX + 4;
  const labelY = targetY - labelHeight - 4;

  roundedRectPath(context, labelX, labelY, labelWidth, labelHeight, 8);
  context.fillStyle = "rgba(5, 9, 20, 0.92)";
  context.fill();
  context.strokeStyle = grade.border;
  context.globalAlpha = 0.75;
  context.lineWidth = 1;
  context.stroke();
  context.globalAlpha = 1;

  context.fillStyle = grade.color;
  context.textBaseline = "middle";
  context.fillText(labelText, labelX + 7, labelY + labelHeight / 2 + 0.5);
  context.restore();
}

function drawChart(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  time: number,
  reducedMotion: boolean
) {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const pixelWidth = Math.floor(rect.width * dpr);
  const pixelHeight = Math.floor(rect.height * dpr);

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  const context = canvas.getContext("2d");
  if (!context) return;

  context.setTransform(dpr, 0, 0, dpr, 0, 0);

  const width = rect.width;
  const height = rect.height;

  // Reserve room at the top for the zone-badge lane (two staggered rows on
  // narrow charts, one row otherwise).
  const badgeLaneRows = width < 700 ? 2 : 1;
  const padding = {
    left: 28,
    right: 88,
    top: badgeLaneRows === 2 ? 92 : 64,
    bottom: 36,
  };
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;

  const minimumPrice = 1.08275;
  const maximumPrice = 1.09005;

  const x = (index: number) =>
    padding.left + (index / (candles.length - 1)) * plotWidth;

  const y = (price: number) =>
    padding.top +
    ((maximumPrice - price) / (maximumPrice - minimumPrice)) * plotHeight;

  context.clearRect(0, 0, width, height);

  const background = context.createLinearGradient(0, 0, 0, height);
  background.addColorStop(0, "#08101C");
  background.addColorStop(0.55, "#07101A");
  background.addColorStop(1, "#050914");

  context.fillStyle = background;
  context.fillRect(0, 0, width, height);

  const bloom = context.createRadialGradient(
    width * 0.74,
    height * 0.76,
    0,
    width * 0.74,
    height * 0.76,
    Math.max(width, height) * 0.54
  );

  bloom.addColorStop(0, "rgba(124, 58, 237, 0.14)");
  bloom.addColorStop(0.44, "rgba(16, 185, 129, 0.04)");
  bloom.addColorStop(1, "rgba(0, 0, 0, 0)");

  context.fillStyle = bloom;
  context.fillRect(0, 0, width, height);

  context.save();
  context.strokeStyle = "rgba(148, 163, 184, 0.10)";
  context.setLineDash([3, 6]);
  context.lineWidth = 1;

  for (let i = 0; i <= 5; i += 1) {
    const gridY = padding.top + (plotHeight * i) / 5;
    context.beginPath();
    context.moveTo(padding.left, gridY);
    context.lineTo(width - padding.right, gridY);
    context.stroke();
  }

  for (let i = 0; i <= 6; i += 1) {
    const gridX = padding.left + (plotWidth * i) / 6;
    context.beginPath();
    context.moveTo(gridX, padding.top);
    context.lineTo(gridX, height - padding.bottom);
    context.stroke();
  }

  context.restore();

  ZONES.forEach((zone) => {
    const grade = COLORS[zone.key];
    const zoneX = x(zone.start);
    const zoneWidth = Math.max(30, x(zone.end) - zoneX);
    const zoneY = y(zone.high);
    const zoneHeight = Math.max(14, y(zone.low) - zoneY);

    context.save();

    if (zone.key === "aPlus") {
      const pulse = reducedMotion ? 0 : (Math.sin(time / 480) + 1) / 2;
      context.shadowColor = grade.glow;
      context.shadowBlur = 20 + pulse * 10;
    } else if (zone.key === "elite") {
      context.shadowColor = grade.glow;
      context.shadowBlur = 12;
    }

    const gradient = context.createLinearGradient(
      zoneX,
      zoneY,
      zoneX + zoneWidth,
      zoneY
    );

    gradient.addColorStop(0, grade.fill);
    gradient.addColorStop(0.78, grade.fill);
    gradient.addColorStop(1, "rgba(255, 255, 255, 0.01)");

    roundedRectPath(context, zoneX, zoneY, zoneWidth, zoneHeight, 9);
    context.fillStyle = gradient;
    context.fill();

    context.strokeStyle = grade.border;
    context.lineWidth = zone.key === "aPlus" ? 1.7 : 1;

    if (zone.key !== "aPlus" && zone.key !== "elite") {
      context.setLineDash([4, 5]);
    }

    context.stroke();
    context.restore();
  });

  LONG_POSITIONS.forEach((position) => {
    drawLongPosition(context, position, x, y);
  });

  const candleStep = plotWidth / candles.length;
  const candleBodyWidth = Math.max(2.4, Math.min(6.5, candleStep * 0.54));

  candles.forEach((candle, index) => {
    const candleX = x(index);
    const openY = y(candle.open);
    const closeY = y(candle.close);
    const highY = y(candle.high);
    const lowY = y(candle.low);
    const bullish = candle.close >= candle.open;
    const color = bullish ? "#7DD3FC" : "#F87171";

    context.save();
    context.strokeStyle = color;
    context.fillStyle = bullish
      ? "rgba(125, 211, 252, 0.84)"
      : "rgba(248, 113, 113, 0.86)";
    context.lineWidth = 1.05;

    context.beginPath();
    context.moveTo(candleX, highY);
    context.lineTo(candleX, lowY);
    context.stroke();

    const bodyY = Math.min(openY, closeY);
    const bodyHeight = Math.max(1.7, Math.abs(closeY - openY));

    context.fillRect(
      candleX - candleBodyWidth / 2,
      bodyY,
      candleBodyWidth,
      bodyHeight
    );

    context.restore();
  });

  const latestCandle = candles[candles.length - 1]!;
  const currentPriceY = y(latestCandle.close);

  context.save();
  context.strokeStyle = "rgba(125, 211, 252, 0.48)";
  context.setLineDash([4, 5]);
  context.beginPath();
  context.moveTo(padding.left, currentPriceY);
  context.lineTo(width - padding.right, currentPriceY);
  context.stroke();
  context.restore();

  context.save();
  context.font = "600 10px Inter, ui-sans-serif, system-ui, sans-serif";
  context.textAlign = "right";
  context.fillStyle = "rgba(226, 232, 240, 0.78)";

  for (let i = 0; i <= 5; i += 1) {
    const price =
      maximumPrice - ((maximumPrice - minimumPrice) * i) / 5;

    context.fillText(price.toFixed(4), width - 14, y(price) + 3);
  }

  context.restore();

  context.save();
  const currentPriceText = latestCandle.close.toFixed(4);
  context.font = "800 10px Inter, ui-sans-serif, system-ui, sans-serif";

  const currentPriceWidth = context.measureText(currentPriceText).width + 18;

  roundedRectPath(
    context,
    width - padding.right + 6,
    currentPriceY - 12,
    currentPriceWidth,
    24,
    12
  );

  context.fillStyle = "rgba(3, 105, 161, 0.28)";
  context.fill();
  context.strokeStyle = "rgba(125, 211, 252, 0.65)";
  context.stroke();

  context.fillStyle = "#BAE6FD";
  context.textAlign = "left";
  context.textBaseline = "middle";
  context.fillText(
    currentPriceText,
    width - padding.right + 15,
    currentPriceY + 0.5
  );

  context.restore();

  drawZoneBadgeLane(context, x, y, width, padding, badgeLaneRows);

  drawCallout(context, "weak zones break", x(20), y(1.08772), "#FB7185");
  drawCallout(context, "small hesitation", x(48), y(1.08525), "#F59E0B");
  drawCallout(context, "high bounce", x(89), y(1.08425), "#10B981");
  drawCallout(context, "stronger bounce", x(112), y(1.08485), "#86EFAC");
  drawCallout(context, "largest bounce", x(139), y(1.0860), "#A78BFA");

  // Top z-layer: long-position titles sit above their boxes, over everything.
  LONG_POSITIONS.forEach((position) => {
    drawLongLabel(context, position, x, y);
  });
}

export type SupportZoneIllustrativeChartProps = {
  className?: string;
};

export default function SupportZoneIllustrativeChart({
  className = "",
}: SupportZoneIllustrativeChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const candlesRef = useRef<Candle[]>(createIllustrativeCandles());

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;

    const resizeObserver = new ResizeObserver(() => {
      drawChart(canvas, candlesRef.current, 0, reducedMotion);
    });

    resizeObserver.observe(canvas);

    const animate = (time: number) => {
      drawChart(canvas, candlesRef.current, time, reducedMotion);
      animationFrameRef.current = window.requestAnimationFrame(animate);
    };

    animationFrameRef.current = window.requestAnimationFrame(animate);

    return () => {
      resizeObserver.disconnect();

      if (animationFrameRef.current !== null) {
        window.cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, []);

  return (
    <section
      className={`it-support-zone-chart ${className}`}
      aria-label="Illustrative EURUSD M15 support-zone chart"
    >
      <style>{styles}</style>

      <canvas
        ref={canvasRef}
        className="it-support-zone-chart__canvas"
        aria-label="Illustrative EURUSD M15 candlestick chart. The opening sequence is a downtrend that breaks weaker support zones. A bullish structure break occurs in the middle before Green, Elite Green, and A+ support zones appear as progressively higher lows with progressively larger bounces. Illustrative long-position tools are shown on the strong zones."
      />

      <div className="it-support-zone-chart__caption">
        <strong>EURUSD · M15</strong>
        <span>Illustrative preview</span>
      </div>
    </section>
  );
}

const styles = `
  .it-support-zone-chart,
  .it-support-zone-chart * {
    box-sizing: border-box;
  }

  .it-support-zone-chart {
    position: relative;
    width: 100%;
    min-height: 610px;
    overflow: hidden;
    border: 1px solid rgba(148, 163, 184, 0.14);
    border-radius: 24px;
    background: #050914;
    box-shadow:
      inset 0 1px 0 rgba(255, 255, 255, 0.035),
      0 26px 82px rgba(0, 0, 0, 0.34);
  }

  .it-support-zone-chart__canvas {
    display: block;
    width: 100%;
    height: 610px;
  }

  .it-support-zone-chart__caption {
    position: absolute;
    bottom: 12px;
    left: 16px;
    display: inline-flex;
    align-items: center;
    gap: 9px;
    padding: 8px 11px;
    color: #CBD5E1;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 999px;
    background: rgba(5, 9, 20, 0.74);
    backdrop-filter: blur(12px);
    font-size: 0.69rem;
    font-weight: 800;
    letter-spacing: 0.10em;
    text-transform: uppercase;
  }

  .it-support-zone-chart__caption strong {
    color: #E2E8F0;
    font: inherit;
  }

  .it-support-zone-chart__caption span {
    color: #94A3B8;
    font-weight: 650;
  }

  @media (max-width: 700px) {
    .it-support-zone-chart,
    .it-support-zone-chart__canvas {
      min-height: 560px;
      height: 560px;
    }
  }

  @media (max-width: 420px) {
    .it-support-zone-chart,
    .it-support-zone-chart__canvas {
      min-height: 540px;
      height: 540px;
    }

    .it-support-zone-chart__caption {
      left: 10px;
      right: 10px;
      justify-content: center;
    }
  }
`;
