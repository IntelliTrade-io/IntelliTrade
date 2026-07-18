"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Search, ChevronDown, X } from "lucide-react";

// Shared searchable combobox used by the lot size, pip value and margin
// calculators (previously three verbatim copies; extraction tracked in
// IMPROVEMENTS.md). The closed input shows the selected value; opening turns
// it into a search field with a keyboard-navigable dropdown.
interface SearchComboboxProps {
  /** Currently selected option, shown while the dropdown is closed. */
  value: string;
  options: string[];
  onSelect: (value: string) => void;
  /** "pair" renders BASE/QUOTE split rows, strips "/" from the query and scrolls the list. */
  variant: "currency" | "pair";
  /** Input element id so an external <label htmlFor> can target it. */
  id?: string;
  /** Grey out and ignore interaction (e.g. while the pair list loads). */
  disabled?: boolean;
  /** Input height utilities — the calculators differ (44px tap target vs h-9 sm:h-11). */
  heightClass?: string;
}

export function SearchCombobox({
  value,
  options,
  onSelect,
  variant,
  id,
  disabled = false,
  heightClass = "min-h-[44px]",
}: SearchComboboxProps) {
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const generatedId = useId();
  const inputId = id ?? `search-combo-${generatedId}`;
  const listboxId = `${inputId}-listbox`;

  const isPair = variant === "pair";

  const filtered = useMemo(() => {
    let q = search.trim().toUpperCase();
    if (isPair) q = q.replace("/", "");
    if (!q) return options;
    return options.filter((o) => o.includes(q));
  }, [options, search, isPair]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setSearch("");
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setHighlightedIdx(filtered.indexOf(value));
  };

  const select = (o: string) => {
    onSelect(o);
    setOpen(false);
    setSearch("");
    setHighlightedIdx(0);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") openDropdown();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (filtered[highlightedIdx]) select(filtered[highlightedIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
      setSearch("");
    }
  };

  return (
    <div className="relative" ref={containerRef}>
      {/* Left search icon */}
      {open && (
        <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/40 z-10" />
      )}
      {/* Input */}
      <input
        autoComplete="off"
        id={inputId}
        ref={inputRef}
        value={open ? search : value}
        placeholder={open ? (isPair ? "Search pair…" : "Search…") : ""}
        readOnly={!open || disabled}
        role="combobox"
        aria-expanded={open}
        aria-controls={listboxId}
        onClick={openDropdown}
        onChange={(e) => { setSearch(e.target.value); setHighlightedIdx(0); }}
        onKeyDown={handleKeyDown}
        onFocus={() => { if (!open) openDropdown(); }}
        className={`${heightClass} w-full rounded-[16px] border bg-white/[0.035] text-sm text-white outline-none transition-all placeholder:text-white/30 motion-reduce:transition-none ${
          disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"
        } ${open ? "border-violet-400/40 bg-white/[0.05] pl-9 pr-9" : "border-white/10 pl-4 pr-9"}`}
      />
      {/* Right icon */}
      <div className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 flex items-center">
        {open && search ? (
          <button
            type="button"
            aria-label="Clear search"
            className="pointer-events-auto text-white/30 hover:text-white/60"
            onClick={(e) => {
              e.stopPropagation();
              setSearch("");
              setHighlightedIdx(0);
              inputRef.current?.focus({ preventScroll: true });
            }}
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : (
          <ChevronDown
            className={`h-4 w-4 text-white/38 transition-transform motion-reduce:transition-none ${open ? "rotate-180" : ""}`}
          />
        )}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          id={listboxId}
          className={`absolute left-0 right-0 top-[calc(100%+6px)] z-50 rounded-[16px] border border-white/10 bg-[#0b0b10]/96 py-1.5 shadow-[0_20px_60px_rgba(0,0,0,0.6)] backdrop-blur-2xl ${
            isPair ? "max-h-56 overflow-y-auto" : "overflow-hidden"
          }`}
        >
          {filtered.length === 0 ? (
            <div className="px-4 py-3 text-sm text-white/38">
              {isPair ? <>No pairs match &quot;{search}&quot;</> : <>No match for &quot;{search}&quot;</>}
            </div>
          ) : (
            filtered.map((o, idx) => (
              <button
                key={o}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); select(o); }}
                onMouseEnter={() => setHighlightedIdx(idx)}
                className={`flex w-full items-center px-4 py-2 text-left text-sm transition-colors motion-reduce:transition-none ${
                  isPair ? "" : "font-medium"
                } ${
                  idx === highlightedIdx
                    ? "bg-violet-500/[0.14] text-white"
                    : o === value
                    ? "text-violet-300"
                    : "text-white/72 hover:bg-white/[0.04] hover:text-white"
                }`}
              >
                {isPair ? (
                  <>
                    <span className="font-medium">{o.slice(0, 3)}</span>
                    <span className="text-white/38">/</span>
                    <span className="font-medium">{o.slice(3)}</span>
                  </>
                ) : (
                  o
                )}
                {o === value && <span className="ml-auto text-[10px] text-violet-400/70">selected</span>}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
