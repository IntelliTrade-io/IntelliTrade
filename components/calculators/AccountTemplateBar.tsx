"use client";

// Pro account templates for the lot size calculator: named, cloud-synced
// calculator profiles (balance, currency, default risk, per-instrument broker
// overrides). Free and signed-out users see a locked entry point. All
// mutations are enforced server-side (route gate + RLS); this component only
// decides what to render.

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ChevronDown, Lock, Star } from "lucide-react";
import { apiDelete, apiGet, apiPatch, apiPost, ApiError } from "@/lib/api/client";
import {
  type AccountTemplate,
  type TemplateInput,
  type TemplateInstrumentOverride,
  TEMPLATE_NAME_MAX,
} from "@/lib/calculator-templates";
import { defaultBrokerSettingsFor, normalizePair } from "@/lib/lot-size";
import type { StoredBrokerOverride } from "@/lib/calculator-storage";

interface AccountTemplateBarProps {
  /** Current account-level calculator fields (raw input strings). */
  balance: string;
  currency: string;
  riskPercent: string;
  /** Currently selected instrument (any format; normalized internally). */
  pair: string;
  /** Per-instrument broker overrides as held by the calculator inputs. */
  overrides: Record<string, StoredBrokerOverride>;
  selectedTemplateId: string | null;
  /** Apply a template's account fields (trade-specific inputs are preserved by the parent). */
  onApply: (template: AccountTemplate) => void;
  /** Selection marker changed (apply, clear, or restore) — parent persists it. */
  onSelectionChange: (id: string | null) => void;
  /** True when the parent restored no meaningful local state (fresh browser) — allows auto-applying the default template. */
  allowAutoDefault: boolean;
}

type LoadState = "loading" | "anon" | "ready" | "error";

/** Numeric per-instrument overrides from the calculator's raw string fields, defaults filling gaps. */
function numericOverrides(
  overrides: Record<string, StoredBrokerOverride>,
): Record<string, TemplateInstrumentOverride> {
  const out: Record<string, TemplateInstrumentOverride> = {};
  for (const [key, raw] of Object.entries(overrides)) {
    const d = defaultBrokerSettingsFor(key);
    const parse = (v: string | undefined, fallback: number) => {
      if (v === undefined || v.trim() === "") return fallback;
      const n = Number(v);
      return isFinite(n) && n > 0 ? n : fallback;
    };
    const entry = {
      contractSize: parse(raw.contractSize, d.contractSize),
      minLot: parse(raw.minLot, d.minLot),
      lotStep: parse(raw.lotStep, d.lotStep),
    };
    if (entry.contractSize !== d.contractSize || entry.minLot !== d.minLot || entry.lotStep !== d.lotStep) {
      out[key] = entry;
    }
  }
  return out;
}

