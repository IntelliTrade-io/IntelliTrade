"use client";

// Apply-only account-template selector for the pip value and margin
// calculators. Templates are created and edited on the lot size calculator
// (AccountTemplateBar); here a Pro user only picks one to preload their
// account currency and per-instrument broker contract sizes. No persistence:
// the default template auto-applies on load, manual picks live for the visit.

import { useEffect, useState } from "react";
import Link from "next/link";
import { Lock } from "lucide-react";
import { apiGet, ApiError } from "@/lib/api/client";
import type { AccountTemplate } from "@/lib/calculator-templates";

interface TemplateSelectBarProps {
  /** Apply a template's account currency + instrument overrides. */
  onApply: (template: AccountTemplate) => void;
  /** Funnel source for the Pro teaser link, e.g. "pipcalc-templates". */
  proSrc: string;
}

type LoadState = "loading" | "anon" | "ready" | "error";

export function TemplateSelectBar({ onApply, proSrc }: TemplateSelectBarProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [templates, setTemplates] = useState<AccountTemplate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ templates: AccountTemplate[] }>("/api/calculator-templates");
        if (cancelled) return;
        setTemplates(data.templates);
        setLoadState("ready");
        // Auto-apply the default template so a Pro user's currency and broker
        // contract sizes are preloaded without an extra click.
        const def = data.templates.find((t) => t.isDefault);
        if (def) {
          setSelectedId(def.id);
          onApply(def);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) setLoadState("anon");
        else setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // onApply is stable enough for a mount-only fetch; re-running on identity
    // changes would re-apply the default over user edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (loadState === "loading" || loadState === "error") return null;

  if (loadState === "anon") {
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-white/45">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Account templates: preload your account and broker settings with IntelliTrade Pro.</span>
        </div>
        <Link
          href={`/pro?src=${proSrc}`}
          className="inline-flex min-h-[44px] shrink-0 items-center text-xs font-medium text-violet-300 hover:text-violet-200"
        >
          See Pro
        </Link>
      </div>
    );
  }

  if (templates.length === 0) return null;

  return (
    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-[16px] border border-white/10 bg-white/[0.03] px-3 py-2.5 sm:px-4">
      <label htmlFor="template-select-bar" className="text-[11px] uppercase tracking-[0.18em] text-white/46">
        Account template
      </label>
      <select
        id="template-select-bar"
        value={selectedId ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          setSelectedId(id);
          const t = templates.find((x) => x.id === id);
          if (t) onApply(t);
        }}
        className="min-h-[44px] min-w-[160px] flex-1 cursor-pointer rounded-[12px] border border-white/10 bg-[#0b0b10] px-3 text-sm text-white outline-none transition-colors focus:border-violet-400/40 sm:flex-none"
      >
        <option value="">No template</option>
        {templates.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
            {t.isDefault ? " (default)" : ""}
          </option>
        ))}
      </select>
      <span className="text-[11px] text-white/32">
        Applies account currency and broker contract sizes. Manage templates on the{" "}
        <Link href="/lotsizecalculator" className="text-violet-300/80 underline-offset-2 hover:underline">
          lot size calculator
        </Link>
        .
      </span>
    </div>
  );
}
