import { NextRequest, NextResponse } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const requireSubscriptionMock = vi.fn();
const requireAuthenticatedUserMock = vi.fn();

vi.mock("@/lib/auth/requireSubscription", () => ({
  requireSubscription: () => requireSubscriptionMock(),
}));
vi.mock("@/lib/supabase/server", () => ({
  requireAuthenticatedUser: () => requireAuthenticatedUserMock(),
}));
vi.mock("@/lib/journal/server", () => ({
  applyTradeListFilters: vi.fn(),
  assertOwnedTradeReferences: vi.fn(),
  getTradeListSelect: vi.fn(() => "id"),
  mapTradeList: vi.fn(() => []),
}));

import { GET, POST } from "./route";

describe("Journal API entitlement boundary", () => {
  beforeEach(() => {
    requireSubscriptionMock.mockReset();
    requireAuthenticatedUserMock.mockReset();
  });

  it("returns the native unpaid response before touching journal data", async () => {
    requireSubscriptionMock.mockResolvedValue(
      NextResponse.json({ error: "Active subscription required" }, { status: 403 }),
    );

    const response = await GET(new NextRequest("http://localhost/api/journal"));
    expect(response.status).toBe(403);
    expect(requireAuthenticatedUserMock).not.toHaveBeenCalled();
  });

  it("returns the native anonymous response before touching journal data", async () => {
    requireSubscriptionMock.mockResolvedValue(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );

    const response = await GET(new NextRequest("http://localhost/api/journal"));
    expect(response.status).toBe(401);
    expect(requireAuthenticatedUserMock).not.toHaveBeenCalled();
  });

  it("rejects malformed create payloads without executing access or writes", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/journal", {
        method: "POST",
        body: JSON.stringify({ bias: "long" }),
        headers: { "Content-Type": "application/json" },
      }),
    );

    expect(response.status).toBe(400);
    expect(requireSubscriptionMock).not.toHaveBeenCalled();
    expect(requireAuthenticatedUserMock).not.toHaveBeenCalled();
  });
});
