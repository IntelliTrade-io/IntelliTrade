"use client";

import { useState } from "react";
import Link from "next/link";

const navSections = [
  {
    title: "PLATFORM",
    links: [
      { label: "Dashboard", href: "/dashboard" },
      { label: "Dashboard V2", href: "/dashboardv2" },
      { label: "Lot Size Calculator", href: "/lotsizecalculator" },
      { label: "Gold Price Today", href: "/gold-price-today" },
    ],
  },
  {
    title: "COMPANY",
    links: [
      { label: "About", href: "/about" },
      { label: "Blog", href: "/blog" },
    ],
  },
  {
    title: "ACCOUNT",
    links: [
      { label: "Sign In", href: "/auth/login" },
      { label: "Sign Up", href: "/auth/sign-up" },
    ],
  },
  {
    title: "LEGAL",
    links: [
      { label: "Privacy", href: "/privacyStatement" },
      { label: "Terms", href: "/termsOfService" },
      { label: "Cookies", href: "/cookieStatement" },
    ],
  },
];

export default function MobileNav() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <div className="md:hidden">
        <div className="hamburger-bg">
          <button
            className={`menu__icon${isOpen ? " is-open" : ""}`}
            onClick={() => setIsOpen(!isOpen)}
            aria-label="Toggle menu"
          >
            <span className="bg-brand"></span>
            <span></span>
            <span></span>
          </button>
        </div>
      </div>

      {isOpen && (
        <div
          className="fixed inset-0 z-50 md:hidden"
          onClick={() => setIsOpen(false)}
        >
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

          <div
            className="absolute top-20 left-4 right-4 rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800/70 overflow-hidden p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(187,68,240,0.12),transparent_55%)]" />

            <div className="relative z-10 space-y-6">
              {navSections.map((section) => (
                <div key={section.title}>
                  <p className="text-[10px] font-semibold tracking-[0.3em] text-brand/70 uppercase mb-3">
                    {section.title}
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {section.links.map((link) => (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setIsOpen(false)}
                        className="flex items-center rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200 hover:bg-white/10 transition"
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
