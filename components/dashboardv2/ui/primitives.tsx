"use client";

import React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Pill
// ---------------------------------------------------------------------------

interface PillProps {
  children: React.ReactNode;
  active?: boolean;
}

export function Pill({ children, active = false }: PillProps) {
  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-2 text-xs uppercase tracking-[0.18em]",
        active
          ? "border-violet-400/18 bg-violet-500/[0.08] text-white/88"
          : "border-white/10 bg-white/[0.04] text-white/58",
      )}
    >
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// SmallAction
// ---------------------------------------------------------------------------

interface SmallActionProps {
  children: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}

export function SmallAction({
  children,
  onClick,
  active = false,
  className = "",
}: SmallActionProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full border px-4 text-sm transition-all",
        active
          ? "border-violet-400/18 bg-violet-500/[0.10] text-white"
          : "border-white/10 bg-white/[0.04] text-white/68 hover:border-white/18 hover:text-white",
        className,
      )}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Tag
// ---------------------------------------------------------------------------

interface TagProps {
  children: React.ReactNode;
  subtle?: boolean;
}

export function Tag({ children, subtle = false }: TagProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-3 py-1.5 text-[11px] uppercase tracking-[0.16em]",
        subtle
          ? "border-white/10 bg-white/[0.03] text-white/52"
          : "border-white/10 bg-white/[0.05] text-white/78",
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// MetaCard
// ---------------------------------------------------------------------------

interface MetaCardProps {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}

export function MetaCard({ label, value, icon: Icon }: MetaCardProps) {
  return (
    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/34">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      <div className="mt-2 text-sm font-medium leading-relaxed text-white/84">
        {value}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Field
// ---------------------------------------------------------------------------

interface FieldProps {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}

export function Field({ label, icon: Icon, children }: FieldProps) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2 text-[11px] uppercase tracking-[0.18em] text-white/38">
        <Icon className="h-3.5 w-3.5" />
        {label}
      </div>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// DashboardInput (renamed from Input to avoid conflicts)
// ---------------------------------------------------------------------------

interface DashboardInputProps {
  value: string;
  onChange: React.ChangeEventHandler<HTMLInputElement>;
  suffix?: string;
  type?: string;
}

export function DashboardInput({
  value,
  onChange,
  suffix,
  type = "text",
}: DashboardInputProps) {
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

// ---------------------------------------------------------------------------
// DashboardSelect (renamed from Select to avoid conflicts)
// ---------------------------------------------------------------------------

interface DashboardSelectProps {
  value: string;
}

export function DashboardSelect({ value }: DashboardSelectProps) {
  return (
    <button className="flex h-11 w-full items-center justify-between rounded-[16px] border border-white/10 bg-white/[0.035] px-4 text-left text-white transition-all hover:border-white/18">
      <span>{value}</span>
      <ChevronDown className="h-4 w-4 text-white/40" />
    </button>
  );
}

// ---------------------------------------------------------------------------
// ResultTile
// ---------------------------------------------------------------------------

interface ResultTileProps {
  label: string;
  value: string;
  emphasis?: boolean;
  note?: string;
}

export function ResultTile({
  label,
  value,
  emphasis = false,
  note,
}: ResultTileProps) {
  return (
    <div
      className={cn(
        "rounded-[20px] border p-4 backdrop-blur-xl",
        emphasis
          ? "border-violet-400/18 bg-[linear-gradient(180deg,rgba(29,22,45,0.96),rgba(13,13,18,0.94))] shadow-[0_0_0_1px_rgba(167,139,250,0.08)]"
          : "border-white/10 bg-white/[0.03]",
      )}
    >
      <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-white">
        {value}
      </div>
      {note ? <div className="mt-2 text-sm text-white/46">{note}</div> : null}
    </div>
  );
}
