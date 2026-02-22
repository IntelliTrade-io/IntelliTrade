"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import "@/styles/lot-size-calculator.css";

// -----------------------------
// Hooks (Macro Mastery feel)
// -----------------------------
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
          .sort(
            (a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0)
          );

        if (visible[0]?.target && (visible[0].target as HTMLElement).id) {
          setActiveId((visible[0].target as HTMLElement).id);
        }
      },
      {
        root: null,
        rootMargin: "-25% 0px -55% 0px",
        threshold: [0.08, 0.15, 0.25, 0.35, 0.5],
      }
    );

    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sectionIds]);

  return activeId;
}

// -----------------------------
// Page
// -----------------------------
export default function AboutPage() {
  const sections = useMemo(
    () => [
      {
        id: "about-intro",
        eyebrow: "ABOUT • INTELLITRADE",
        title: "Where Smarter Trading Starts",
        subtitle:
          "A professional analysis platform built for clarity, context, and disciplined decision-making.",
        body: [
          "IntelliTrade is a modern trading analysis platform built to help you make educated, professional-grade decisions with more clarity and less noise.",
          "We focus on tools serious retail traders actually need: structured analysis, clean workflows, and risk-first utilities that support disciplined execution.",
        ],
      },
      {
        id: "about-mission",
        eyebrow: "MISSION",
        title: "Trading gets easier when your process gets clearer.",
        body: [
          "Our mission is to give traders a professional analysis toolkit that improves decision-making through better context, better structure, and better risk management.",
          "The goal is to help you operate with more confidence and consistency over time.",
        ],
      },
      {
        id: "about-build",
        eyebrow: "WHAT WE BUILD",
        title: "Available now",
        bullets: [
          {
            title: "Position Size Calculator",
            desc: "A practical risk tool designed to help you size positions with more precision and control. Built for speed, clarity, and real-world usability.",
          },
          {
            title: "Fundamental Analysis Blog",
            desc: "Research-driven breakdowns of the macro and fundamental forces moving markets. Clear context designed to support better decisions, without telling you what to trade.",
          },
        ],
      },
      {
        id: "about-coming-soon",
        eyebrow: "ROADMAP",
        title: "Coming soon",
        body: [
          "IntelliTrade is actively expanding. We are building additional tools and features designed to support a complete analysis workflow, from preparation to execution to review.",
        ],
      },
      {
        id: "about-for",
        eyebrow: "WHO IT IS FOR",
        title: "Built for traders who want",
        bullets: [
          {
            title: "Structure",
            desc: "A clearer, more repeatable way to analyze markets.",
          },
          {
            title: "Discipline",
            desc: "Tools that support educated decisions, not impulsive trades.",
          },
          {
            title: "Professional standards",
            desc: "A platform that values substance over hype.",
          },
          {
            title: "Long-term consistency",
            desc: "A process-first approach built around risk and execution quality.",
          },
        ],
      },
      {
        id: "about-principles",
        eyebrow: "PRINCIPLES",
        title: "How we choose what to build",
        bullets: [
          {
            title: "Clarity over complexity",
            desc: "If it is not clear, it is not useful.",
          },
          {
            title: "Risk-first mindset",
            desc: "Good trading starts with risk management, not predictions.",
          },
          {
            title: "Professional tone",
            desc: "Calm, precise, and useful.",
          },
          {
            title: "Tools that earn trust",
            desc: "We would rather build fewer things with higher quality than ship a large list of half-finished features.",
          },
        ],
      },
      {
        id: "about-story",
        eyebrow: "OUR STORY",
        title: "Founded in 2025",
        body: [
          "IntelliTrade was founded in 2025 with a simple goal: bring a more professional, modern experience to retail trading tools.",
          "We are building step by step, with quality as the priority.",
        ],
      },
      {
        id: "about-note",
        eyebrow: "IMPORTANT NOTE",
        title: "Educational tools and commentary only",
        body: [
          "IntelliTrade provides general, educational market commentary and analysis tools. We do not provide investment advice, and nothing on this site should be interpreted as a trading signal.",
          "More information and additional disclaimers are available in our Terms of Service.",
        ],
      },
      {
        id: "about-cta",
        eyebrow: "STAY IN THE LOOP",
        title: "Decode macro like a pro",
        subtitle: "Join IntelliTrade and get the Macro Decoder e-book free.",
      },
    ],
    []
  );

  const sectionIds = useMemo(() => sections.map((s) => s.id), [sections]);
  const activeId = useActiveSection(sectionIds);
  const progress = useScrollProgress();

  const [email, setEmail] = useState("");
  const [ctaStatus, setCtaStatus] = useState<
    "idle" | "sending" | "success" | "error"
  >("idle");

  const handleNavClick = (id: string) => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email?.includes("@")) return;

    try {
      setCtaStatus("sending");
      await new Promise((r) => setTimeout(r, 600)); // placeholder
      setCtaStatus("success");
      setEmail("");
    } catch {
      setCtaStatus("error");
    }
  };

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-black via-black to-black text-slate-100">
      {/* Top progress bar */}
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-[#1FE4FF] via-[#7F5CFF] to-[#1FE4FF]"
          style={{
            width: `${progress * 100}%`,
            transition: "width 120ms linear",
          }}
        />
      </div>

      {/* Main layout */}
      <div className="relative z-10 mx-auto flex max-w-6xl gap-8 px-4 pb-32 pt-8 lg:px-8 lg:pt-16">
        {/* Left: sticky navigation */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                IntelliTrade
              </p>
              <h1 className="mt-2 text-sm font-medium text-slate-100">About</h1>
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
                    <span className="text-[9px] font-semibold uppercase tracking-[0.26em] text-teal-300/80">
                      {s.eyebrow}
                    </span>
                    <span className="mt-1 text-[13px] font-medium text-slate-100 group-hover:text-white">
                      {s.title}
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Right: content */}
        <main className="flex-1 space-y-16">
          {sections.map((s, index) => {
            const isHero = s.id === "about-intro";
            const isCTA = s.id === "about-cta";

            return (
              <section
                key={s.id}
                id={s.id}
                className="scroll-mt-28 relative overflow-visible"
              >
                <motion.div
                  initial={{ opacity: 0, y: 32 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true, margin: "-20% 0px -40% 0px" }}
                  transition={{ duration: 0.6, delay: index * 0.04 }}
                  // Added relative and overflow-hidden here so the absolute backdrop stays contained
                  className="relative overflow-hidden rounded-3xl border border-white/20  bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:p-10"
                >
                  {/* 1. THE BACKDROP IS PLACED HERE */}
                  {/* Because it is inside the motion.div, it animates with opacity */}
                  <div className="radial-backdrop" />

                  {/* 2. Wrap content in relative z-10 to sit above backdrop */}
                  <div className="relative z-10">
                    <div className="inline-flex items-center rounded-full border border-teal-400/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-teal-200/90">
                      {s.eyebrow}
                    </div>

                    {isCTA ? (
                      // CTA Specific Layout
                      <div className="mt-4 grid gap-8 md:grid-cols-[1.2fr_1fr] md:items-center">
                        <div>
                          <h3 className="text-2xl font-semibold tracking-tight text-slate-50 md:text-[28px]">
                            {s.title}
                          </h3>
                          <p className="mt-2 text-[15px] leading-relaxed text-slate-200/90">
                            {s.subtitle}
                          </p>
                          <p className="mt-3 text-[13px] text-slate-400">
                            No spam. Just frameworks, macro context, and
                            high-quality tool updates.
                          </p>
                        </div>
                        <form onSubmit={onSubmit} className="space-y-3">
                          <div className="rounded-2xl border border-white/15 bg-white/5 p-3 backdrop-blur-xl">
                            <label className="sr-only" htmlFor="email">
                              Email
                            </label>
                            <input
                              id="email"
                              type="email"
                              value={email}
                              onChange={(e) => setEmail(e.target.value)}
                              placeholder="EMAIL"
                              className="w-full rounded-xl bg-black/40 px-4 py-3 text-sm text-slate-100 outline-none ring-0 placeholder:text-slate-400 focus:bg-black/50 focus:outline-none"
                              autoComplete="off"
                              required
                            />
                            <div className="mt-3 flex items-center justify-between gap-3">
                              <button
                                type="submit"
                                disabled={ctaStatus === "sending"}
                                className="inline-flex w-full items-center justify-center rounded-xl bg-[linear-gradient(90deg,#1FE4FF,#7F5CFF,#1FE4FF)] px-5 py-3 text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-900 transition hover:opacity-95 disabled:opacity-60"
                              >
                                {ctaStatus === "sending"
                                  ? "Unlocking..."
                                  : "Unlock the e-book"}
                              </button>
                            </div>
                          </div>
                          {ctaStatus === "success" && (
                            <p className="text-[13px] text-teal-200/90">
                              Success. Check your inbox shortly.
                            </p>
                          )}
                          {ctaStatus === "error" && (
                            <p className="text-[13px] text-rose-200/90">
                              Something went wrong. Try again.
                            </p>
                          )}
                        </form>
                      </div>
                    ) : (
                      // Standard Layout (Hero & others)
                      <>
                        <h3
                          className={`mt-4 text-2xl font-semibold tracking-tight text-slate-50 ${
                            isHero ? "md:text-3xl" : "md:text-[26px]"
                          }`}
                        >
                          {s.title}
                        </h3>

                        {!!s.subtitle && (
                          <p className="mt-2 text-sm font-medium text-slate-300">
                            {s.subtitle}
                          </p>
                        )}

                        <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-slate-200/90">
                          {s.body?.map((p, idx) => (
                            <p key={idx}>{p}</p>
                          ))}
                        </div>

                        {!!(s as any).bullets?.length && (
                          <div className="mt-8 grid gap-4 md:grid-cols-2">
                            {(s as any).bullets.map((b: any, idx: number) => (
                              <div
                                key={idx}
                                className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl"
                              >
                                <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-teal-200/90">
                                  {b.title}
                                </p>
                                <p className="mt-2 text-[14px] leading-relaxed text-slate-200/90">
                                  {b.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        )}

                        {isHero && (
                          <div className="mt-8 flex flex-wrap gap-3">
                            <a
                              href="/lotsizecalculator"
                              className="inline-flex items-center justify-center rounded-xl bg-[linear-gradient(90deg,#1FE4FF,rgba(31,228,255,0.15))] px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-900 transition hover:opacity-95"
                            >
                              Try the calculator
                            </a>
                            <a
                              href="/blog"
                              className="inline-flex items-center justify-center rounded-xl border border-white/20 bg-white/5 px-5 py-2 text-[12px] font-semibold uppercase tracking-[0.22em] text-slate-100 transition hover:bg-white/10"
                            >
                              Read the blog
                            </a>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                </motion.div>
              </section>
            );
          })}
        </main>
      </div>
    </div>
  );
}