// Trading journal — domain types, validation, PnL math, and row mappers.
//
// Ported (reduced v1 scope) from the donor journal codebase at
// claudeLoad/IntelliJournalProdReady:
//   * PnL / matched-quantity / status math from lib/trades/math.ts.
//   * Field rules from lib/validation/schemas.ts (used as the SPEC only —
//     re-implemented hand-rolled in this repo's style; NO zod).
//   * Type shapes from lib/types/journal.ts, adapted to the reduced scope.
//
// Scope cuts vs the donor: no accounts/instruments/strategies (symbol is plain
// text, strategies are tags), no screenshots/reviews/exports, no slippage, no
// contract-size (v1 assumes contract size 1; PnL is in quote-currency units).
//
// Pure and unit-tested; no Supabase or React imports. Used by the journal API
// routes (server-side enforcement) and the journal UI (types + mapping + stats).

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type TradeBias = "long" | "short";
export type LegSide = "buy" | "sell";

/** Computed lifecycle of a trade, derived from its legs (never stored). */
export type TradeStatus = "open" | "partial" | "closed";

export interface JournalTradeLeg {
  id: string;
  tradeId: string;
  side: LegSide;
  qty: number;
  price: number;
  fee: number;
  executedAt: string;
  createdAt: string;
}

export interface JournalTrade {
  id: string;
  userId: string;
  symbol: string;
  bias: TradeBias;
  setup: string | null;
  thesis: string | null;
  riskPerTrade: number | null;
  targetR: number | null;
  tags: string[];
  openedAt: string;
  closedAt: string | null;
  /** Opaque market-context stamp (filled in phase J2); JSONB passthrough. */
  context: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  legs: JournalTradeLeg[];
}

// ---------------------------------------------------------------------------
// Validation — hand-rolled, in the lib/calculator-templates.ts style.
// ---------------------------------------------------------------------------

export const SETUP_MAX = 120;
export const THESIS_MAX = 2000;
export const TAG_MAX = 40;
export const MAX_TAGS = 20;
export const MIN_LEGS = 1;
export const MAX_LEGS = 20;
export const SYMBOL_RE = /^[A-Z0-9]{3,15}$/;

/** A single execution as accepted from an untrusted payload. */
export interface LegInput {
  side: LegSide;
  qty: number;
  price: number;
  fee: number;
  executedAt?: string;
}

/** Validated create payload (camelCase; API route maps to snake_case). */
export interface NewTradeInput {
  symbol: string;
  bias: TradeBias;
  setup: string | null;
  thesis: string | null;
  riskPerTrade: number | null;
  targetR: number | null;
  tags: string[];
  openedAt?: string;
  legs: LegInput[];
}

/** Validated partial update. Only present keys are returned. */
export interface TradeUpdateInput {
  setup?: string | null;
  thesis?: string | null;
  riskPerTrade?: number | null;
  targetR?: number | null;
  tags?: string[];
  closedAt?: string | null;
}

export interface ReplaceLegsInput {
  legs: LegInput[];
}

export type ValidationResult<T> = { ok: true; value: T } | { ok: false; error: string };

const isFiniteNumber = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
const isPositiveFinite = (v: unknown): v is number => isFiniteNumber(v) && v > 0;

// ISO-8601 date-time, optionally with fractional seconds and a Z / +hh:mm offset.
const ISO_DATETIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:\d{2})?$/;
const isIsoDateTime = (v: unknown): v is string =>
  typeof v === "string" && ISO_DATETIME_RE.test(v) && !Number.isNaN(Date.parse(v));

function normalizeTags(raw: unknown): { ok: true; value: string[] } | { ok: false; error: string } {
  if (raw === undefined || raw === null) return { ok: true, value: [] };
  if (!Array.isArray(raw)) return { ok: false, error: "Tags must be an array of strings." };
  if (raw.length > MAX_TAGS) return { ok: false, error: `At most ${MAX_TAGS} tags are allowed.` };
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") return { ok: false, error: "Each tag must be a string." };
    const tag = item.trim();
    if (tag.length === 0) continue; // drop blanks silently
    if (tag.length > TAG_MAX) return { ok: false, error: `Each tag must be at most ${TAG_MAX} characters.` };
    const key = tag.toLowerCase();
    if (seen.has(key)) continue; // de-duplicate case-insensitively, keep first
    seen.add(key);
    out.push(tag);
  }
  return { ok: true, value: out };
}

