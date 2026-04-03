"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Button } from "./ui/button";

const PRICE_LINKS = [
  { label: "Gold", href: "/gold-price-today", symbol: "XAU/USD" },
  { label: "Silver", href: "/silver-price-today", symbol: "XAG/USD" },
  { label: "Oil", href: "/oil-price-today", symbol: "Brent" },
  { label: "Bitcoin", href: "/bitcoin-price-today", symbol: "BTC/USD" },
];

export default function NavLinks() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div className="flex items-center gap-2">
      <Button asChild size="sm">
        <Link href="/lotsizecalculator">Lot Size Calculator</Link>
      </Button>

      {/* Prices dropdown */}
      <div ref={ref} className="relative">
        <Button
          size="sm"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="true"
        >
          Prices
          <svg
            className={`h-3 w-3 text-white/40 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </Button>

        {open && (
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-44 overflow-hidden rounded-xl border border-white/10 bg-slate-950/95 shadow-[0_16px_48px_rgba(0,0,0,0.7)] backdrop-blur-xl">
            {PRICE_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-4 py-2.5 text-xs text-slate-300 transition hover:bg-white/[0.06] hover:text-white"
              >
                <span>{item.label}</span>
                <span className="text-[10px] text-white/30">{item.symbol}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      <Button asChild size="sm">
        <Link href="/about">About</Link>
      </Button>
    </div>
  );
}
