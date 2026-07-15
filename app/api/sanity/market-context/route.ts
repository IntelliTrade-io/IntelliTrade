import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { parseBody } from "next-sanity/webhook";
import { writeClient } from "@/sanity/writeClient";
import {
  parseCrossAssetWrap,
  type PortableTextBlock,
} from "@/lib/sanity/crossAssetWrap";
import { amsterdamDateOf } from "@/lib/sanity/amsterdamDate";
import {
  planMarketContextWrites,
  type ExistingMarketContextDoc,
} from "@/lib/sanity/marketContextPlan";

// Webhook payload projected by the Sanity GROQ-powered webhook (see
// MARKET_CONTEXT_AUTOMATION.md): {_id, _type, title, publishedAt, body,
// "operation": delta::operation()}.
type MarketContextWebhookBody = {
  _id?: string;
  _type?: string;
  title?: string;
  publishedAt?: string;
  body?: PortableTextBlock[];
  operation?: "create" | "update" | "delete";
};

const PRICE_PATHS = [
  "/gold-price-today",
  "/silver-price-today",
  "/oil-price-today",
  "/bitcoin-price-today",
];

function revalidatePricePages(): void {
  for (const path of PRICE_PATHS) revalidatePath(path);
}

export async function POST(req: NextRequest) {
  // Kill switch: env flag, redeploy to take effect.
  if (process.env.MARKET_CONTEXT_AUTOMATION_DISABLED === "1") {
    return NextResponse.json({ skipped: "disabled" });
  }

  const secret = process.env.SANITY_WEBHOOK_SECRET;
  if (!secret) {
    // Misconfiguration: fail loudly so it is caught, but never leak values.
    console.error("[market-context] SANITY_WEBHOOK_SECRET is not configured");
    return NextResponse.json({ error: "Webhook secret not configured" }, { status: 500 });
  }

  const { isValidSignature, body } = await parseBody<MarketContextWebhookBody>(req, secret);
  if (isValidSignature === false) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }
  if (!body) {
    return NextResponse.json({ error: "Missing body" }, { status: 400 });
  }

  const { _id, _type, publishedAt, operation } = body;

  if (_type !== "post") {
    return NextResponse.json({ ignored: "not-a-post" });
  }
  if (typeof _id === "string" && _id.startsWith("drafts.")) {
    return NextResponse.json({ ignored: "draft" });
  }
  const postId = typeof _id === "string" ? _id : "";

  if (operation === "delete") {
    return handleDelete(postId);
  }

  // Unpublished or otherwise incomplete post: nothing to do.
  if (!publishedAt) {
    return NextResponse.json({ ignored: "no-published-at" });
  }

  const parsed = parseCrossAssetWrap(body.body);
  if (!parsed.ok && parsed.reason === "no-heading") {
    // Not a market-update post; no-op.
    return NextResponse.json({ skipped: "no-cross-asset-wrap" });
  }
  if (!parsed.ok) {
    console.error(
      `[market-context] parse failed for post ${postId}: missing=[${parsed.missing.join(",")}]`
    );
    // Never write anything on a parse failure (atomicity).
    return NextResponse.json({ error: "Invalid Cross-Asset Wrap", missing: parsed.missing }, { status: 422 });
  }

  const date = amsterdamDateOf(publishedAt);

  let existingDocs: ExistingMarketContextDoc[];
  try {
    existingDocs = await writeClient.fetch<ExistingMarketContextDoc[]>(
      `*[_type == "marketContext" && !(_id in path("drafts.**")) && date == $date && asset in ["gold","silver","oil","bitcoin"]]{ _id, asset, date, manualOverride, "sourcePostRef": sourcePost._ref }`,
      { date }
    );
  } catch {
    console.error(`[market-context] existing-docs query failed for post ${postId}`);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  const actions = planMarketContextWrites({
    entries: parsed.entries,
    date,
    postId,
    existingDocs: existingDocs ?? [],
  });

  const writes = actions.filter(
    (action): action is Extract<typeof action, { kind: "write" }> => action.kind === "write"
  );
  const skippedManual = actions.filter((a) => a.kind === "skip-manual").map((a) => a.asset);
  const skippedOverride = actions.filter((a) => a.kind === "skip-override").map((a) => a.asset);

  if (writes.length === 0) {
    return NextResponse.json({
      written: [],
      skippedManual,
      skippedOverride,
      ignoredLabels: parsed.ignoredLabels,
    });
  }

  try {
    let transaction = writeClient.transaction();
    for (const write of writes) {
      // createIfNotExists + patch.set (NOT createOrReplace) so editor-added
      // optional fields (stats, weekRecap, relatedLinks) survive a republish.
      transaction = transaction.createIfNotExists({ _id: write.id, ...write.payload });
      transaction = transaction.patch(write.id, (patch) => patch.set(write.payload));
    }
    await transaction.commit();
  } catch {
    // Let Sanity retry; do not dump payloads or secrets.
    console.error(`[market-context] transaction commit failed for post ${postId}`);
    return NextResponse.json({ error: "Commit failed" }, { status: 500 });
  }

  revalidatePricePages();

  const written = writes.map((w) => w.asset);
  console.log(
    `[market-context] post ${postId}: wrote ${written.length}, skippedManual ${skippedManual.length}, skippedOverride ${skippedOverride.length}`
  );
  return NextResponse.json({
    written,
    skippedManual,
    skippedOverride,
    ignoredLabels: parsed.ignoredLabels,
  });
}

// Unpublish policy: remove generated docs sourced from this post, but never
// touch manual docs or overridden docs. Price pages fall back to the newest
// remaining doc per asset.
async function handleDelete(postId: string) {
  if (!postId) {
    return NextResponse.json({ deleted: [] });
  }

  let ids: string[];
  try {
    ids = await writeClient.fetch<string[]>(
      `*[_type == "marketContext" && !(_id in path("drafts.**")) && sourcePost._ref == $postId && manualOverride != true]._id`,
      { postId }
    );
  } catch {
    console.error(`[market-context] delete query failed for post ${postId}`);
    return NextResponse.json({ error: "Query failed" }, { status: 500 });
  }

  if (!ids || ids.length === 0) {
    return NextResponse.json({ deleted: [] });
  }

  try {
    let transaction = writeClient.transaction();
    for (const id of ids) transaction = transaction.delete(id);
    await transaction.commit();
  } catch {
    console.error(`[market-context] delete commit failed for post ${postId}`);
    return NextResponse.json({ error: "Commit failed" }, { status: 500 });
  }

  revalidatePricePages();
  console.log(`[market-context] post ${postId}: deleted ${ids.length}`);
  return NextResponse.json({ deleted: ids });
}
