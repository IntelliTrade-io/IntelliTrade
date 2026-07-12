"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { Calculator, BookOpen, Info, TrendingUp, ChevronDown, Sparkles } from "lucide-react";

const PRICE_LINKS = [
  { label: "Gold", href: "/gold-price-today", symbol: "XAU/USD" },
  { label: "Silver", href: "/silver-price-today", symbol: "XAG/USD" },
  { label: "Oil", href: "/oil-price-today", symbol: "Brent" },
  { label: "Bitcoin", href: "/bitcoin-price-today", symbol: "BTC/USD" },
];

const NAV_LINKS = [
  { label: "Lot size calculator", href: "/lotsizecalculator", icon: Calculator },
  { label: "Blog", href: "/blog", icon: BookOpen },
  { label: "About", href: "/about", icon: Info },
  { label: "Pro", href: "/pro", icon: Sparkles },
];

export default function NavLinks() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
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
  }, []);

  const handleToggle = () => {
    if (!open && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
    }
    setOpen((v) => !v);
  };

  return (
    <div className="flex items-center gap-0.5">
      {NAV_LINKS.map(({ label, href, icon: Icon }, i) => (
        <div key={href} className="flex items-center">
          {i > 0 && <span className="w-px h-4 bg-white/10 mx-1" />}
          <Link
            href={href}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
              pathname === href
                ? "text-white bg-white/10"
                : "text-white/80 hover:text-white hover:bg-white/[0.06]"
            }`}
          >
            <Icon className="h-3.5 w-3.5 shrink-0" />
            {label}
          </Link>
        </div>
      ))}

      <span className="w-px h-4 bg-white/10 mx-1" />

      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-expanded={open}
        className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-all duration-200 ${
          open ? "text-white bg-white/10" : "text-white/80 hover:text-white hover:bg-white/[0.06]"
        }`}
      >
        <TrendingUp className="h-3.5 w-3.5 shrink-0" />
        Prices today
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {mounted && open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)", zIndex: 99999 }}
          className="w-52 rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md overflow-hidden"
        >
          <div className="p-1.5 space-y-0.5">
            {PRICE_LINKS.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="flex items-center justify-between px-3 py-2.5 text-sm rounded-xl text-white/80 hover:text-white hover:bg-white/[0.08] transition-all duration-150"
              >
                <span>{item.label}</span>
                <span className="text-xs text-white/30 font-mono">{item.symbol}</span>
              </Link>
            ))}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
