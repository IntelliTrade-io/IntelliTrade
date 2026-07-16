"use client";

import { useMemo } from "react";
import {
  LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, ReferenceLine,
} from "recharts";
import { CURRENCIES, CURRENCY_COLORS } from "./constants";
import type { CCY } from "@/lib/intradayFilters";

// Hero chart. Stable series set: every currency always has its own <Line>; the
// `hide` prop toggles visibility so lines never unmount and remount on toggle.

export type HistoryPoint = { ts: string } & Record<string, number>;

function formatChartTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
}

interface IntradayChartProps {
  points: HistoryPoint[];
  visible: CCY[];
  emphasized: CCY | null;
}

export function IntradayChart({ points, visible, emphasized }: IntradayChartProps) {
  // Render every history point; no thinning (<=96 points).
  const data = useMemo(() => points, [points]);
  const visibleSet = useMemo(() => new Set(visible), [visible]);

  return (
    <div className="relative overflow-hidden rounded-[18px] border border-white/10 bg-[#0a0b0e]">
      <div className="h-[320px] w-full px-2 pb-2 pt-3 md:h-[420px]">
        {data.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-white/25">
            No history yet. Check back after a few scanner runs.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 4, right: 6, left: -18, bottom: 0 }}>
              <XAxis
                dataKey="ts"
                tickFormatter={formatChartTime}
                tick={{ fill: "rgba(255,255,255,0.28)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                minTickGap={40}
              />
              <YAxis
                domain={[-100, 100]}
                ticks={[-100, -50, 0, 50, 100]}
                tick={{ fill: "rgba(255,255,255,0.24)", fontSize: 10 }}
                axisLine={false}
                tickLine={false}
              />
              <ReferenceLine y={0} stroke="rgba(255,255,255,0.12)" strokeDasharray="3 3" />
              <Tooltip
                position={{ y: 0 }}
                allowEscapeViewBox={{ x: false, y: false }}
                wrapperStyle={{ zIndex: 5 }}
                contentStyle={{
                  background: "rgba(9,10,13,0.96)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  borderRadius: 10,
                  padding: "4px 8px",
                  fontSize: 10,
                  lineHeight: 1.25,
                }}
                labelFormatter={(ts: unknown) => formatChartTime(String(ts))}
                formatter={(value, name) => [
                  `${Number(value) > 0 ? "+" : ""}${Number(value).toFixed(1)}`,
                  String(name),
                ]}
                itemStyle={{ color: "rgba(255,255,255,0.7)", padding: 0 }}
                labelStyle={{ color: "rgba(255,255,255,0.45)", marginBottom: 2 }}
              />
              {CURRENCIES.map((c) => {
                const dimmed = emphasized !== null && emphasized !== c;
                return (
                  <Line
                    key={c}
                    type="monotone"
                    dataKey={c}
                    hide={!visibleSet.has(c)}
                    stroke={CURRENCY_COLORS[c]}
                    strokeWidth={emphasized === c ? 2.6 : 1.6}
                    strokeOpacity={dimmed ? 0.18 : 1}
                    dot={false}
                    activeDot={{ r: 3, strokeWidth: 0 }}
                    isAnimationActive={false}
                  />
                );
              })}
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
