# Market Context automation — blog post to price pages

**STATUS 2026-07-15: DONE in code, left uncommitted (lead reviews + commits).** Owner steps to wire it live are in `OWNER_TODO.md` ("Market Context automation"). It does nothing until the site is next deployed and the Sanity webhook + two env vars are configured.

When the cofounder publishes a daily blog `post` in Sanity, a webhook calls a new Next.js route that deterministically parses the "Cross-Asset Wrap" section of the post body and creates or updates four published `marketContext` documents (gold, silver, oil, bitcoin) in one transaction, then revalidates the four price pages. No LLM parsing. No backfill of old posts.

## What it does

Each daily post ends with a section like:

```
Cross-Asset Wrap:                                  (h2 heading)
  🪙 Gold: Gold is trading around $4,000 ... [USD] [REAL YIELDS]     (bullet)
  🥈 Silver: XAG/USD is near $57.50 ... [YIELDS] [GROWTH]            (bullet)
  🛢 Oil (Brent): Brent is above $84 ... [SUPPLY] [GEOPOLITICS]      (bullet)
  📈 Stocks: The S&P 500 fell ... [CPI] [TECH]                       (bullet, ignored)
  ₿ Crypto: Bitcoin is trading around $62,800 ... [RISK]            (bullet)
```

The route extracts the paragraph after each asset label (verbatim: numbers, punctuation and bracketed driver tags untouched) and writes it into the `paragraphs` field of the matching `marketContext` document. Stocks and any unrecognised label are ignored. The price pages (`/gold-price-today` etc.) already read the newest `marketContext` per asset, so the daily text appears automatically.

## Request flow

1. Owner publishes a `post` in Sanity Studio.
2. Sanity's GROQ-powered webhook POSTs a projected payload to `/api/sanity/market-context`:
   `{_id, _type, title, publishedAt, body, "operation": delta::operation()}`.
3. The route verifies the webhook signature (`next-sanity/webhook` `parseBody`), guards on type/draft/publishedAt, parses the wrap (`lib/sanity/crossAssetWrap.ts`), computes the Amsterdam calendar date (`lib/sanity/amsterdamDate.ts`), plans per-asset writes (`lib/sanity/marketContextPlan.ts`), commits one transaction via the write client (`sanity/writeClient.ts`), and calls `revalidatePath` on the four price pages.

Documents use a deterministic id, `market-context-auto-<YYYY-MM-DD>-<asset>`, so republishing the same post updates the same four documents instead of creating duplicates.

## Conflict policy

Decided per asset, for the post's Amsterdam date:

| Situation | Action |
| --- | --- |
| No `marketContext` for that asset+date | Create/update the auto-id document |
| The auto-id document exists, `manualOverride` off | Update it (optional fields like `stats`/`weekRecap`/`relatedLinks` are preserved) |
| The auto-id document exists, `manualOverride` **on** | Skip — never touched |
| A document with a **non-auto** id exists for that asset+date (editor authored it by hand) | Skip — the editor owns that asset that day |

Writes use `createIfNotExists` + `patch.set` (not `createOrReplace`), so any optional fields an editor added to a generated document survive a republish.

## Unpublish policy

On a `delete` operation (post unpublished/deleted), the route deletes only the published `marketContext` documents whose `sourcePost` points at that post **and** whose `manualOverride` is not on. Manual documents and overridden documents are never deleted. Each price page then falls back to the newest remaining document per asset.

## Parse failure

If a post has a "Cross-Asset Wrap" heading but the four required assets cannot all be extracted (missing asset, empty paragraph, duplicate asset), the route writes **nothing** and returns 422. The Studio also blocks publishing such a post (see `schemaTypes/post.ts` body validation), so this is a backstop. A post with no wrap heading is treated as a non-market post and the route no-ops (200).

## Environment variables

Set server-side (never behind `NEXT_PUBLIC_`):

- `SANITY_API_WRITE_TOKEN` — Sanity API token, Editor role, for the write client.
- `SANITY_WEBHOOK_SECRET` — shared secret the webhook signs with; the route rejects unsigned/mismatched requests (401).
- `MARKET_CONTEXT_AUTOMATION_DISABLED` — optional kill switch; set to `1` and redeploy to make the route a no-op (200 `{skipped:"disabled"}`).

## Sanity webhook config (one-time, owner)

At sanity.io/manage, project `6s37xbfh` → API → Webhooks → Create webhook:

- Name: `market-context-automation`
- URL: `https://intellitrade.tech/api/sanity/market-context`
- Dataset: `production`
- Trigger on: Create, Update, Delete
- Include drafts: **OFF**
- Filter: `_type == "post"`
- Projection: `{_id, _type, title, publishedAt, body, "operation": delta::operation()}`
- HTTP method: POST
- API version: `2024-01-01` or later
- Secret: the `SANITY_WEBHOOK_SECRET` value

## Kill switches

- **Instant:** disable (or delete) the webhook in sanity.io/manage. The route stops being called.
- **Env:** set `MARKET_CONTEXT_AUTOMATION_DISABLED=1` in Vercel and redeploy. The route returns 200 `{skipped:"disabled"}` without touching anything.

## Rollback

Disable the webhook, then revert the automation commits. Generated documents are ordinary `marketContext` documents and stay valid on the price pages; nothing needs cleaning up. Manual documents and overrides were never touched.

## Notes

- **No historical backfill.** Only posts published after the webhook is live get processed. Old posts are left as they are.
- **Latency without revalidation.** Even if `revalidatePath` is skipped for any reason, the content still appears on the price pages within at most 5 minutes, because `fetchMarketContext` (`lib/api/marketContext.ts`) uses `next: { revalidate: 300 }`.
- The webhook only works after the next production deploy of the site (the repo is in no-push refactor mode until the lead does the big push).
