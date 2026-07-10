import { describe, it, expect, vi, beforeEach } from "vitest";

// Webhook mocks: signature verification (stripe) + the service-role writer.
// vi.hoisted so the fns exist before the hoisted vi.mock factories eval them.
const { constructEvent, single, eq, select, upsert, from } = vi.hoisted(() => {
  const single = vi.fn();
  const eq = vi.fn(() => ({ single }));
  const select = vi.fn(() => ({ eq }));
  const upsert = vi.fn(() => Promise.resolve({ error: null }));
  const from = vi.fn(() => ({ select, upsert }));
  return { constructEvent: vi.fn(), single, eq, select, upsert, from };
});

vi.mock("@/lib/stripe", () => ({
  stripe: { webhooks: { constructEvent } },
}));
vi.mock("@/lib/supabase/admin", () => ({
  supabaseAdmin: { from },
}));

import { POST } from "@/app/api/stripe/webhook/route";

type ReqInit = { body?: string; sig?: string | null };
function makeReq({ body = "{}", sig = "whsec_test" }: ReqInit = {}) {
  return {
    text: async () => body,
    headers: { get: (k: string) => (k === "stripe-signature" ? sig : null) },
  } as unknown as import("next/server").NextRequest;
}

function subscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_123",
    customer: "cus_123",
    status: "active",
    metadata: {},
    current_period_end: 1_800_000_000,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_secret";
  // Default: existing subscription row maps customer → user.
  single.mockResolvedValue({ data: { user_id: "user-1" } });
});

describe("stripe webhook POST", () => {
  it("400s when the signature header is missing", async () => {
    const res = await POST(makeReq({ sig: null }));
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Missing signature" });
    expect(constructEvent).not.toHaveBeenCalled();
  });

  it("400s when signature verification throws", async () => {
    constructEvent.mockImplementation(() => {
      throw new Error("bad sig");
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({ error: "Invalid signature" });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("ignores unrelated event types without writing", async () => {
    constructEvent.mockReturnValue({ type: "invoice.paid", data: { object: {} } });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ received: true });
    expect(from).not.toHaveBeenCalled();
  });

  it("upserts an active subscription as plan=pro with period end", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: subscription() },
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(upsert).toHaveBeenCalledTimes(1);
    const [payload, opts] = upsert.mock.calls[0]!;
    expect(payload).toMatchObject({
      user_id: "user-1",
      stripe_customer_id: "cus_123",
      stripe_subscription_id: "sub_123",
      plan: "pro",
      status: "active",
      current_period_end: new Date(1_800_000_000 * 1000).toISOString(),
    });
    expect(opts).toEqual({ onConflict: "user_id" });
  });

  it("maps inactive statuses to plan=demo", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.deleted",
      data: { object: subscription({ status: "canceled" }) },
    });
    await POST(makeReq());
    expect(upsert.mock.calls[0]![0]).toMatchObject({ plan: "demo", status: "canceled" });
  });

  it("falls back to the first item's period end when the top-level field is absent", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: {
        object: subscription({
          current_period_end: undefined,
          items: { data: [{ current_period_end: 1_700_000_000 }] },
        }),
      },
    });
    await POST(makeReq());
    expect(upsert.mock.calls[0]![0]).toMatchObject({
      current_period_end: new Date(1_700_000_000 * 1000).toISOString(),
    });
  });

  it("writes null period end when neither source is present", async () => {
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: subscription({ current_period_end: undefined }) },
    });
    await POST(makeReq());
    expect(upsert.mock.calls[0]![0]).toMatchObject({ current_period_end: null });
  });

  it("resolves user from metadata when no existing row matches the customer", async () => {
    single.mockResolvedValue({ data: null });
    constructEvent.mockReturnValue({
      type: "customer.subscription.created",
      data: { object: subscription({ metadata: { user_id: "meta-user" } }) },
    });
    await POST(makeReq());
    expect(upsert.mock.calls[0]![0]).toMatchObject({ user_id: "meta-user" });
  });

  it("skips the write when no user can be resolved", async () => {
    single.mockResolvedValue({ data: null });
    constructEvent.mockReturnValue({
      type: "customer.subscription.updated",
      data: { object: subscription({ metadata: {} }) },
    });
    const res = await POST(makeReq());
    expect(res.status).toBe(200);
    expect(upsert).not.toHaveBeenCalled();
  });
});
