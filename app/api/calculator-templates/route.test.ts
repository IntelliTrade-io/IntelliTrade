// Entitlement tests for the calculator-templates API. Supabase and the
// subscription gate are mocked; RLS provides the same guarantees again at the
// database layer (see supabase/migrations/006_calculator_templates.sql).
import { describe, it, expect, vi, beforeEach } from "vitest";
import { NextResponse } from "next/server";

const requireSubscriptionMock = vi.fn();
vi.mock("@/lib/auth/requireSubscription", () => ({
  requireSubscription: () => requireSubscriptionMock(),
}));

const createClientMock = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: () => createClientMock(),
}));

import { GET, POST } from "./route";

type Row = Record<string, unknown>;

/** Minimal chainable Supabase stub covering the query shapes the routes use. */
function fakeSupabase({ user, subStatus, rows }: { user: { id: string } | null; subStatus?: string; rows?: Row[] }) {
  const insertedRows: Row[] = [];
  const client = {
    insertedRows,
    auth: { getUser: async () => ({ data: { user } }) },
    from(table: string) {
      if (table === "subscriptions") {
        return {
          select: () => ({
            eq: () => ({
              single: async () => ({ data: subStatus ? { status: subStatus } : null }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          order: async () => ({ data: rows ?? [], error: null }),
        }),
        update: () => ({
          eq: () => ({ eq: async () => ({ data: null, error: null }) }),
        }),
        insert: (row: Row) => {
          insertedRows.push(row);
          return {
            select: () => ({
              single: async () => ({
                data: {
                  id: "11111111-1111-4111-8111-111111111111",
                  created_at: "2026-01-01T00:00:00Z",
                  updated_at: "2026-01-01T00:00:00Z",
                  ...row,
                },
                error: null,
              }),
            }),
          };
        },
      };
    },
  };
  return client;
}

const validBody = {
  name: "FTMO 100K",
  balance: 100_000,
  currency: "USD",
  riskPercent: 1,
  instrumentOverrides: { XAUUSD: { contractSize: 100, minLot: 0.01, lotStep: 0.01 } },
};

const postReq = (body: unknown) =>
  new Request("http://localhost/api/calculator-templates", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(() => {
  requireSubscriptionMock.mockReset();
  createClientMock.mockReset();
});

describe("GET /api/calculator-templates", () => {
  it("returns 401 for signed-out users", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ user: null }));
    const res = await GET();
    expect(res.status).toBe(401);
  });

  it("lets a lapsed subscriber read templates but marks them read-only", async () => {
    createClientMock.mockResolvedValue(
      fakeSupabase({
        user: { id: "u1" },
        subStatus: "canceled",
        rows: [
          {
            id: "t1",
            name: "Personal",
            balance: 5000,
            currency: "EUR",
            risk_percent: 1,
            broker_name: null,
            is_default: true,
            instrument_overrides: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
          },
        ],
      }),
    );
    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.canEdit).toBe(false);
    expect(body.templates).toHaveLength(1); // lapse never deletes templates
    expect(body.templates[0].riskPercent).toBe(1);
  });

  it("marks active subscribers as editable", async () => {
    createClientMock.mockResolvedValue(fakeSupabase({ user: { id: "u1" }, subStatus: "active", rows: [] }));
    const res = await GET();
    const body = await res.json();
    expect(body.canEdit).toBe(true);
  });
});

describe("POST /api/calculator-templates", () => {
  it("rejects free users server-side (subscription gate)", async () => {
    requireSubscriptionMock.mockResolvedValue(
      NextResponse.json({ error: "Active subscription required" }, { status: 403 }),
    );
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(403);
  });

  it("rejects signed-out users server-side", async () => {
    requireSubscriptionMock.mockResolvedValue(
      NextResponse.json({ error: "Authentication required" }, { status: 401 }),
    );
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(401);
  });

  it("rejects invalid payloads with a readable message", async () => {
    requireSubscriptionMock.mockResolvedValue(null);
    const res = await POST(postReq({ ...validBody, balance: -1 }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/balance/i);
  });

  it("creates a template for a Pro user with the caller's user_id", async () => {
    requireSubscriptionMock.mockResolvedValue(null);
    const supabase = fakeSupabase({ user: { id: "u1" }, subStatus: "active" });
    createClientMock.mockResolvedValue(supabase);
    const res = await POST(postReq(validBody));
    expect(res.status).toBe(201);
    const body = await res.json();
    expect(body.template.name).toBe("FTMO 100K");
    expect(body.template.instrumentOverrides.XAUUSD.lotStep).toBe(0.01);
    expect(supabase.insertedRows[0]?.user_id).toBe("u1"); // ownership fixed server-side
  });
});
