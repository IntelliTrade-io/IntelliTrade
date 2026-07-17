"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, Settings2 } from "lucide-react";

// TradingView Single Ticker web component (the current widget embed, same
// family as the tv-mini-chart the price pages use): streams the chosen pair
// live. A small settings button opens a symbol picker; the choice persists
// per visitor in localStorage. Swap the import in app/layout.tsx back to
// EurUsdTicker for the CurrencyFreaks chip if this ever misbehaves.

const TV_SINGLE_TICKER_SCRIPT_SRC =
  "https://widgets.tradingview-widget.com/w/en/tv-single-ticker.js";
const LOAD_TIMEOUT_MS = 6000;
const STORAGE_KEY = "nav-ticker-symbol";
const DEFAULT_SYMBOL = "OANDA:EURUSD";

const TICKER_SYMBOLS = [
  { label: "EURUSD", value: "OANDA:EURUSD" },
  { label: "GBPUSD", value: "OANDA:GBPUSD" },
  { label: "USDJPY", value: "OANDA:USDJPY" },
  { label: "USDCHF", value: "OANDA:USDCHF" },
  { label: "USDCAD", value: "OANDA:USDCAD" },
  { label: "AUDUSD", value: "OANDA:AUDUSD" },
  { label: "NZDUSD", value: "OANDA:NZDUSD" },
  { label: "Gold", value: "OANDA:XAUUSD" },
  { label: "Silver", value: "OANDA:XAGUSD" },
  { label: "Bitcoin", value: "COINBASE:BTCUSD" },
] as const;

let tvSingleTickerModulePromise: Promise<void> | null = null;

function ensureTvSingleTickerModule(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("Browser only"));
  if (window.customElements?.get("tv-single-ticker")) return Promise.resolve();
  if (!tvSingleTickerModulePromise) {
    tvSingleTickerModulePromise = new Promise((resolve, reject) => {
      let settled = false;
      let script = document.querySelector<HTMLScriptElement>(
        `script[src="${TV_SINGLE_TICKER_SCRIPT_SRC}"]`,
      );
      const cleanup = () => {
        window.clearTimeout(timeoutId);
        script?.removeEventListener("error", handleError);
      };
      const finish = () => { if (settled) return; settled = true; cleanup(); resolve(); };
      const fail = () => {
        if (settled) return;
        settled = true;
        cleanup();
        tvSingleTickerModulePromise = null;
        reject(new Error("tv-single-ticker failed to load"));
      };
      const handleError = () => fail();
      const timeoutId = window.setTimeout(fail, LOAD_TIMEOUT_MS);
      if (!script) {
        script = document.createElement("script");
        script.type = "module";
        script.src = TV_SINGLE_TICKER_SCRIPT_SRC;
        script.async = true;
        document.head.appendChild(script);
      }
      script.addEventListener("error", handleError, { once: true });
      window.customElements.whenDefined("tv-single-ticker").then(finish);
    });
  }
  return tvSingleTickerModulePromise;
}

export default function TradingViewNavTicker() {
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [symbol, setSymbol] = useState(DEFAULT_SYMBOL);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, right: 0 });
  const [mounted, setMounted] = useState(false);

  // Restore the visitor's saved pick after hydration (server always renders
  // the default, so reading localStorage during render would mismatch).
  useEffect(() => {
    setMounted(true);
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved && TICKER_SYMBOLS.some((s) => s.value === saved)) setSymbol(saved);
  }, []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;
    container.replaceChildren();

    const mount = async () => {
      try {
        await ensureTvSingleTickerModule();
        if (cancelled) return;
        const ticker = document.createElement("tv-single-ticker");
        ticker.setAttribute("symbol", symbol);
        ticker.setAttribute("theme", "dark");
        ticker.setAttribute("transparent", "");
        ticker.style.display = "block";
        ticker.style.position = "absolute";
        ticker.style.inset = "0";
        ticker.style.width = "100%";
        ticker.style.height = "100%";
        container.replaceChildren(ticker);
      } catch {
        if (!cancelled) setFailed(true);
      }
    };

    mount();
    return () => {
      cancelled = true;
      container.replaceChildren();
    };
  }, [symbol]);

  if (failed) return null;

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 10, right: window.innerWidth - rect.right - 190 });
    }
    setOpen((v) => !v);
  };

  const handlePick = (value: string) => {
    setSymbol(value);
    window.localStorage.setItem(STORAGE_KEY, value);
    setOpen(false);
  };

  return (
    <div className="hidden items-center gap-1 lg:flex">
      <button
        ref={buttonRef}
        type="button"
        onClick={handleToggle}
        aria-expanded={open}
        aria-label="Change ticker symbol"
        title="Change ticker symbol"
        className={`flex h-7 w-7 items-center justify-center rounded-lg transition-colors ${
          open ? "bg-white/[0.06] text-zinc-200" : "text-zinc-500 hover:bg-white/[0.06] hover:text-zinc-200"
        }`}
      >
        <Settings2 className="h-3.5 w-3.5" />
      </button>

      <div
        className="relative h-[52px] w-[220px] overflow-hidden rounded-[11px]"
        style={{ contain: "paint" }}
      >
        <div ref={containerRef} className="absolute inset-0" />
      </div>

      {mounted && open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, right: Math.max(pos.right, 12), zIndex: 99999 }}
          className="w-48 rounded-[14px] border border-white/10 bg-[#111117] p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)]"
        >
          <p className="px-3 pb-1.5 pt-1 text-[10px] font-semibold uppercase tracking-widest text-zinc-500">
            Ticker symbol
          </p>
          {TICKER_SYMBOLS.map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => handlePick(item.value)}
              className="flex w-full items-center justify-between rounded-[9px] px-3 py-2 text-sm transition-colors duration-150 hover:bg-white/5"
            >
              <span className={symbol === item.value ? "font-semibold text-zinc-50" : "text-zinc-300"}>
                {item.label}
              </span>
              {symbol === item.value && <Check className="h-3.5 w-3.5 text-brandLight" />}
            </button>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}
