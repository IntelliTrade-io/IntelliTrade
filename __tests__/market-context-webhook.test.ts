import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks: signature/body parsing (next-sanity/webhook), the write client
// (fetch + transaction builder), and revalidatePath. vi.hoisted so the fns
// exist before the hoisted vi.mock factories evaluate.
const { parseBody, fetchMock, transactionMock, createIfNotExists, patch, del, commit, set, revalidatePath } =
  vi.hoisted(() => {
    const set = vi.fn();
    const patchBuilder = { set };
    set.mockReturnValue(patchBuilder);

    const tx: Record<string, unknown> = {};
    const createIfNotExists = vi.fn((_doc: Record<string, unknown>) => tx);
    const patch = vi.fn((_id: string, cb: (p: typeof patchBuilder) => unknown) => {
      cb(patchBuilder);
      return tx;
    });
    const del = vi.fn(() => tx);
    const commit = vi.fn(() => Promise.resolve({}));
    tx.createIfNotExists = createIfNotExists;
    tx.patch = patch;
    tx.delete = del;
    tx.commit = commit;

    return {
      parseBody: vi.fn(),
      fetchMock: vi.fn(),
      transactionMock: vi.fn(() => tx),
      createIfNotExists,
      patch,
      del,
      commit,
      set,
      revalidatePath: vi.fn(),
    };
  });

vi.mock("next-sanity/webhook", () => ({ parseBody }));
vi.mock("@/sanity/writeClient", () => ({
  writeClient: { fetch: fetchMock, transaction: transactionMock },
}));
vi.mock("next/cache", () => ({ revalidatePath }));

import { POST } from "@/app/api/sanity/market-context/route";
import type { NextRequest } from "next/server";

const req = {} as NextRequest;

const PRICE_PATHS = [
  "/gold-price-today",
  "/silver-price-today",
  "/oil-price-today",
  "/bitcoin-price-today",
];

function span(text: string, marks: string[] = []) {
  return { _type: "span", text, marks };
}
function bullet(children: ReturnType<typeof span>[]) {
  return { _type: "block", style: "normal", listItem: "bullet", children };
}
function fullWrapBody() {
  return [
    { _type: "block", style: "h2", children: [span("Cross-Asset Wrap:")] },
    bullet([span("🪙 Gold:", ["strong"]), span(" Gold near $4,000. [USD]")]),
    bullet([span("🥈 Silver:", ["strong"]), span(" Silver near $57. [YIELDS]")]),
    bullet([span("🛢 Oil (Brent):", ["strong"]), span(" Brent near $84. [SUPPLY]")]),
    bullet([span("₿ Crypto:", ["strong"]), span(" BTC near $62k. [RISK]")]),
    { _type: "block", style: "normal", children: [span("")] },
  ];
}

function validPost(overrides: Record<string, unknown> = {}) {
  return {
    _id: "post-1",
    _type: "post",
    title: "Daily market update",
    publishedAt: "2026-07-15T05:38:00.000Z",
    operation: "update",
    body: fullWrapBody(),
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  set.mockReturnValue({ set });
  process.env.SANITY_WEBHOOK_SECRET = "test-secret";
  delete process.env.MARKET_CONTEXT_AUTOMATION_DISABLED;
  // Default: signature valid, valid post body, no existing docs.
  parseBody.mockResolvedValue({ isValidSignature: true, body: validPost() });
  fetchMock.mockResolvedValue([]);
});