/** Validate one leg. `index` is used only for readable error messages. */
function validateLeg(raw: unknown, index: number): { ok: true; value: LegInput } | { ok: false; error: string } {
  const where = `Leg ${index + 1}`;
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { ok: false, error: `${where} must be an object.` };
  }
  const l = raw as Record<string, unknown>;

  if (l.side !== "buy" && l.side !== "sell") {
    return { ok: false, error: `${where} side must be "buy" or "sell".` };
  }
  if (!isPositiveFinite(l.qty)) {
    return { ok: false, error: `${where} quantity must be a positive number.` };
  }
  if (!isPositiveFinite(l.price)) {
    return { ok: false, error: `${where} price must be a positive number.` };
  }

  let fee = 0;
  if (l.fee !== undefined && l.fee !== null) {
    if (!isFiniteNumber(l.fee) || l.fee < 0) {
      return { ok: false, error: `${where} fee must be zero or a positive number.` };
    }
    fee = l.fee;
  }

  const value: LegInput = { side: l.side, qty: l.qty, price: l.price, fee };

  if (l.executed_at !== undefined || l.executedAt !== undefined) {
    const executedAt = l.executedAt ?? l.executed_at;
    if (!isIsoDateTime(executedAt)) {
      return { ok: false, error: `${where} executed_at must be an ISO-8601 date-time.` };
    }
    value.executedAt = executedAt;
  }

  return { ok: true, value };
}

function validateLegs(raw: unknown): { ok: true; value: LegInput[] } | { ok: false; error: string } {
  if (!Array.isArray(raw)) return { ok: false, error: "Legs must be an array." };
  if (raw.length < MIN_LEGS) return { ok: false, error: "A trade needs at least one leg." };
  if (raw.length > MAX_LEGS) return { ok: false, error: `A trade can have at most ${MAX_LEGS} legs.` };
  const out: LegInput[] = [];
  for (let i = 0; i < raw.length; i++) {
    const leg = validateLeg(raw[i], i);
    if (!leg.ok) return leg;
    out.push(leg.value);
  }
  return { ok: true, value: out };
}

/** Validate an untrusted "create trade" payload. */
export function validateNewTrade(body: unknown): ValidationResult<NewTradeInput> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Request body must be an object." };
  const b = body as Record<string, unknown>;

  if (typeof b.symbol !== "string" || b.symbol.trim().length === 0) {
    return { ok: false, error: "Symbol is required." };
  }
  // Tickers are stored uppercase (matches the DB CHECK); normalize here.
  const symbol = b.symbol.trim().toUpperCase();
  if (!SYMBOL_RE.test(symbol)) {
    return { ok: false, error: "Symbol must be 3-15 uppercase letters or digits (e.g. EURUSD)." };
  }

  if (b.bias !== "long" && b.bias !== "short") {
    return { ok: false, error: 'Bias must be "long" or "short".' };
  }

  const setup = optionalText(b.setup, SETUP_MAX);
  if (!setup.ok) return { ok: false, error: `Setup must be at most ${SETUP_MAX} characters.` };
  const thesis = optionalText(b.thesis, THESIS_MAX);
  if (!thesis.ok) return { ok: false, error: `Thesis must be at most ${THESIS_MAX} characters.` };

  const riskPerTrade = optionalPositive(b.risk_per_trade ?? b.riskPerTrade);
  if (!riskPerTrade.ok) return { ok: false, error: "Risk per trade must be a positive number." };
  const targetR = optionalPositive(b.target_r ?? b.targetR);
  if (!targetR.ok) return { ok: false, error: "Target R must be a positive number." };

  const tags = normalizeTags(b.tags);
  if (!tags.ok) return tags;

  let openedAt: string | undefined;
  const openedRaw = b.opened_at ?? b.openedAt;
  if (openedRaw !== undefined && openedRaw !== null) {
    if (!isIsoDateTime(openedRaw)) return { ok: false, error: "opened_at must be an ISO-8601 date-time." };
    openedAt = openedRaw;
  }

  const legs = validateLegs(b.legs);
  if (!legs.ok) return legs;

  return {
    ok: true,
    value: {
      symbol,
      bias: b.bias,
      setup: setup.value,
      thesis: thesis.value,
      riskPerTrade: riskPerTrade.value,
      targetR: targetR.value,
      tags: tags.value,
      openedAt,
      legs: legs.value,
    },
  };
}

