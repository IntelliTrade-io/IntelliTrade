import { SignUpForm } from "@/components/auth/SignUpForm";
import { Check } from "lucide-react";

const POINTS = [
  "Subscribe to IntelliTrade Pro when you're ready",
  "Founding Member pricing: €15/month for the first 100 members",
  "Cancel anytime — no contracts",
];

export default function Page() {
  return (
    <div className="flex min-h-[80vh] w-full items-center justify-center px-4 py-12">
      <div className="grid w-full max-w-4xl items-center gap-10 md:grid-cols-2">
        {/* Value panel */}
        <div className="order-2 md:order-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-violet-300/80 mb-3">
            IntelliTrade Pro
          </p>
          <h2 className="text-2xl font-semibold tracking-tight text-white mb-4">
            Create your free account
          </h2>
          <ul className="space-y-3">
            {POINTS.map((point) => (
              <li key={point} className="flex items-start gap-3 text-sm text-white/70">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-400" />
                {point}
              </li>
            ))}
          </ul>
          <p className="mt-6 text-xs leading-relaxed text-white/40">
            IntelliTrade provides educational market context and analytics. It is not a signal service and
            does not provide financial advice.
          </p>
        </div>

        {/* Form */}
        <div className="order-1 w-full md:order-2">
          <SignUpForm />
        </div>
      </div>
    </div>
  );
}
