import type { Metadata } from "next";
import ModulePageShell from "@/components/dashboardv2/modules/ModulePageShell";
import { SupportResistanceAlphaLive } from "@/components/support-resistance/SupportResistanceAlphaLive";

export const metadata: Metadata = {
  title: "Support & Resistance Alpha | IntelliTrade",
  description:
    "EURUSD support-reclaim opportunity grading. Research-backed decision support only — not trading signals.",
};

export default function SupportResistancePage() {
  return (
    <ModulePageShell
      title="EURUSD Support Reclaim Alpha"
      description="Research-backed support-zone opportunity grading for short-term first reactions. Educational decision support only."
    >
      <SupportResistanceAlphaLive />
    </ModulePageShell>
  );
}
