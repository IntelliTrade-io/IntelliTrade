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
      { root: null, rootMargin: "-25% 0px -55% 0px", threshold: [0.05, 0.2] }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [sectionIds]);
  return activeId;
}

// -----------------------------
// Page Component
// -----------------------------
export default function TermsOfServicePage() {
  const sections = useMemo(
    () => [
      {
        id: "tos-welcome",
        eyebrow: "LEGAL • TERMS",
        title: "Terms of Service",
        subtitle: "Effective date: November 1, 2025",
        body: [
          "Welcome to IntelliTrade.tech. These Terms of Service (the “Terms”) govern your access to and use of our websites, applications, tools, data, and content.",
          "By accessing or using the Service, you agree to be bound by these Terms. If you do not agree, you must immediately cease use of the Service.",
        ],
      },
      {
        id: "tos-definitions",
        eyebrow: "SECTION 02",
        title: "Definitions",
        bullets: [
          { title: "Account", desc: "A registered user profile that allows access to certain platform features." },
          { title: "Content", desc: "Text, images, video, audio, code, and data available through the Service." },
          { title: "Output", desc: "Insights, calculations, or results produced by the Service, including AI-generated data." },
          { title: "Subscription", desc: "A paid plan providing access to premium features for a recurring period." },
        ],
      },
      {
        id: "tos-accounts",
        eyebrow: "SECTION 03-04",
        title: "Eligibility & Security",
        body: [
          "You must be at least 18 years of age and capable of entering into a binding contract to use the Service.",
          "You are responsible for maintaining the confidentiality of your credentials. Notify us immediately of any suspected unauthorized use of your Account.",
        ],
      },
      {
        id: "tos-risk",
        eyebrow: "IMPORTANT • RISK",
        title: "No Financial Advice",
        body: [
          "IntelliTrade does not provide investment, financial, legal, or tax advice. All tools and AI outputs are for educational and informational purposes only.",
          "Trading involves substantial risk. You are solely responsible for your decisions and for verifying any Output before acting.",
        ],
        bullets: [
          { title: "No Solicitation", desc: "Our tools do not constitute an offer to buy or sell any financial instrument." },
          { title: "Past Performance", desc: "Hypothetical or back-tested results do not guarantee future outcomes." },
        ],
      },
      {
        id: "tos-usage",
        eyebrow: "SECTION 08",
        title: "Acceptable Use",
        body: ["You agree not to engage in the following prohibited activities:"],
        bullets: [
          { title: "Data Scraping", desc: "Bulk downloading, harvesting, or scraping data without express permission." },
          { title: "Reverse Engineering", desc: "Attempting to extract source code or bypass security controls." },
          { title: "Commercial Abuse", desc: "Reselling or white-labeling the Service without written consent." },
          { title: "Malicious Acts", desc: "Introducing malware or interfering with Service operation." },
        ],
      },
      {
        id: "tos-billing",
        eyebrow: "SECTION 09",
        title: "Billing & Refunds",
        bullets: [
          { title: "Auto-Renewal", desc: "Paid plans renew automatically unless canceled in Account Settings." },
          { title: "Refunds", desc: "No refunds are provided for partial periods except where required by law." },
          { title: "Price Changes", desc: "We may modify pricing with 30 days’ notice via email or in-app notice." },
          { title: "Chargebacks", desc: "Filing a chargeback may result in immediate account suspension." },
        ],
      },
      {
        id: "tos-ip",
        eyebrow: "SECTION 10-11",
        title: "Intellectual Property",
        body: [
          "The Service and its design, software, and data models are owned by IntelliTrade or its licensors.",
          "We grant you a limited, non-exclusive, revocable license for personal or internal business use. We reserve the right to remove User Content that violates these Terms.",
        ],
      },
      {
        id: "tos-ai-data",
        eyebrow: "SECTION 12-13",
        title: "AI & Privacy",
        body: [
          "AI features may generate incorrect or incomplete outputs. You must maintain human oversight for any automated actions.",
          "Your data is handled according to our Privacy and Cookie Policies. Transactional emails are sent as part of the Service.",
        ],
      },
      {
        id: "tos-liability",
        eyebrow: "SECTION 14-16",
        title: "Liability & Indemnity",
        body: [
          "The Service is provided 'AS IS'. To the maximum extent permitted by law, IntelliTrade disclaims all warranties and shall not be liable for indirect or consequential damages.",
          "Our aggregate liability is limited to the amount paid by you for the Service during the previous 12 months.",
        ],
      },
      {
        id: "tos-legal-venue",
        eyebrow: "SECTION 20-21",
        title: "Governing Law",
        body: [
          "These Terms are governed by the laws of the Netherlands. The courts of Amsterdam have exclusive jurisdiction.",
          "EU Consumers: You may access the Online Dispute Resolution platform at https://ec.europa.eu/odr.",
        ],
      },
      {
        id: "tos-provisions",
        eyebrow: "SECTION 22-27",
        title: "Final Provisions",
        bullets: [
          { title: "Force Majeure", desc: "We are not liable for failures beyond our reasonable control (natural disasters, outages)." },
          { title: "Changes", desc: "Material changes to Terms will be notified 14 days in advance." },
          { title: "Severability", desc: "If any provision is held invalid, the remainder remains in full effect." },
        ],
      },
      {
        id: "tos-summary",
        eyebrow: "SUMMARY",
        title: "Key Disclaimers",
        bullets: [
          { title: "No Fiduciary Duty", desc: "We do not act as your financial advisor." },
          { title: "Data Accuracy", desc: "Market data may be delayed or incorrect." },
          { title: "Risk of Loss", desc: "You assume all risks associated with trading decisions." },
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
      <div className="fixed inset-x-0 top-0 z-40 h-1 bg-transparent">
        <div
          className="h-full bg-gradient-to-r from-[#1FE4FF] via-[#7F5CFF] to-[#1FE4FF]"
          style={{ width: `${progress * 100}%`, transition: "width 120ms linear" }}
        />
      </div>

      <div className="relative z-10 mx-auto flex max-w-6xl gap-8 px-4 pb-32 pt-8 lg:px-8 lg:pt-16">
        {/* Navigation Sidebar */}
        <aside className="hidden w-64 shrink-0 lg:block">
          <div className="sticky top-24 space-y-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-[0.3em] text-slate-400">AGREEMENT</p>
              <h1 className="mt-2 text-sm font-medium text-slate-100">Terms</h1>
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

        {/* Content Area */}
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
          
          {/* Footer Contact */}
          <div className="px-6 py-12 text-center">
             <p className="text-sm text-slate-400">Questions? Contact us at <a href="mailto:info@intellitrade.tech" className="text-teal-300">info@intellitrade.tech</a></p>
             <p className="mt-2 text-xs text-slate-500">Parnassusweg 298, 1076 AV Amsterdam, Netherlands</p>
          </div>
        </main>
      </div>
    </div>
  );
}