"use client";

import { useState } from "react";
import Image from "next/image";
import MacroDecoderImage from "@/assets/images/macro-decoder-cover.png";


export default function NewsletterForm() {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "success" | "error">("idle");
  const [isSubmitting, setIsSubmitting] = useState(false);



const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  setIsSubmitting(true);
  setStatus("idle");

  try {
  

   const response = await fetch("/api/newsletter", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email }),
});


    if (!response.ok) throw new Error("Form submission failed");

    setStatus("success");
    setEmail("");
  } catch (error) {
    console.error(error);
    setStatus("error");
  } finally {
    setIsSubmitting(false);
  }
};



  return (
    <section className="w-full rounded-3xl bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 border border-slate-800/70 px-2 py-6 md:px-8 md:py-8 relative overflow-hidden">
          {/* Ambient glows */}
          <div className="pointer-events-none absolute inset-0 opacity-80 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.18),transparent_55%),radial-gradient(circle_at_bottom,_rgba(187,68,240,0.18),transparent_55%)]" />
    
          <div className="relative flex flex-col md:flex-row items-center gap-10">
            {/* Left: Copy + form */}
            <div className="flex-1 max-w-xl">
              <p className="text-xs font-semibold tracking-[0.2em] text-brand-300/80 uppercase mb-2">
                Free E-Book
              </p>
              <h2 className="text-md md:text-2xl font-semibold text-slate-50 mb-3">
                Decode macro like a pro.
              </h2>
              <p className="text-base md:text-sm text-slate-200/90 mb-6">
                Join Intellitrade and get the <span className="font-semibold">Macro Decoder</span> e-book free.
              </p>
    
              <form
                className="space-y-4 md:space-y-0 md:flex md:items-center md:gap-3"
                onSubmit={handleSubmit}
              >
                <label className="sr-only" htmlFor="macro-decoder-email">
                  Email address
                </label>
                <div className="flex-1">
                  <input
                    id="macro-decoder-email"
                    type="email"
                    required
                    placeholder="you@domain.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={isSubmitting}
                    className="w-full rounded-2xl border border-slate-700/80 bg-slate-900/70 px-4 py-3 text-base text-slate-50 placeholder:text-slate-400 shadow-[0_0_0_1px_rgba(15,23,42,0.6)] focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition disabled:opacity-50"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="mt-1 md:mt-0 whitespace-nowrap inline-flex items-center justify-center rounded-2xl px-5 py-3 text-sm md:text-base font-semibold shadow-lg shadow-brand/35 bg-gradient-to-r from-brand to-brandLight hover:from-brand-500 hover:to-brandLight-400 text-white transition-transform active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Sending…" : "Unlock the e-book"}
                  {!isSubmitting && <span className="ml-2 text-xl leading-none">→</span>}
                </button>
              </form>

              {status === "success" && (
                <p className="mt-3 text-sm text-brand-200/90 font-medium">
                  Check your inbox — your e-book is on its way!
                </p>
              )}
              {status === "error" && (
                <p className="mt-3 text-sm text-red-400 font-medium">
                  Something went wrong. Please try again.
                </p>
              )}
    
              <p className="mt-4 text-sm text-slate-400 max-w-xl">
                We&apos;ll email you the e-book + occasional platform updates and new tools.
                Unsubscribe anytime.
              </p>
    
            </div>
    
            {/* Right: e-book cover */}
            <div className="md:w-xs lg:w-xs flex-shrink-0">
              <div className="relative">
                <div className="absolute -inset-4 bg-brand/20 blur-2xl rounded-[2rem]" />
                <div className="relative rounded-[1.8rem] bg-slate-900/80 border border-slate-700/80 shadow-2xl overflow-hidden">
                  <div className="absolute right-3 top-3 rounded-full bg-brand px-3 py-1 text-xs font-semibold text-white shadow-md">
                    Unlock the e-book
                  </div>
                  <Image
                    src={MacroDecoderImage}
                    alt="Macro Decoder e-book cover"
                    className="w-full h-full object-cover"
                    width="100"
                    height="100"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>
  );
}
