"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const STORAGE_KEY = "it-cookie-consent";
const OPEN_EVENT = "it-open-consent";

type Choice = "all" | "essential";

function applyConsent(choice: Choice) {
  if (typeof window.gtag !== "function") return;
  const granted: "granted" | "denied" = choice === "all" ? "granted" : "denied";
  window.gtag("consent", "update", {
    ad_storage: granted,
    ad_user_data: granted,
    ad_personalization: granted,
    analytics_storage: granted,
  });
}

/** Cookie banner + Google Consent Mode v2 updates.
 *  Defaults are set to "denied" by the inline script in app/layout.tsx before
 *  gtag loads; this component applies the stored or newly made choice. */
export default function ConsentBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Choice | null;
    if (stored === "all" || stored === "essential") {
      applyConsent(stored);
    } else {
      setVisible(true);
    }
    const reopen = () => setVisible(true);
    window.addEventListener(OPEN_EVENT, reopen);
    return () => window.removeEventListener(OPEN_EVENT, reopen);
  }, []);

  const choose = (choice: Choice) => {
    window.localStorage.setItem(STORAGE_KEY, choice);
    applyConsent(choice);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-label="Cookie consent"
      className="fixed inset-x-0 bottom-0 z-[10000] border-t border-white/10 bg-black/90 backdrop-blur-md px-4 py-4 text-sm text-white"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p className="text-white/80">
          We use cookies for analytics and, if approved, advertising. Essential
          cookies always work; everything else stays off until you agree.{" "}
          <Link href="/cookieStatement" className="underline hover:text-white">
            Cookie statement
          </Link>
        </p>
        <div className="flex shrink-0 gap-2">
          <button
            onClick={() => choose("essential")}
            className="rounded-md border border-white/20 px-4 py-2 text-white/80 hover:bg-white/10"
          >
            Essential only
          </button>
          <button
            onClick={() => choose("all")}
            className="rounded-md bg-white px-4 py-2 font-medium text-black hover:bg-white/90"
          >
            Accept all
          </button>
        </div>
      </div>
    </div>
  );
}

/** Footer link that reopens the banner so consent can be changed any time. */
export function CookiePreferencesLink() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="underline-offset-2 hover:underline"
    >
      Cookie preferences
    </button>
  );
}
