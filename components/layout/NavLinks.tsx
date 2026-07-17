"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { ChevronDown } from "lucide-react";

type MenuItem = { label: string; href: string; symbol?: string };

const CALC_LINKS: MenuItem[] = [
  { label: "Lot size calculator", href: "/lotsizecalculator" },
  { label: "Pip value calculator", href: "/pipvaluecalculator" },
  { label: "Margin calculator", href: "/margincalculator" },
  { label: "Compounding calculator", href: "/compoundingcalculator" },
];

const PRICE_LINKS: MenuItem[] = [
  { label: "Gold", href: "/gold-price-today", symbol: "XAU/USD" },
  { label: "Silver", href: "/silver-price-today", symbol: "XAG/USD" },
  { label: "Oil", href: "/oil-price-today", symbol: "Brent" },
  { label: "Bitcoin", href: "/bitcoin-price-today", symbol: "BTC/USD" },
];

const PLAIN_LINKS: MenuItem[] = [
  { label: "Blog", href: "/blog" },
  { label: "About", href: "/about" },
  { label: "Pro", href: "/pro" },
];

// Full-height links with a 2px underline as the active indicator (design 1B).
// The h-full only works because the parent chain stretches to the bar's
// 68px height.
const linkBase =
  "flex h-full items-center border-b-2 text-sm transition-colors";
const linkActive = "border-brand font-semibold text-zinc-50";
const linkIdle =
  "border-transparent font-medium text-zinc-400 hover:text-zinc-50";

// Shared dropdown trigger + portal menu. Open state is lifted to the parent
// (openId) so opening one menu closes the other.
function NavDropdown({
  id,
  label,
  items,
  active,
  openId,
  setOpenId,
}: {
  id: string;
  label: string;
  items: MenuItem[];
  active: boolean;
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const isOpen = openId === id;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (
        buttonRef.current && !buttonRef.current.contains(e.target as Node) &&
        dropdownRef.current && !dropdownRef.current.contains(e.target as Node)
      ) {
        setOpenId(null);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen, setOpenId]);

  const handleToggle = () => {
    if (!isOpen && buttonRef.current) {
      const rect = buttonRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + 8, left: rect.left + rect.width / 2 });
    }
    setOpenId(isOpen ? null : id);
  };

  return (
    <>
      <button
        ref={buttonRef}
        onClick={handleToggle}
        aria-expanded={isOpen}
        className={`${linkBase} gap-1.5 ${active ? linkActive : linkIdle} ${isOpen && !active ? "text-zinc-50" : ""}`}
      >
        {label}
        <ChevronDown
          className={`h-3.5 w-3.5 transition-transform duration-200 ${isOpen ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {mounted && isOpen && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: "fixed", top: pos.top, left: pos.left, transform: "translateX(-50%)", zIndex: 99999 }}
          className="w-56 rounded-[14px] border border-white/10 bg-[#111117] p-1.5 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)]"
        >
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setOpenId(null)}
              className="flex items-center justify-between rounded-[9px] px-3 py-2.5 text-sm transition-colors duration-150 hover:bg-white/5"
            >
              <span className="font-semibold text-zinc-100">{item.label}</span>
              {item.symbol && <span className="text-xs text-zinc-500 font-mono">{item.symbol}</span>}
            </Link>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

export default function NavLinks() {
  const pathname = usePathname();
  const [openId, setOpenId] = useState<string | null>(null);

  const onCalcPage = CALC_LINKS.some((c) => pathname.startsWith(c.href));
  const onPricePage = PRICE_LINKS.some((p) => pathname === p.href);

  return (
    <div className="flex h-full items-stretch gap-8">
      <NavDropdown
        id="calc"
        label="Calculator"
        items={CALC_LINKS}
        active={onCalcPage}
        openId={openId}
        setOpenId={setOpenId}
      />

      {PLAIN_LINKS.map(({ label, href }) => (
        <Link
          key={href}
          href={href}
          className={`${linkBase} ${pathname === href ? linkActive : linkIdle}`}
        >
          {label}
        </Link>
      ))}

      <NavDropdown
        id="prices"
        label="Prices"
        items={PRICE_LINKS}
        active={onPricePage}
        openId={openId}
        setOpenId={setOpenId}
      />
    </div>
  );
}
