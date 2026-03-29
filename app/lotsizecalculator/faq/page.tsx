"use client";

import { useMemo, useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

function useScrollProgress() {
  const [progress, setProgress] = useState(0);
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      const scrollTop = window.scrollY || doc.scrollTop || 0;
      const scrollHeight = doc.scrollHeight || 1;
      const clientHeight = window.innerHeight || doc.clientHeight || 1;
      const denom = Math.max(1, scrollHeight - clientHeight);
      setProgress(Math.min(1, Math.max(0, scrollTop / denom)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);
  return progress;
}

function useActiveSection(sectionIds: string[]) {
  const [activeId, setActiveId] = useState(sectionIds?.[0] ?? "");
  useEffect(() => {
    if (!sectionIds?.length) return;
    const els = sectionIds
      .map((id) => document.getElementById(id))
      .filter(Boolean) as HTMLElement[];
    if (!els.length) return;
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        if (visible[0]?.target && (visible[0].target as HTMLElement).id) {
          setActiveId((visible[0].target as HTMLElement).id);
        }
      },
      { root: null, rootMargin: "-25% 0px -55% 0px", threshold: [0.08, 0.15, 0.25, 0.35, 0.5] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sectionIds]);
  return activeId;
}

type Section = {
  id: string;
  eyebrow: string;
  title: string;
  body?: string[];
  bullets?: { title: string; desc: string }[];
  tip?: string;
};

export default function LotSizeFaqPage() {
  const sections: Section[] = useMemo(
    () => [
      {
        id: "position-sizing",
        eyebrow: "GUIDE • FUNDAMENTALS",
        title: "What is position sizing?",
        body: [
          "Position sizing is the process of deciding how big your trade should be before you enter. It is not about confidence, predictions, or how strong a setup looks. It is simply the trade size (lots or units) that keeps your risk controlled if the trade goes wrong.",
          "Most trading accounts do not fail because of one terrible trade. They fail because of a series of normal losses combined with oversized positions. Even a strong strategy can hit a losing streak. Position sizing is what gives your edge time to play out without a single trade (or a short run of trades) taking you out of the game.",
          "Done well, position sizing creates consistency. When every trade risks the same fraction of your account, you stop having one oversized position decide your entire week. You also avoid the opposite problem: trading so small that results feel random and motivation collapses.",
          "Position sizing also forces clarity. To size a trade responsibly, you must define where the idea is invalid, meaning you need a stop loss. If you cannot define the stop, you cannot define the risk. And if you cannot define the risk, you are not position sizing, you are guessing.",
        ],
      },
      {
        id: "why-it-matters",
        eyebrow: "SECTION 01",
        title: "Why it matters",
        bullets: [
          {
            title: "Lower risk of ruin",
            desc: "Smaller, consistent risk per trade makes it harder for a normal losing streak to do permanent damage.",
          },
          {
            title: "More stable performance",
            desc: "A good month is built from many small decisions, not one oversized gamble.",
          },
          {
            title: "Cleaner decision making",
            desc: "You size the trade from your stop loss, not from emotion.",
          },
        ],
      },
      {
        id: "how-it-works",
        eyebrow: "SECTION 02",
        title: "How this calculator works",
        body: [
          "The calculator follows a simple idea: define the money you are willing to lose on the trade, then solve for the position size that matches that risk if the stop loss is hit.",
        ],
        bullets: [
          {
            title: "Step 1 — Risk Amount",
            desc: "Account Balance × Risk % = the maximum you are willing to lose on this trade.",
          },
          {
            title: "Step 2 — Pip Value",
            desc: "Convert your stop loss distance into money using the instrument's pip value. If the instrument is quoted in a different currency than your account, the pip value is converted into your deposit currency first.",
          },
          {
            title: "Step 3 — Position Size",
            desc: "Position Size (lots) = Risk Amount ÷ (Stop Loss in pips × Pip Value per 1.00 lot)",
          },
        ],
      },
      {
        id: "examples",
        eyebrow: "SECTION 03",
        title: "Worked examples",
        bullets: [
          {
            title: "Example 1 — EURUSD",
            desc: "Account: $5,000 · Risk: 1% ($50) · Stop: 30 pips. For EURUSD, pip value ≈ $10 per pip per lot. Risk per lot with 30-pip stop = 30 × $10 = $300. Position size = $50 ÷ $300 = 0.17 lots (rounded).",
          },
          {
            title: "Example 2 — GBPJPY",
            desc: "Account: $5,000 · Risk: 1% ($50) · Stop: 30 pips · USDJPY: 150. Pip value per lot in USD ≈ 1,000 ÷ 150 = $6.67. Risk per lot = 30 × $6.67 = $200.10. Position size ≈ $50 ÷ $200.10 ≈ 0.25 lots.",
          },
        ],
      },
      {
        id: "metals",
        eyebrow: "SECTION 04",
        title: "Metals — lots vs. ounces",
        body: [
          "Metals can look confusing because the word lot does not mean 100,000 units like FX. For metals, a lot is usually defined in ounces.",
        ],
        bullets: [
          {
            title: "XAUUSD (Gold)",
            desc: "1.00 lot = 100 troy ounces. 0.10 lot = 10 oz, 0.01 lot = 1 oz.",
          },
          {
            title: "XAGUSD (Silver)",
            desc: "1.00 lot = 5,000 troy ounces. 0.10 lot = 500 oz, 0.01 lot = 50 oz.",
          },
          {
            title: "Stop loss on gold",
            desc: "Many platforms quote gold to 2 decimals (1 pip = $0.01). A 20-pip stop is a $0.20 move. A $2.00 stop would be 200 pips. If your platform shows open and stop price, the stop distance is simply the price difference.",
          },
        ],
      },
      {
        id: "mistakes",
        eyebrow: "SECTION 05",
        title: "Common mistakes to avoid",
        bullets: [
          {
            title: "Mixing pip and price stops",
            desc: "Some tools take a stop loss in pips, others take an open price and stop price. Make sure you are comparing the same stop distance.",
          },
          {
            title: "JPY pip convention",
            desc: "JPY pairs use a pip size of 0.01, not 0.0001. A 30-pip stop on GBPJPY is a 0.30 move in price.",
          },
          {
            title: "Contract size differences",
            desc: "Some brokers use gold contracts of 100 oz per lot, others use 10 oz or 1 oz. The same lot size can represent a different exposure depending on the broker.",
          },
          {
            title: "Deposit currency conversion",
            desc: "A pip value can change when your account currency changes. The trade might look larger or smaller only because of currency conversion.",
          },
          {
            title: "Confusing micro, mini, and standard lots",
            desc: "In FX, 1.00 standard lot is 100,000 units, 0.10 is a mini lot, 0.01 is a micro lot. Metals and indices follow different contract definitions.",
          },
        ],
        tip: "If a result looks too big or too small, check only two things first: (1) contract size, and (2) what the tool means by pip or tick.",
      },
      {
        id: "mini-faq",
        eyebrow: "SECTION 06",
        title: "Mini FAQ",
        bullets: [
          {
            title: "Does this work for indices or commodities?",
            desc: "The logic works for any instrument if you know the tick or pip size and the contract specification (what 1 lot represents). Some brokers define metals, indices, and crypto contracts differently, so always sanity-check contract size.",
          },
          {
            title: "Can I use this with prop firm rules?",
            desc: "Yes. Prop rules are usually based on daily drawdown and maximum loss. Position sizing helps you translate those limits into a consistent per-trade risk.",
          },
          {
            title: "What risk % do most traders use?",
            desc: "There is no universal best number. Many traders operate somewhere between 0.25% and 2% depending on strategy, volatility, and objectives. Focus on survivability first: smaller risk generally reduces drawdowns and makes losing streaks easier to tolerate.",
          },
        ],
      },
      {
        id: "links",
        eyebrow: "RESOURCES",
        title: "Useful links",
        bullets: [
          {
            title: "Fundamental Analysis Blog",
            desc: "intellitrade.tech/blog — Market analysis and educational content.",
          },
          {
            title: "About IntelliTrade",
            desc: "intellitrade.tech/about — Our mission and team.",
          },
          {
            title: "Terms and disclaimers",
            desc: "intellitrade.tech/terms — Full legal disclaimer. Educational resource only, not investment advice.",
          },
        ],
      },
    ],
    []
  );

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const activeId = useActiveSection(sectionIds);
  const progress = useScrollProgress();

  const handleNavClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="relative min-h-screen text-slate-100">
      {/* Progress bar */}
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-brandLight via-brand to-brandLight"
          style={{ width: `${progress * 100}%`, transition: "width 120ms linear" }}
        />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl gap-8 px-4 pb-32 pt-8 lg:px-8 lg:pt-16">
        {/* Sticky sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                INTELLITRADE
              </p>
              <h1 className="mt-2 text-sm font-medium text-slate-100">Lot Size Guide</h1>
            </div>
            <div className="h-px bg-white/10" />
            <nav className="space-y-2 text-sm">
              {sections.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => handleNavClick(s.id)}
                    className={[
                      "group flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition",
                      isActive ? "bg-white/10" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-[0.26em] text-brand/80">
                      {s.eyebrow}
                    </span>
                    <span className="mt-1 text-[13px] font-medium text-slate-100 group-hover:text-white">
                      {s.title}
                    </span>
                  </button>
                );
              })}
            </nav>
            <div className="h-px bg-white/10" />
            <Link
              href="/lotsizecalculator"
              className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-slate-400 transition hover:bg-white/5 hover:text-slate-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Back to calculator
            </Link>
            <p className="px-3 text-[11px] leading-relaxed text-slate-500">
              Educational resource. Not investment advice.
            </p>
          </div>
        </aside>

        {/* Content */}
        <main className="flex-1 space-y-16">
          {/* Mobile back link */}
          <div className="lg:hidden">
            <Link
              href="/lotsizecalculator"
              className="inline-flex items-center gap-2 text-sm text-slate-400 transition hover:text-slate-100"
            >
              <ArrowLeft className="h-4 w-4" />
              Back to calculator
            </Link>
          </div>

          {sections.map((s, index) => (
            <section key={s.id} id={s.id} className="scroll-mt-28 relative overflow-visible">
              <motion.div
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20% 0px -40% 0px" }}
                transition={{ duration: 0.6, delay: index * 0.04 }}
                className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] md:p-10"
              >
                <div className="radial-backdrop" />
                <div className="relative z-10">
                  <div className="inline-flex items-center rounded-full border border-brand bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-brand-200/90">
                    {s.eyebrow}
                  </div>

                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                    {s.title}
                  </h3>

                  {!!s.body?.length && (
                    <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-slate-200/90">
                      {s.body.map((p, idx) => (
                        <p key={idx}>{p}</p>
                      ))}
                    </div>
                  )}

                  {!!s.bullets?.length && (
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                      {s.bullets.map((b, idx) => (
                        <div
                          key={idx}
                          className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl"
                        >
                          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-300/90">
                            {b.title}
                          </p>
                          <p className="mt-2 text-[14px] leading-relaxed text-slate-200/90">
                            {b.desc}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}

                  {s.tip ? (
                    <div className="mt-6 rounded-2xl border border-brand/20 bg-brand/5 px-5 py-4 text-[13px] leading-relaxed text-slate-300/90">
                      <span className="font-semibold text-brand-300/90">Tip: </span>
                      {s.tip}
                    </div>
                  ) : null}
                </div>
              </motion.div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}
