"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import "@/styles/lot-size-calculator.css";

// -----------------------------
// Hooks
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
          .sort((a, b) => (b.intersectionRatio ?? 0) - (a.intersectionRatio ?? 0));

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
// Page Component
// -----------------------------
export default function PrivacyStatementPage() {
  const sections = useMemo(
    () => [
      {
        id: "privacy-intro",
        eyebrow: "LEGAL • PRIVACY",
        title: "Privacy Statement",
        body: [
          "This Privacy Policy explains how IntelliTrade Technologies (\"IntelliTrade\", \"we\", \"us\", \"our\") collects, uses, and shares information when you visit intellitrade.tech or use our apps, tools, and features (the \"Service\").",
          "EEA/UK notice: We obtain prior consent for non‑essential cookies and similar technologies. You can manage or withdraw consent anytime via our cookie banner or Cookie Settings link.",
        ],
      },
      {
        id: "controller",
        eyebrow: "SECTION 01",
        title: "Controller & Contact",
        body: [
          "Controller: IntelliTrade Technologies",
          "Business correspondence address: Parnassusweg 298, 1076 AV Amsterdam, Netherlands",
          "Email: info@intellitrade.tech",
          "If we appoint an EU Representative or DPO, we will update this section.",
        ],
      },
      {
        id: "data-collect",
        eyebrow: "SECTION 02",
        title: "Data We Collect",
        bullets: [
          { title: "Account data", desc: "Email, password hash, and user preferences." },
          { title: "Transactional data", desc: "Plan, invoices, payment status, VAT/tax country. Payments handled by processors; we don’t store full card numbers." },
          { title: "Usage & Device", desc: "IP address, device/OS/browser, language, time zone, pages/events, and approximate location from IP." },
          { title: "Communications", desc: "Support messages and newsletter signup data." },
        ],
      },
      {
        id: "sources",
        eyebrow: "SECTION 03",
        title: "Sources",
        bullets: [
          { title: "Directly", desc: "Provided by you via forms and emails." },
          { title: "Automatically", desc: "Collected via cookies, SDKs, and server logs." },
          { title: "Service Providers", desc: "Data from payment processors, analytics, and support tools." },
        ],
      },
      {
        id: "purposes",
        eyebrow: "SECTION 04",
        title: "Purposes & Legal Bases",
        body: ["Processing under GDPR Art. 6:"],
        bullets: [
          { title: "Service Provision", desc: "Accounts, features, payments — Art. 6(1)(b) contract." },
          { title: "Security", desc: "Fraud prevention — Art. 6(1)(f) legitimate interests." },
          { title: "Marketing", desc: "Communications — Art. 6(1)(a) consent (opt-out anytime)." },
          { title: "Analytics", desc: "Product improvement — Art. 6(1)(a) consent for non-essential cookies." },
        ],
      },
      {
        id: "adsense",
        eyebrow: "SECTION 05",
        title: "Google AdSense",
        body: [
          "Third‑party vendors, including Google, use cookies to serve ads based on prior visits. Google’s use of advertising cookies enables it and its partners to serve ads based on your visit to this and/or other sites.",
          "Opt‑out of personalized ads: visit Google Ads Settings (https://adssettings.google.com).",
        ],
      },
      {
        id: "sharing",
        eyebrow: "SECTION 06",
        title: "Sharing",
        body: [
          "We share personal data with service providers (hosting, storage, analytics, email, payments, support, security), and advertising partners (with consent in the EEA).",
          "We do not sell personal information.",
        ],
      },
      {
        id: "retention",
        eyebrow: "SECTION 08",
        title: "Retention",
        body: [
          "We retain data as needed for the purposes above and to meet legal obligations. Typical periods: account lifecycle; billing up to 7 years; logs 12–24 months; marketing preferences until opt‑out.",
        ],
      },
      {
        id: "rights",
        eyebrow: "SECTION 09",
        title: "Your Rights",
        body: [
          "Depending on your location, you may have rights to access, rectify, erase, restrict, object, data portability, and to withdraw consent at any time. Contact info@intellitrade.tech to exercise these rights.",
        ],
      },
      {
        id: "security-legal",
        eyebrow: "SECTION 11-13",
        title: "Security & Final Provisions",
        bullets: [
          { title: "Security", desc: "We apply appropriate technical measures like encryption in transit and access controls." },
          { title: "Children", desc: "The Service is not directed to children under 16." },
          { title: "Changes", desc: "Updates will be posted here; material changes will be notified via email." },
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
          style={{
            width: `${progress * 100}%`,
            transition: "width 120ms linear",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl gap-8 px-4 pb-32 pt-8 lg:px-8 lg:pt-16">
        {/* Left: sticky navigation */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">
                INTELLITRADE
              </p>
              <h1 className="mt-2 text-sm font-medium text-slate-100">Privacy</h1>
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
          {sections.map((s, index) => (
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
                className="relative overflow-hidden rounded-3xl border border-white/20 bg-clip-padding p-6 shadow-[0_32px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl md:p-10"
              >
                {/* BACKDROP APPLIED HERE */}
                <div className="radial-backdrop" />

                <div className="relative z-10">
                  <div className="inline-flex items-center rounded-full border border-teal-400/30 bg-white/5 px-4 py-1 text-[11px] font-medium tracking-[0.22em] text-teal-200/90">
                    {s.eyebrow}
                  </div>

                  <h3 className="mt-4 text-2xl font-semibold tracking-tight text-slate-50 md:text-[26px]">
                    {s.title}
                  </h3>

                  <div className="mt-7 space-y-4 text-[15px] leading-relaxed text-slate-200/90">
                    {s.body?.map((p, idx) => (
                      <p key={idx}>{p}</p>
                    ))}
                  </div>

                  {!!s.bullets?.length && (
                    <div className="mt-8 grid gap-4 md:grid-cols-2">
                      {s.bullets.map((b, idx) => (
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
                </div>
              </motion.div>
            </section>
          ))}
        </main>
      </div>
    </div>
  );
}