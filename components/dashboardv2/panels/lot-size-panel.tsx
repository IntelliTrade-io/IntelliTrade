"use client";

import { useMemo, useState } from "react";
import { Calculator, CandlestickChart, DollarSign, Percent, Shield, Target } from "lucide-react";
import { cn } from "@/lib/utils";
import { WidgetShell } from "../ui/widget-shell";
import { Field, Pill, ResultTile } from "../ui/primitives";
import { PanelActions } from "../ui/panel-actions";
import type { Panel } from "../types";

interface LotSizePanelProps {
  panel: Panel;
  workspaceCols?: number;
  onToggleLock: () => void;
  onRemove: () => void;
}

type FormKey =
  | "accountSize"
  | "riskPercent"
  | "stopLossPips"
  | "entryPrice"
  | "stopPrice"
  | "pair"
  | "accountCurrency";

function DashboardInput({
  value,
  onChange,
  suffix,
  type = "text",
}: {
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  suffix?: string;
  type?: string;
}) {
  return (
    <div className="relative">
      <input
        type={type}
        value={value}
        onChange={onChange}
        className="h-11 w-full rounded-[16px] border border-white/10 bg-white/[0.035] px-4 pr-14 text-white outline-none transition-all focus:border-violet-400/22 focus:bg-white/[0.05]"
      />
      {suffix ? (
        <div className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-white/38">
          {suffix}
        </div>
      ) : null}
    </div>
  );
}

function DashboardSelect({ value }: { value: string }) {
  return (
    <button className="flex h-11 w-full items-center justify-between rounded-[16px] border border-white/10 bg-white/[0.035] px-4 text-left text-white transition-all hover:border-white/18">
      <span>{value}</span>
    </button>
  );
}

export function LotSizePanel({ panel, workspaceCols = 12, onToggleLock, onRemove }: LotSizePanelProps) {
  const [form, setForm] = useState<Record<FormKey, string>>({
    accountSize: "10000",
    riskPercent: "1",
    stopLossPips: "25",
    entryPrice: "1.0840",
    stopPrice: "1.0815",
    pair: "EUR/USD",
    accountCurrency: "USD",
  });

  const calculations = useMemo(() => {
    const accountSize = Number(form.accountSize) || 0;
    const riskPercent = Number(form.riskPercent) || 0;
    const stopLossPips = Number(form.stopLossPips) || 0;
    const riskAmount = accountSize * (riskPercent / 100);
    const pipValuePerLot = 10;
    const lotSize = stopLossPips > 0 ? riskAmount / (stopLossPips * pipValuePerLot) : 0;
    return {
      riskAmount: riskAmount.toFixed(2),
      lotSize: lotSize.toFixed(2),
      units: Math.round(lotSize * 100000).toLocaleString(),
      miniLots: (lotSize * 10).toFixed(1),
      pipValuePerLot: pipValuePerLot.toFixed(2),
    };
  }, [form]);

  const update = (key: FormKey) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const layoutClass = panel.w / workspaceCols >= 0.42 ? "xl:grid-cols-[1fr_0.92fr]" : "xl:grid-cols-1";

  return (
    <WidgetShell
      title="Lot size calculator"
      subtitle="Risk sizing without extra framing."
      tone="brand"
      className="h-full"
      contentClassName="min-h-0"
      headerRight={
        <>
          <Pill>
            <Calculator className="h-3.5 w-3.5" />
            {form.pair}
          </Pill>
          <PanelActions locked={panel.locked} onToggleLock={onToggleLock} onRemove={onRemove} />
        </>
      }
    >
      <div className={cn("grid h-full min-h-0 gap-4 overflow-y-auto pr-1", layoutClass)}>
        <div className="rounded-[24px] border border-white/10 bg-[linear-gradient(180deg,rgba(18,18,24,0.82),rgba(10,10,14,0.86))] p-4 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.025)] backdrop-blur-xl">
          <div className="mb-5 flex flex-col gap-1 border-b border-white/8 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
                Position inputs
              </div>
              <div className="mt-1 text-sm text-white/48">
                Account, entry, stop, and risk settings
              </div>
            </div>
            <div className="text-xs uppercase tracking-[0.18em] text-white/38">
              Risk amount ${calculations.riskAmount}
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <Field label="Pair" icon={CandlestickChart}>
              <DashboardSelect value={form.pair} />
            </Field>
            <Field label="Account currency" icon={DollarSign}>
              <DashboardSelect value={form.accountCurrency} />
            </Field>
            <Field label="Account size" icon={DollarSign}>
              <DashboardInput
                value={form.accountSize}
                onChange={update("accountSize")}
                suffix="USD"
                type="number"
              />
            </Field>
            <Field label="Risk per trade" icon={Percent}>
              <DashboardInput
                value={form.riskPercent}
                onChange={update("riskPercent")}
                suffix="%"
                type="number"
              />
            </Field>
            <Field label="Entry price" icon={Target}>
              <DashboardInput
                value={form.entryPrice}
                onChange={update("entryPrice")}
                type="number"
              />
            </Field>
            <Field label="Stop price" icon={Shield}>
              <DashboardInput
                value={form.stopPrice}
                onChange={update("stopPrice")}
                type="number"
              />
            </Field>
            <div className="md:col-span-2">
              <Field label="Stop loss distance" icon={Shield}>
                <DashboardInput
                  value={form.stopLossPips}
                  onChange={update("stopLossPips")}
                  suffix="pips"
                  type="number"
                />
              </Field>
            </div>
          </div>
        </div>

        <div className="grid gap-3">
          <ResultTile
            label="Recommended lot size"
            value={calculations.lotSize}
            emphasis
            note={`Std lots based on a ${form.stopLossPips} pip stop`}
          />
          <div className="grid grid-cols-2 gap-3">
            <ResultTile label="Risk amount" value={`$${calculations.riskAmount}`} />
            <ResultTile label="Units" value={calculations.units} />
          </div>
          <ResultTile
            label="Mini lots"
            value={calculations.miniLots}
            note={`Pip value / std lot $${calculations.pipValuePerLot}`}
          />
        </div>
      </div>
    </WidgetShell>
  );
}
