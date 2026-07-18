"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, X, Calculator, CalendarDays, Gauge, Scale, Clock, BookOpen, Info, TrendingUp, LogIn, UserPlus, Sparkles, Radar } from "lucide-react";

const MAIN_LINKS = [
  { label: "Lot size calculator", href: "/lotsizecalculator", icon: Calculator },
  { label: "Pip value calculator", href: "/pipvaluecalculator", icon: Gauge },
  { label: "Margin calculator", href: "/margincalculator", icon: Scale },
  { label: "Compounding calculator", href: "/compoundingcalculator", icon: TrendingUp },
  { label: "Economic calendar", href: "/economic-calendar", icon: CalendarDays },
  { label: "Currency strength", href: "/currency-strength", icon: Radar },
  { label: "Forex market hours", href: "/forex-market-hours", icon: Clock },
  { label: "Blog", href: "/blog", icon: BookOpen },
  { label: "About", href: "/about", icon: Info },
  { label: "Pro", href: "/pro", icon: Sparkles },
];

const PRICE_LINKS = [
  { label: "Gold", href: "/gold-price-today", symbol: "XAU/USD" },
  { label: "Silver", href: "/silver-price-today", symbol: "XAG/USD" },
  { label: "Oil", href: "/oil-price-today", symbol: "Brent" },
  { label: "Bitcoin", href: "/bitcoin-price-today", symbol: "BTC/USD" },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();

  useEffect(() => { setMounted(true); }, []);

  const panel = (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[99998]"
        onClick={() => setIsOpen(false)}
      />

      {/* Dropdown panel — portaled to body to escape nav stacking context.
          Top offset = 68px bar + 8px gap. */}
      <div className="fixed left-3 right-3 top-[76px] z-[99999] rounded-2xl border border-white/[0.07] bg-[#08080c]/95 backdrop-blur-sm overflow-hidden">
            <div className="p-3 space-y-1">
              {/* Main links */}
              {MAIN_LINKS.map(({ label, href, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setIsOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-150 ${
                    pathname === href
                      ? "text-white bg-white/10"
                      : "text-white/80 hover:text-white hover:bg-white/[0.08]"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-white/50" />
                  {label}
                </Link>
              ))}

              {/* Divider */}
              <div className="h-px bg-white/10 mx-1 my-2" />

              {/* Prices section */}
              <div className="px-3 py-1">
                <p className="text-[10px] font-semibold tracking-widest text-white uppercase mb-2 flex items-center gap-1.5">
                  <TrendingUp className="h-3 w-3" />
                  Prices today
                </p>
                <div className="grid grid-cols-2 gap-1">
                  {PRICE_LINKS.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setIsOpen(false)}
                      className="flex items-center justify-between px-3 py-2 rounded-xl text-sm text-white/80 hover:text-white hover:bg-white/[0.08] transition-all duration-150"
                    >
                      <span>{item.label}</span>
                      <span className="text-[10px] text-white/30 font-mono">{item.symbol}</span>
                    </Link>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div className="h-px bg-white/10 mx-1 my-2" />

              {/* Auth links */}
              <div className="grid grid-cols-2 gap-2 px-1">
                <Link
                  href="/auth/login"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white border border-white/20 hover:border-white/40 hover:bg-white/[0.06] transition-all duration-200"
                >
                  <LogIn className="h-3.5 w-3.5" />
                  Sign in
                </Link>
                <Link
                  href="/auth/sign-up"
                  onClick={() => setIsOpen(false)}
                  className="flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-white bg-gradient-to-r from-brand to-brandLight shadow-lg shadow-brand/35 transition-all duration-200"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  Sign up
                </Link>
              </div>
            </div>
          </div>
    </>
  );

  return (
    <div className="md:hidden">
      <button
        onClick={() => setIsOpen((v) => !v)}
        aria-label="Toggle menu"
        aria-expanded={isOpen}
        className="flex items-center justify-center w-9 h-9 rounded-lg text-white/70 hover:text-white hover:bg-white/[0.08] transition-all duration-200"
      >
        {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      {mounted && isOpen && createPortal(panel, document.body)}
    </div>
  );
}
