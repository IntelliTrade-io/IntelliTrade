import { redirect } from "next/navigation";

// The Support & Resistance Alpha module lives INSIDE the paid dashboard. This
// legacy standalone route redirects into the dashboard with the S&R tab focused,
// so it never feels like a detached page. Middleware still gates /dashboardv2
// (premium), so the paywall is preserved.
export default function SupportResistancePage() {
  redirect("/dashboardv2?panel=supportResistance");
}