export function AccountTemplateBar({
  balance,
  currency,
  riskPercent,
  pair,
  overrides,
  selectedTemplateId,
  onApply,
  onSelectionChange,
  allowAutoDefault,
}: AccountTemplateBarProps) {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [canEdit, setCanEdit] = useState(false);
  const [templates, setTemplates] = useState<AccountTemplate[]>([]);
  const [panelOpen, setPanelOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [brokerDraft, setBrokerDraft] = useState("");
  const [nameMode, setNameMode] = useState<"create" | "rename" | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const selected = templates.find((t) => t.id === selectedTemplateId) ?? null;

  // ── load ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiGet<{ templates: AccountTemplate[]; canEdit: boolean }>(
          "/api/calculator-templates",
        );
        if (cancelled) return;
        setTemplates(data.templates);
        setCanEdit(data.canEdit);
        setLoadState("ready");
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && e.status === 401) setLoadState("anon");
        else setLoadState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Auto-apply the default template only on a completely fresh browser state.
  useEffect(() => {
    if (loadState !== "ready" || selectedTemplateId !== null || !allowAutoDefault) return;
    const def = templates.find((t) => t.isDefault);
    if (def) {
      onApply(def);
      onSelectionChange(def.id);
    }
    // Intentionally run once after load; templates/selection changes later are user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadState]);

  // ── unsaved-changes detection ─────────────────────────────────────────────
  const dirty = useMemo(() => {
    if (!selected) return false;
    const bal = Number(balance);
    const risk = Number(riskPercent);
    if (!isFinite(bal) || bal !== selected.balance) return true;
    if (currency !== selected.currency) return true;
    if (!isFinite(risk) || risk !== selected.riskPercent) return true;
    const key = normalizePair(pair);
    const current = numericOverrides(overrides)[key] ?? null;
    const saved = selected.instrumentOverrides[key] ?? null;
    if (current === null && saved === null) return false;
    if (current === null || saved === null) return true;
    return (
      current.contractSize !== saved.contractSize ||
      current.minLot !== saved.minLot ||
      current.lotStep !== saved.lotStep
    );
  }, [selected, balance, currency, riskPercent, pair, overrides]);

  // ── payload builders ──────────────────────────────────────────────────────
  const payloadFromCurrent = useCallback(
    (name: string, base?: AccountTemplate): TemplateInput | { error: string } => {
      const bal = Number(balance);
      const risk = Number(riskPercent);
      if (!isFinite(bal) || bal <= 0 || !isFinite(risk) || risk <= 0) {
        return { error: "Enter a valid balance and risk percentage before saving a template." };
      }
      return {
        name,
        balance: bal,
        currency,
        riskPercent: risk,
        brokerName: (brokerDraft.trim() || base?.brokerName) ?? null,
        isDefault: base?.isDefault ?? false,
        instrumentOverrides: { ...(base?.instrumentOverrides ?? {}), ...numericOverrides(overrides) },
      };
    },
    [balance, currency, riskPercent, brokerDraft, overrides],
  );

  const payloadFromTemplate = (t: AccountTemplate, patch: Partial<TemplateInput> = {}): TemplateInput => ({
    name: t.name,
    balance: t.balance,
    currency: t.currency,
    riskPercent: t.riskPercent,
    brokerName: t.brokerName,
    isDefault: t.isDefault,
    instrumentOverrides: t.instrumentOverrides,
    ...patch,
  });

  // ── mutations ─────────────────────────────────────────────────────────────
  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setFeedback(null);
    try {
      await fn();
    } catch (e) {
      setFeedback(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const createTemplate = () =>
    run(async () => {
      const payload = payloadFromCurrent(nameDraft.trim());
      if ("error" in payload) {
        setFeedback(payload.error);
        return;
      }
      const { template } = await apiPost<{ template: AccountTemplate }>("/api/calculator-templates", payload);
      setTemplates((ts) => [...ts, template]);
      onSelectionChange(template.id);
      setNameMode(null);
      setNameDraft("");
      setFeedback("Template saved.");
    });

  const updateTemplate = () =>
    run(async () => {
      if (!selected) return;
      const payload = payloadFromCurrent(selected.name, selected);
      if ("error" in payload) {
        setFeedback(payload.error);
        return;
      }
      const { template } = await apiPatch<{ template: AccountTemplate }>(
        `/api/calculator-templates/${selected.id}`,
        payload,
      );
      setTemplates((ts) => ts.map((t) => (t.id === template.id ? template : t)));
      setFeedback("Template updated.");
    });

  const renameTemplate = () =>
    run(async () => {
      if (!selected) return;
      const name = nameDraft.trim();
      if (!name) {
        setFeedback("Enter a new template name.");
        return;
      }
      const { template } = await apiPatch<{ template: AccountTemplate }>(
        `/api/calculator-templates/${selected.id}`,
        payloadFromTemplate(selected, { name }),
      );
      setTemplates((ts) => ts.map((t) => (t.id === template.id ? template : t)));
      setNameMode(null);
      setNameDraft("");
      setFeedback("Template renamed.");
    });

  const duplicateTemplate = () =>
    run(async () => {
      if (!selected) return;
      const name = `${selected.name} copy`.slice(0, TEMPLATE_NAME_MAX);
      const { template } = await apiPost<{ template: AccountTemplate }>(
        "/api/calculator-templates",
        payloadFromTemplate(selected, { name, isDefault: false }),
      );
      setTemplates((ts) => [...ts, template]);
      setFeedback("Template duplicated.");
    });

  const deleteTemplate = () =>
    run(async () => {
      if (!selected) return;
      await apiDelete<{ ok: boolean }>(`/api/calculator-templates/${selected.id}`);
      setTemplates((ts) => ts.filter((t) => t.id !== selected.id));
      onSelectionChange(null);
      setConfirmDelete(false);
      setFeedback("Template deleted.");
    });

  const setDefaultTemplate = () =>
    run(async () => {
      if (!selected) return;
      const { template } = await apiPatch<{ template: AccountTemplate }>(
        `/api/calculator-templates/${selected.id}`,
        payloadFromTemplate(selected, { isDefault: true }),
      );
      setTemplates((ts) =>
        ts.map((t) => (t.id === template.id ? template : { ...t, isDefault: false })),
      );
      setFeedback("Default template set.");
    });

  // ── render ────────────────────────────────────────────────────────────────
  if (loadState === "loading" || loadState === "error") return null;

  if (loadState === "anon") {
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-white/45">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Account templates: save named account profiles with IntelliTrade Pro.</span>
        </div>
        <Link
          href="/pro?src=lotcalc-templates"
          className="inline-flex min-h-[44px] shrink-0 items-center text-xs font-medium text-violet-300 hover:text-violet-200"
        >
          See Pro
        </Link>
      </div>
    );
  }

  if (!canEdit && templates.length === 0) {
    return (
      <div className="mb-3 flex items-center justify-between gap-3 rounded-[16px] border border-white/10 bg-white/[0.03] px-4 py-2.5">
        <div className="flex items-center gap-2 text-xs text-white/45">
          <Lock className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Save as account template is an IntelliTrade Pro feature.</span>
        </div>
        <Link
          href="/pro?src=lotcalc-templates"
          className="inline-flex min-h-[44px] shrink-0 items-center text-xs font-medium text-violet-300 hover:text-violet-200"
        >
          See Pro
        </Link>
      </div>
    );
  }

  const buttonClass =
    "inline-flex min-h-[44px] items-center justify-center rounded-[12px] border border-white/10 bg-white/[0.04] px-3 text-xs font-medium text-white/80 transition-colors hover:border-white/20 hover:bg-white/[0.07] disabled:opacity-40 disabled:cursor-not-allowed";

  return (
    <div className="mb-3 rounded-[16px] border border-white/10 bg-white/[0.03] px-3 py-2.5 sm:px-4">
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="account-template-select" className="text-[11px] uppercase tracking-[0.18em] text-white/46">
          Account template
        </label>
        <select
          id="account-template-select"
          value={selectedTemplateId ?? ""}
          onChange={(e) => {
            const id = e.target.value || null;
            setConfirmDelete(false);
            setNameMode(null);
            if (!id) {
              onSelectionChange(null);
              return;
            }
            const t = templates.find((x) => x.id === id);
            if (t) {
              onApply(t);
              onSelectionChange(t.id);
            }
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

        {selected && dirty && (
          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/25 bg-amber-400/[0.08] px-2.5 py-1 text-[11px] text-amber-200/90">
            Unsaved changes
          </span>
        )}

        <button
          type="button"
          onClick={() => setPanelOpen((o) => !o)}
          aria-expanded={panelOpen}
          className={`${buttonClass} ml-auto gap-1`}
        >
          Manage
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform motion-reduce:transition-none ${panelOpen ? "rotate-180" : ""}`}
            aria-hidden="true"
          />
        </button>
      </div>

      {panelOpen && (
        <div className="mt-3 border-t border-white/8 pt-3">
          {!canEdit && (
            <p className="mb-2 text-xs text-white/45">
              Your subscription is inactive. Saved templates stay available read-only; renew IntelliTrade Pro to
              edit them.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={!canEdit || busy}
              onClick={() => {
                setNameMode(nameMode === "create" ? null : "create");
                setNameDraft("");
                setBrokerDraft("");
                setConfirmDelete(false);
              }}
              className={buttonClass}
            >
              Save as account template
            </button>
            <button type="button" disabled={!canEdit || busy || !selected || !dirty} onClick={updateTemplate} className={buttonClass}>
              Update template
            </button>
            <button
              type="button"
              disabled={!canEdit || busy || !selected}
              onClick={() => {
                setNameMode(nameMode === "rename" ? null : "rename");
                setNameDraft(selected?.name ?? "");
                setConfirmDelete(false);
              }}
              className={buttonClass}
            >
              Rename
            </button>
            <button type="button" disabled={!canEdit || busy || !selected} onClick={duplicateTemplate} className={buttonClass}>
              Duplicate
            </button>
            <button
              type="button"
              disabled={!canEdit || busy || !selected || selected.isDefault}
              onClick={setDefaultTemplate}
              className={`${buttonClass} gap-1`}
            >
              <Star className="h-3.5 w-3.5" aria-hidden="true" />
              Set as default
            </button>
            <button
              type="button"
              disabled={busy || !selected}
              onClick={() => {
                onSelectionChange(null);
                setConfirmDelete(false);
                setNameMode(null);
              }}
              className={buttonClass}
            >
              Clear selection
            </button>
            {!confirmDelete ? (
              <button
                type="button"
                disabled={!canEdit || busy || !selected}
                onClick={() => setConfirmDelete(true)}
                className={`${buttonClass} text-red-300/80 hover:text-red-200`}
              >
                Delete
              </button>
            ) : (
              <span className="inline-flex items-center gap-2">
                <span className="text-xs text-red-200/90">Delete &quot;{selected?.name}&quot;?</span>
                <button type="button" disabled={busy} onClick={deleteTemplate} className={`${buttonClass} text-red-300`}>
                  Confirm delete
                </button>
                <button type="button" disabled={busy} onClick={() => setConfirmDelete(false)} className={buttonClass}>
                  Cancel
                </button>
              </span>
            )}
          </div>

          {nameMode && (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <div className="flex flex-col gap-1">
                <label htmlFor="template-name-input" className="text-[11px] uppercase tracking-[0.18em] text-white/46">
                  Template name
                </label>
                <input
                  autoComplete="off"
                  id="template-name-input"
                  value={nameDraft}
                  maxLength={TEMPLATE_NAME_MAX}
                  onChange={(e) => setNameDraft(e.target.value)}
                  placeholder="e.g. FTMO 100K"
                  className="min-h-[44px] w-52 rounded-[12px] border border-white/10 bg-white/[0.035] px-3 text-sm text-white outline-none placeholder:text-white/24 focus:border-violet-400/40"
                />
              </div>
              {nameMode === "create" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="template-broker-input" className="text-[11px] uppercase tracking-[0.18em] text-white/46">
                    Broker name (optional)
                  </label>
                  <input
                    autoComplete="off"
                    id="template-broker-input"
                    value={brokerDraft}
                    maxLength={80}
                    onChange={(e) => setBrokerDraft(e.target.value)}
                    placeholder="e.g. IC Markets"
                    className="min-h-[44px] w-44 rounded-[12px] border border-white/10 bg-white/[0.035] px-3 text-sm text-white outline-none placeholder:text-white/24 focus:border-violet-400/40"
                  />
                </div>
              )}
              <button
                type="button"
                disabled={busy || !nameDraft.trim()}
                onClick={nameMode === "create" ? createTemplate : renameTemplate}
                className={`${buttonClass} border-violet-400/25 bg-violet-500/[0.10] hover:bg-violet-500/[0.16]`}
              >
                {nameMode === "create" ? "Save template" : "Save name"}
              </button>
            </div>
          )}

          {feedback && (
            <p role="status" className="mt-2 text-xs text-white/55">
              {feedback}
            </p>
          )}

          <p className="mt-2 text-[11px] leading-relaxed text-white/35">
            Templates store account settings and per-instrument broker overrides only. Entry, stop and pip
            distances stay with the calculator. No broker credentials are stored.
          </p>
        </div>
      )}
    </div>
  );
}
