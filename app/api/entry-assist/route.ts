import { NextResponse } from "next/server";

import { requireSubscription } from "@/lib/auth/requireSubscription";
import type { EntryAssistResponse } from "@/types/domain/entry-assist";
import { fetchIntradaySnapshots } from "@/lib/server/entry-assist/snapshots";
import { readFeatureFlags, getCustomerEligibleRules } from "@/lib/server/entry-assist/rulebook";
import { evaluateRules, isStale } from "@/lib/server/entry-assist/evaluator";
import { toPublicCandidate, compareCandidates } from "@/lib/server/entry-assist/dto";

export const dynamic = "force-dynamic";

export async function GET() {
  const denied = await requireSubscription();
  if (denied) return denied;

  try {
    const now = new Date();
    const snapshots = await fetchIntradaySnapshots(now);

    const dataStatus: EntryAssistResponse["dataStatus"] =
      snapshots.length === 0 ? "unavailable" : isStale(snapshots, now) ? "stale" : "ok";

    // Flag values are read here and never leave the server. Under defaults only
    // Tier 1 is eligible; Watchlist rules are excluded regardless of flags.
    const flags = readFeatureFlags();
    const rules = getCustomerEligibleRules(flags);

    const candidates = evaluateRules(snapshots, rules, now)
      .map(toPublicCandidate)
      .sort(compareCandidates);

    const body: EntryAssistResponse = {
      candidates,
      dataStatus,
      evaluatedAt: now.toISOString(),
    };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Entry Assist evaluation failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