/** Validate an untrusted "update trade" payload (any subset of fields). */
export function validateTradeUpdate(body: unknown): ValidationResult<TradeUpdateInput> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Request body must be an object." };
  const b = body as Record<string, unknown>;
  const out: TradeUpdateInput = {};

  if ("setup" in b) {
    const setup = optionalText(b.setup, SETUP_MAX);
    if (!setup.ok) return { ok: false, error: `Setup must be at most ${SETUP_MAX} characters.` };
    out.setup = setup.value;
  }
  if ("thesis" in b) {
    const thesis = optionalText(b.thesis, THESIS_MAX);
    if (!thesis.ok) return { ok: false, error: `Thesis must be at most ${THESIS_MAX} characters.` };
    out.thesis = thesis.value;
  }
  if ("risk_per_trade" in b || "riskPerTrade" in b) {
    const risk = optionalPositive(b.risk_per_trade ?? b.riskPerTrade);
    if (!risk.ok) return { ok: false, error: "Risk per trade must be a positive number." };
    out.riskPerTrade = risk.value;
  }
  if ("target_r" in b || "targetR" in b) {
    const target = optionalPositive(b.target_r ?? b.targetR);
    if (!target.ok) return { ok: false, error: "Target R must be a positive number." };
    out.targetR = target.value;
  }
  if ("tags" in b) {
    const tags = normalizeTags(b.tags);
    if (!tags.ok) return tags;
    out.tags = tags.value;
  }
  if ("closed_at" in b || "closedAt" in b) {
    const raw = "closedAt" in b ? b.closedAt : b.closed_at;
    if (raw === null) {
      out.closedAt = null; // explicit re-open
    } else if (isIsoDateTime(raw)) {
      out.closedAt = raw;
    } else {
      return { ok: false, error: "closed_at must be an ISO-8601 date-time or null." };
    }
  }

  if (Object.keys(out).length === 0) {
    return { ok: false, error: "No updatable fields were provided." };
  }
  return { ok: true, value: out };
}

/** Validate a full leg replacement payload. */
export function validateReplaceLegs(body: unknown): ValidationResult<ReplaceLegsInput> {
  if (typeof body !== "object" || body === null) return { ok: false, error: "Request body must be an object." };
  const b = body as Record<string, unknown>;
  const legs = validateLegs(b.legs);
  if (!legs.ok) return legs;
  return { ok: true, value: { legs: legs.value } };
}

// Text field that may be omitted, null, or empty (→ null); rejects overlong.
function optionalText(raw: unknown, max: number): { ok: true; value: string | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (typeof raw !== "string") return { ok: false };
  const trimmed = raw.trim();
  if (trimmed.length === 0) return { ok: true, value: null };
  if (trimmed.length > max) return { ok: false };
  return { ok: true, value: trimmed };
}

// Numeric field that may be omitted/null (→ null); rejects non-positive.
function optionalPositive(raw: unknown): { ok: true; value: number | null } | { ok: false } {
  if (raw === undefined || raw === null) return { ok: true, value: null };
  if (!isPositiveFinite(raw)) return { ok: false };
  return { ok: true, value: raw };
}

// ---------------------------------------------------------------------------
// PnL math — ported faithfully from donor lib/trades/math.ts.
//
// Donor differences and why:
//   * Slippage dropped (no column in v1) — PnL = gross - fees only.
//   * contractSize fixed at 1 (no instruments table); PnL is in quote-currency
//     units (price x qty).
//   * Gross PnL is (avgSell - avgBuy) * matchedQty — symmetric across bias, as
//     in the donor: matched quantity always earns (sell price - buy price).
//   * Fees: ALL leg fees are subtracted (both opening and closing), matching the
//     donor's aggregateTrade, even on partially-closed trades. This is a
//     deliberate simplification carried over from the donor.
// ---------------------------------------------------------------------------

/** Minimal leg shape needed for math (accepts full legs or raw inputs). */
export interface MathLeg {
  side: LegSide;
  qty: number;
  price: number;
  fee?: number;
}

export interface TradeAggregate {
  buyQty: number;
  sellQty: number;
  avgBuy: number;
  avgSell: number;
  /** Quantity closed against the opposite side (min of buy/sell volume). */
  matchedQty: number;
  /** Signed remaining exposure, buyQty - sellQty (0 when flat). */
  netPosition: number;
  grossPnl: number;
  fees: number;
  /** grossPnl - fees. */
  netPnl: number;
}

/** Volume-weighted aggregation of a trade's legs. Bias-independent. */
export function aggregateTrade(legs: MathLeg[]): TradeAggregate {
  let buyQty = 0;
  let buyCost = 0;
  let sellQty = 0;
  let sellProceeds = 0;
  let fees = 0;
  for (const l of legs) {
    if (l.side === "buy") {
      buyQty += l.qty;
      buyCost += l.qty * l.price;
    } else {
      sellQty += l.qty;
      sellProceeds += l.qty * l.price;
    }
    fees += l.fee ?? 0;
  }
  const avgBuy = buyQty ? buyCost / buyQty : 0;
  const avgSell = sellQty ? sellProceeds / sellQty : 0;
  const matchedQty = Math.min(buyQty, sellQty);
  const grossPnl = (avgSell - avgBuy) * matchedQty;
  return {
    buyQty,
    sellQty,
    avgBuy,
    avgSell,
    matchedQty,
    netPosition: buyQty - sellQty,
    grossPnl,
    fees,
    netPnl: grossPnl - fees,
  };
}

/** Quantity closed against the opposite side. */
export function matchedQuantity(legs: MathLeg[]): number {
  return aggregateTrade(legs).matchedQty;
}

