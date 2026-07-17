import { describe, it, expect } from "vitest";
import { templateFromRow, validateTemplateInput } from "./calculator-templates";

const validBody = {
  name: "FTMO 100K",
  balance: 100_000,
  currency: "USD",
  riskPercent: 1,
  brokerName: "FTMO",
  isDefault: true,
  instrumentOverrides: {
    XAUUSD: { contractSize: 100, minLot: 0.01, lotStep: 0.01 },
  },
};

describe("validateTemplateInput", () => {
  it("accepts a valid payload and trims the name", () => {
    const r = validateTemplateInput({ ...validBody, name: "  FTMO 100K  " });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value.name).toBe("FTMO 100K");
      expect(r.value.balance).toBe(100_000);
      expect(r.value.instrumentOverrides.XAUUSD?.contractSize).toBe(100);
    }
  });

  it("requires a non-empty name and caps its length", () => {
    expect(validateTemplateInput({ ...validBody, name: "   " }).ok).toBe(false);
    expect(validateTemplateInput({ ...validBody, name: "x".repeat(61) }).ok).toBe(false);
  });

  it("requires a positive finite balance", () => {
    expect(validateTemplateInput({ ...validBody, balance: 0 }).ok).toBe(false);
    expect(validateTemplateInput({ ...validBody, balance: -5 }).ok).toBe(false);
    expect(validateTemplateInput({ ...validBody, balance: "10000" }).ok).toBe(false);
    expect(validateTemplateInput({ ...validBody, balance: Infinity }).ok).toBe(false);
  });

  it("validates the account currency code", () => {
    expect(validateTemplateInput({ ...validBody, currency: "usd" }).ok).toBe(false);
    expect(validateTemplateInput({ ...validBody, currency: "EURO" }).ok).toBe(false);
    expect(validateTemplateInput({ ...validBody, currency: "EUR" }).ok).toBe(true);
  });

  it("bounds the risk percentage to product limits", () => {
    expect(validateTemplateInput({ ...validBody, riskPercent: 0 }).ok).toBe(false);
    expect(validateTemplateInput({ ...validBody, riskPercent: 101 }).ok).toBe(false);
    expect(validateTemplateInput({ ...validBody, riskPercent: 0.25 }).ok).toBe(true);
  });

  it("broker name is optional and trimmed", () => {
    const r = validateTemplateInput({ ...validBody, brokerName: undefined });
    expect(r.ok && r.value.brokerName === null).toBe(true);
    const r2 = validateTemplateInput({ ...validBody, brokerName: "  IC Markets  " });
    expect(r2.ok && r2.value.brokerName === "IC Markets").toBe(true);
  });

  it("rejects malformed instrument overrides", () => {
    expect(validateTemplateInput({ ...validBody, instrumentOverrides: [] }).ok).toBe(false);
    expect(
      validateTemplateInput({ ...validBody, instrumentOverrides: { "bad key": { contractSize: 1, minLot: 0.01, lotStep: 0.01 } } }).ok,
    ).toBe(false);
    expect(
      validateTemplateInput({ ...validBody, instrumentOverrides: { XAUUSD: { contractSize: -1, minLot: 0.01, lotStep: 0.01 } } }).ok,
    ).toBe(false);
    expect(
      validateTemplateInput({ ...validBody, instrumentOverrides: { XAUUSD: { contractSize: 100, minLot: 0.01 } } }).ok,
    ).toBe(false);
  });

  it("overrides are per instrument, never global", () => {
    const r = validateTemplateInput({
      ...validBody,
      instrumentOverrides: {
        XAUUSD: { contractSize: 100, minLot: 0.01, lotStep: 0.01 },
        EURUSD: { contractSize: 100_000, minLot: 0.1, lotStep: 0.1 },
      },
    });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.value.instrumentOverrides)).toEqual(["XAUUSD", "EURUSD"]);
      expect(r.value.instrumentOverrides.EURUSD?.minLot).toBe(0.1);
      expect(r.value.instrumentOverrides.XAUUSD?.minLot).toBe(0.01);
    }
  });

  it("does not accept credential-like fields (schema is fixed)", () => {
    const r = validateTemplateInput({ ...validBody, password: "hunter2", apiKey: "xyz" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(Object.keys(r.value)).toEqual([
        "name",
        "balance",
        "currency",
        "riskPercent",
        "brokerName",
        "isDefault",
        "instrumentOverrides",
      ]);
    }
  });
});

describe("templateFromRow", () => {
  it("maps snake_case rows and coerces numerics", () => {
    const t = templateFromRow({
      id: "a-b",
      name: "Personal",
      balance: "2500.50",
      currency: "EUR",
      risk_percent: "0.5",
      broker_name: null,
      is_default: false,
      instrument_overrides: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-02T00:00:00Z",
    });
    expect(t.balance).toBe(2500.5);
    expect(t.riskPercent).toBe(0.5);
    expect(t.instrumentOverrides).toEqual({});
  });
});