describe("market-context webhook POST", () => {
  it("returns 200 skipped when the automation is disabled and never verifies the signature", async () => {
    process.env.MARKET_CONTEXT_AUTOMATION_DISABLED = "1";
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ skipped: "disabled" });
    expect(parseBody).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("401s on an invalid signature and never opens a transaction", async () => {
    parseBody.mockResolvedValue({ isValidSignature: false, body: null });
    const res = await POST(req);
    expect(res.status).toBe(401);
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("ignores draft ids with 200 and no transaction", async () => {
    parseBody.mockResolvedValue({ isValidSignature: true, body: validPost({ _id: "drafts.post-1" }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ignored: "draft" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("ignores non-post types with 200 and no transaction", async () => {
    parseBody.mockResolvedValue({ isValidSignature: true, body: validPost({ _type: "author" }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ignored: "not-a-post" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("ignores posts without publishedAt with 200 and no transaction", async () => {
    parseBody.mockResolvedValue({ isValidSignature: true, body: validPost({ publishedAt: undefined }) });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ ignored: "no-published-at" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("skips non-market posts (no wrap heading) with 200", async () => {
    parseBody.mockResolvedValue({
      isValidSignature: true,
      body: validPost({ body: [{ _type: "block", style: "normal", children: [span("Just a note.")] }] }),
    });
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ skipped: "no-cross-asset-wrap" });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("422s on an invalid wrap and writes nothing (atomicity)", async () => {
    const brokenBody = [
      { _type: "block", style: "h2", children: [span("Cross-Asset Wrap:")] },
      bullet([span("🪙 Gold:", ["strong"]), span(" Gold near $4,000. [USD]")]),
      // silver, oil, crypto missing
    ];
    parseBody.mockResolvedValue({ isValidSignature: true, body: validPost({ body: brokenBody }) });
    const res = await POST(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.missing).toEqual(["silver", "oil", "bitcoin"]);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("happy path: commits once, createIfNotExists + patch 4x each, revalidates all four paths", async () => {
    const res = await POST(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.written).toEqual(["gold", "silver", "oil", "bitcoin"]);
    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(createIfNotExists).toHaveBeenCalledTimes(4);
    expect(patch).toHaveBeenCalledTimes(4);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledTimes(4);
    for (const path of PRICE_PATHS) {
      expect(revalidatePath).toHaveBeenCalledWith(path);
    }
    // createIfNotExists gets the deterministic _id.
    expect(createIfNotExists.mock.calls[0]![0]).toMatchObject({
      _id: "market-context-auto-2026-07-15-gold",
      asset: "gold",
    });
  });

  it("skips an asset that already has a manual doc and still writes the rest", async () => {
    fetchMock.mockResolvedValue([
      { _id: "manual-gold", asset: "gold", date: "2026-07-15", manualOverride: false, sourcePostRef: null },
    ]);
    const res = await POST(req);
    const json = await res.json();
    expect(json.skippedManual).toEqual(["gold"]);
    expect(json.written).toEqual(["silver", "oil", "bitcoin"]);
    expect(createIfNotExists).toHaveBeenCalledTimes(3);
  });

  it("delete operation removes only non-override sourced docs and revalidates", async () => {
    parseBody.mockResolvedValue({
      isValidSignature: true,
      body: { _id: "post-1", _type: "post", operation: "delete" },
    });
    fetchMock.mockResolvedValue(["market-context-auto-2026-07-15-gold", "market-context-auto-2026-07-15-oil"]);
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      deleted: ["market-context-auto-2026-07-15-gold", "market-context-auto-2026-07-15-oil"],
    });
    expect(del).toHaveBeenCalledTimes(2);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(revalidatePath).toHaveBeenCalledTimes(4);
  });

  it("delete operation with no matching docs returns deleted: [] and no transaction", async () => {
    parseBody.mockResolvedValue({
      isValidSignature: true,
      body: { _id: "post-1", _type: "post", operation: "delete" },
    });
    fetchMock.mockResolvedValue([]);
    const res = await POST(req);
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ deleted: [] });
    expect(transactionMock).not.toHaveBeenCalled();
  });

  it("500s when the webhook secret is not configured", async () => {
    delete process.env.SANITY_WEBHOOK_SECRET;
    const res = await POST(req);
    expect(res.status).toBe(500);
    expect(parseBody).not.toHaveBeenCalled();
  });
});