/** Realized net PnL (gross minus all fees), in quote-currency units. */
export function realizedPnl(_bias: TradeBias, legs: MathLeg[]): number {
  // Bias does not change the arithmetic: matched quantity always realizes
  // (avgSell - avgBuy). Bias only labels which side opens vs closes, which
  // matters for status, not for the signed PnL. Kept as a param for callsite
  // clarity and future contract-size handling.
  return aggregateTrade(legs).netPnl;
}

const EPS = 1e-9;

/**
 * Lifecycle of a trade from its legs.
 *   long:  buy legs open,  sell legs close.
 *   short: sell legs open, buy legs close.
 * open     = nothing closed yet.
 * partial  = some closed, exposure still remaining.
 * closed   = exposure flat (or fully/over-closed).
 */
export function tradeStatus(bias: TradeBias, legs: MathLeg[]): TradeStatus {
  const agg = aggregateTrade(legs);
  const openQty = bias === "long" ? agg.buyQty : agg.sellQty;
  const closeQty = bias === "long" ? agg.sellQty : agg.buyQty;

  if (closeQty <= EPS) return "open";
  if (closeQty + EPS >= openQty) return "closed";
  return "partial";
}

export interface RealizedStats {
  totalTrades: number;
  openTrades: number;
  partialTrades: number;
  closedTrades: number;
  /** Sum of realized net PnL across trades that have closed anything. */
  totalRealizedPnl: number;
  /** Closed trades with realized net PnL > 0. */
  wins: number;
  /** Closed trades with realized net PnL < 0. */
  losses: number;
  /** wins / closedTrades, or null when there are no closed trades. */
  winRate: number | null;
}

/** A trade as needed for aggregate stats (bias + legs). */
export interface StatsTrade {
  bias: TradeBias;
  legs: MathLeg[];
}

/**
 * Portfolio-level realized stats used by the journal summary panel.
 * Realized PnL is summed over trades that have closed at least part of the
 * position (closed or partial); win/loss/win-rate are over fully closed trades.
 */
export function realizedStats(trades: StatsTrade[]): RealizedStats {
  let openTrades = 0;
  let partialTrades = 0;
  let closedTrades = 0;
  let totalRealizedPnl = 0;
  let wins = 0;
  let losses = 0;

  for (const t of trades) {
    const status = tradeStatus(t.bias, t.legs);
    if (status === "open") {
      openTrades++;
      continue; // nothing realized
    }
    const pnl = realizedPnl(t.bias, t.legs);
    totalRealizedPnl += pnl;
    if (status === "partial") {
      partialTrades++;
    } else {
      closedTrades++;
      if (pnl > 0) wins++;
      else if (pnl < 0) losses++;
    }
  }

  return {
    totalTrades: trades.length,
    openTrades,
    partialTrades,
    closedTrades,
    totalRealizedPnl,
    wins,
    losses,
    winRate: closedTrades > 0 ? wins / closedTrades : null,
  };
}

/** R-multiple of a realized PnL against the trade's risk. Null if no risk. */
export function rMultiple(netPnl: number, riskAmount?: number | null): number | null {
  if (!riskAmount || riskAmount === 0) return null;
  return netPnl / riskAmount;
}

// ---------------------------------------------------------------------------
// Row mappers — Supabase snake_case rows → domain camelCase.
// ---------------------------------------------------------------------------

export interface JournalTradeRow {
  id: string;
  user_id: string;
  symbol: string;
  bias: TradeBias;
  setup: string | null;
  thesis: string | null;
  risk_per_trade: number | string | null;
  target_r: number | string | null;
  tags: string[] | null;
  opened_at: string;
  closed_at: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface JournalTradeLegRow {
  id: string;
  trade_id: string;
  user_id: string;
  side: LegSide;
  qty: number | string;
  price: number | string;
  fee: number | string | null;
  executed_at: string;
  created_at: string;
}

export function legFromRow(row: JournalTradeLegRow): JournalTradeLeg {
  return {
    id: row.id,
    tradeId: row.trade_id,
    side: row.side,
    qty: Number(row.qty),
    price: Number(row.price),
    fee: row.fee == null ? 0 : Number(row.fee),
    executedAt: row.executed_at,
    createdAt: row.created_at,
  };
}

export function tradeFromRow(row: JournalTradeRow, legRows: JournalTradeLegRow[] = []): JournalTrade {
  return {
    id: row.id,
    userId: row.user_id,
    symbol: row.symbol,
    bias: row.bias,
    setup: row.setup,
    thesis: row.thesis,
    riskPerTrade: row.risk_per_trade == null ? null : Number(row.risk_per_trade),
    targetR: row.target_r == null ? null : Number(row.target_r),
    tags: row.tags ?? [],
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    context: row.context ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    legs: legRows.map(legFromRow),
  };
}
