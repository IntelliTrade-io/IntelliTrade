import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the cookie-scoped server client. requireSubscription resolves the caller
// from the session then reads `subscriptions`; every branch is exercised by
// swapping what the mock returns.
const getUser = vi.fn();
const single = vi.fn();
const eq = vi.fn(() => ({ single }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser },
    from,
  })),
}));

import { requireSubscription } from "@/lib/auth/requireSubscription";

beforeEach(() => {
  vi.clearAllMocks();
});

function withUser(id: string | null) {
  getUser.mockResolvedValue({ data: { user: id ? { id } : null } });
}

describe("requireSubscription", () => {
  it("returns 401 when there is no session", async () => {
    withUser(null);
    const res = await requireSubscription();
    expect(res).not.toBeNull();
    expect(res!.status).toBe(401);
    await expect(res!.json()).resolves.toEqual({ error: "Authentication required" });
    // Must not even look at subscriptions without a user.
    expect(from).not.toHaveBeenCalled();
  });

  it("returns 403 when the user has no subscription row", async () => {
    withUser("user-1");
    single.mockResolvedValue({ data: null });
    const res = await requireSubscription();
    expect(res!.status).toBe(403);
    await expect(res!.json()).resolves.toEqual({ error: "Active subscription required" });
    expect(eq).toHaveBeenCalledWith("user_id", "user-1");
  });

  it("returns 403 when the subscription is canceled/inactive", async () => {
    withUser("user-2");
    single.mockResolvedValue({ data: { status: "canceled" } });
    const res = await requireSubscription();
    expect(res!.status).toBe(403);
  });

  it("allows access (null) for an active subscription", async () => {
    withUser("user-3");
    single.mockResolvedValue({ data: { status: "active" } });
    const res = await requireSubscription();
    expect(res).toBeNull();
  });

  it("allows access (null) for a trialing subscription", async () => {
    withUser("user-4");
    single.mockResolvedValue({ data: { status: "trialing" } });
    const res = await requireSubscription();
    expect(res).toBeNull();
  });
});
