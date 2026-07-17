// Shared types + validation for calculator account templates (Pro feature).
// Used by the /api/calculator-templates routes (server-side enforcement) and
// by the calculator UI (types + row mapping). Pure and unit-tested; no
// Supabase or React imports.

export interface TemplateInstrumentOverride {
  contractSize: number;
  minLot: number;
  lotStep: number;
}

export interface AccountTemplate {
  id: string;
  name: string;
  balance: number;
  currency: string;
  riskPercent: number;
  brokerName: string | null;
  isDefault: boolean;
  instrumentOverrides: Record<string, TemplateInstrumentOverride>;
  createdAt: string;
  updatedAt: string;
}

/** Validated write payload (create, or full update). */
export interface TemplateInput {
  name: string;
  balance: number;
  currency: string;
  riskPercent: number;
  brokerName: string | null;
  isDefault: boolean;
  instrumentOverrides: Record<string, TemplateInstrumentOverride>;
}

export type ValidationResult = { ok: true; value: TemplateInput } | { ok: false; error: string };

export const TEMPLATE_NAME_MAX = 60;
export const BROKER_NAME_MAX = 80;
export const MAX_INSTRUMENT_OVERRIDES = 50;

const isPositiveFinite = (v: unknown): v is number => typeof v === "number" && isFinite(v) && v > 0;

function validateOverrides(
  raw: unknown,
): { ok: true; value: Record<string, TemplateInstrumentOverride> } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: {} };
  if (typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, error: "Instrument overrides must be an object keyed by instrument." };
  }
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > MAX_INSTRUMENT_OVERRIDES) {
    return { ok: false, error: `At most ${MAX_INSTRUMENT_OVERRIDES} instrument overrides are allowed.` };
  }
  const out: Record<string, TemplateInstrumentOverride> = {};
  for (const [key, value] of entries) {
    if (!/^[A-Z0-9]{3,12}$/.test(key)) {
      return { ok: false, error: `Invalid instrument symbol in overrides: ${key.slice(0, 20)}` };
    }
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ok: false, error: `Override for ${key} must be an object.` };
    }
    const v = value as Record<string, unknown>;
    const { contractSize, minLot, lotStep } = v;
    if (!isPositiveFinite(contractSize) || contractSize > 1e9) {
      return { ok: false, error: `Contract size for ${key} must be a positive number.` };
    }
    if (!isPositiveFinite(minLot) || minLot > 1e6) {
      return { ok: false, error: `Minimum lot for ${key} must be a positive number.` };
    }
    if (!isPositiveFinite(lotStep) || lotStep > 1e6) {
      return { ok: false, error: `Lot step for ${key} must be a positive number.` };
    }
    out[key] = { contractSize, minLot, lotStep };
  }
  return { ok: true, value: out };
}

/**
 * Validate an untrusted template payload. Mirrors the DB CHECK constraints so
 * callers get a readable message instead of a raw constraint violation.
 */
export function validateTemplateInput(body: unknown): ValidationResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Request body must be an object." };
  const b = body as Record<string, unknown>;

  if (typeof b.name !== "string" || b.name.trim().length === 0) {
    return { ok: false, error: "Template name is required." };
  }
  const name = b.name.trim();
  if (name.length > TEMPLATE_NAME_MAX) {
    return { ok: false, error: `Template name must be at most ${TEMPLATE_NAME_MAX} characters.` };
  }

  if (!isPositiveFinite(b.balance) || (b.balance as number) > 1e12) {
    return { ok: false, error: "Account balance must be a positive number." };
  }

  if (typeof b.currency !== "string" || !/^[A-Z]{3}$/.test(b.currency)) {
    return { ok: false, error: "Account currency must be a 3-letter code such as USD." };
  }

  if (!isPositiveFinite(b.riskPercent) || (b.riskPercent as number) > 100) {
    return { ok: false, error: "Risk percentage must be between 0 and 100." };
  }

  let brokerName: string | null = null;
  if (b.brokerName !== undefined && b.brokerName !== null && b.brokerName !== "") {
    if (typeof b.brokerName !== "string") return { ok: false, error: "Broker name must be text." };
    brokerName = b.brokerName.trim().slice(0, BROKER_NAME_MAX) || null;
  }

  const overrides = validateOverrides(b.instrumentOverrides);
  if (!overrides.ok) return overrides;

  return {
    ok: true,
    value: {
      name,
      balance: Math.round((b.balance as number) * 100) / 100,
      currency: b.currency,
      riskPercent: Math.round((b.riskPercent as number) * 1e4) / 1e4,
      brokerName,
      isDefault: b.isDefault === true,
      instrumentOverrides: overrides.value,
    },
  };
}

/** Supabase row (snake_case) -> API shape (camelCase). */
export interface TemplateRow {
  id: string;
  name: string;
  balance: number | string;
  currency: string;
  risk_percent: number | string;
  broker_name: string | null;
  is_default: boolean;
  instrument_overrides: Record<string, TemplateInstrumentOverride> | null;
  created_at: string;
  updated_at: string;
}

export function templateFromRow(row: TemplateRow): AccountTemplate {
  return {
    id: row.id,
    name: row.name,
    balance: Number(row.balance),
    currency: row.currency,
    riskPercent: Number(row.risk_percent),
    brokerName: row.broker_name,
    isDefault: row.is_default,
    instrumentOverrides: row.instrument_overrides ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
