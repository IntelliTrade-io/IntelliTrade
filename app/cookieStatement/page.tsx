"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import "@/styles/lot-size-calculator.css";

// -----------------------------
// Hooks (Consistent with Macro Mastery style)
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
    const els = sectionIds.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const obs = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));
        if (visible[0]?.target && (visible[0].target as HTMLElement).id) {
          setActiveId((visible[0].target as HTMLElement).id);
        }
      },
      { root: null, rootMargin: "-25% 0px -55% 0px", threshold: [0.1, 0.5] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sectionIds]);
  return activeId;
}

// -----------------------------
// Page
// -----------------------------
export default function CookieStatementPage() {
  const sections = useMemo(
    () => [
      {
        id: "cookie-intro",
        eyebrow: "LEGAL • COOKIES",
        title: "Cookie Statement",
        subtitle: "Last updated: November 1, 2025",
        body: [
          "This Cookie Policy explains how IntelliTrade Technologies uses cookies and similar technologies on intellitrade.tech.",
          "This document should be read in conjunction with our Privacy Policy to understand our full approach to data processing.",
        ],
      },
      {
        id: "technologies",
        eyebrow: "SECTION 01",
        title: "Technologies We Use",
        bullets: [
          { title: "Cookies", desc: "Standard HTTP and HTML5 cookies used to store small pieces of data on your device." },
          { title: "Storage", desc: "Local and session storage to maintain platform state and user preferences." },
          { title: "Tracking", desc: "Pixels, tags, and SDKs used for high-fidelity analytics and advertising measurement." },
        ],
      },
      {
        id: "why-use",
        eyebrow: "SECTION 02",
        title: "Why We Use Them",
        body: [
          "We prioritize your privacy. We do not set non-essential cookies for users in the EEA without prior explicit consent.",
        ],
        bullets: [
          { title: "Essential", desc: "Required for security, load balancing, and user authentication." },
          { title: "Preferences", desc: "Used to remember your choices, such as language and interface settings." },
          { title: "Analytics", desc: "Usage metrics and error reporting to improve platform performance." },
          { title: "Advertising", desc: "Personalizing and measuring ad effectiveness (only with consent)." },
        ],
      },
      {
        id: "choices",
        eyebrow: "SECTION 03",
        title: "Your Choices",
        body: [
          "On your first visit, we request consent for non-essential cookies. You can manage or withdraw this consent anytime via our banner.",
          "Refusing non-essential cookies will not block access to the platform, though some personalized features may be limited.",
          "We implement a CMP compatible with IAB Europe TCF 2.2 that strictly blocks non-essential tags until you provide consent.",
        ],
      },
      {
        id: "adsense-disclosures",
        eyebrow: "SECTION 04",
        title: "Advertising Disclosures",
        body: [
          "If we display Google ads, third-party vendors (including Google) use cookies to serve ads based on your prior visits to this or other sites.",
          "Google may use Privacy Sandbox technologies (Topics, Protected Audiences, Attribution Reporting) to deliver and measure ads without relying on third-party cookies.",
          "You can opt-out of personalized ads via Google Ads Settings (adssettings.google.com) or AboutAds (aboutads.info).",
        ],
      },
      {
        id: "browser-manage",
        eyebrow: "SECTION 05",
        title: "Browser Controls",
        bullets: [
          { title: "Chrome", desc: "Manage via chrome://settings/cookies" },
          { title: "Firefox", desc: "Manage via about:preferences#privacy" },
          { title: "Safari", desc: "Manage via Settings → Privacy" },
          { title: "Edge", desc: "Manage via edge://settings/content/cookies" },
        ],
      },
      {
        id: "contact-cookie",
        eyebrow: "SECTION 06",
        title: "Contact & Updates",
        body: [
          "Material changes to this policy will be notified via the Service or email. For questions regarding our cookie usage, please contact us:",
          "IntelliTrade Technologies",
          "Parnassusweg 298, 1076 AV Amsterdam, Netherlands",
          "info@intellitrade.tech",
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
    <div className="relative min-h-screen bg-black text-slate-100">
      {/* Top progress bar */}
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-[#1FE4FF] via-[#7F5CFF] to-[#1FE4FF]"
          style={{ width: `${progress * 100}%`, transition: "width 120ms linear" }}
        />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl gap-8 px-4 pb-32 pt-8 lg:px-8 lg:pt-16">
        {/* Left Nav */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">Legal</p>
              <h1 className="mt-2 text-sm font-medium text-slate-100">Cookies</h1>
            </div>
            <div className="h-px bg-white/10" />
            <nav className="space-y-2 text-sm">
              {sections.map((s) => {
                const isActive = s.id === activeId;
                return (
                  <button
                    key={s.id}
                    onClick={() => handleNavClick(s.id)}
                    className={[
                      "group flex w-full flex-col items-start rounded-xl px-3 py-2 text-left transition",
                      isActive ? "bg-white/10" : "hover:bg-white/5",
                    ].join(" ")}
                  >
                    <span className="text-[9px] font-semibold uppercase tracking-[0.26em] text-teal-300/80">{s.eyebrow}</span>
                    <span className="mt-1 text-[13px] font-medium text-slate-100 group-hover:text-white">{s.title}</span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 space-y-16">
          {sections.map((s, index) => (
            <section key={s.id} id={s.id} className="scroll-mt-28 relative">
              <motion.div
                initial={{ opacity: 0, y: 32 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, margin: "-20% 0px -40% 0px" }}
                transition={{ duration: 0.6, delay: index * 0.04 }}
                className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:p-10"
              >
                {/* BACKDROP APPLIED TO EVERY SECTION */}
                <div className="radial-backdrop" />

                <div className="relative z-10">
                  <div className="inline-flex items-center rounded-full border border-teal-400/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-teal-200/90">
                    {s.eyebrow}
                  </div>

                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                    {s.title}
                  </h3>

                  {s.subtitle && <p className="mt-2 text-sm font-medium text-slate-400">{s.subtitle}</p>}

                  <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-slate-200/90">
                    {s.body?.map((p, idx) => (
                      <p key={idx}>{p}</p>
                    ))}
                  </div>

                  {s.bullets && (
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                      {s.bullets.map((b, idx) => (
                        <div key={idx} className="rounded-2xl border border-white/15 bg-white/5 p-5 backdrop-blur-xl">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-teal-200/90">{b.title}</p>
                          <p className="mt-2 text-[14px] leading-relaxed text-slate-200/90">{b.desc}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </motion.div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}