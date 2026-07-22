import type {
  JournalDashboardStats,
  JournalExportFormat,
  JournalExportResource,
  JournalReviewPeriod,
  JournalReviewStatsSnapshot,
  TradeDetailResponse,
  TradeLegRow,
} from "./types";
import {
  CreateTradeSchema,
  JournalExportQuerySchema,
  ReplaceTradeLegsSchema,
  ReviewSaveSchema,
  UpdateTradeSchema,
  type CreateTrade,
  type JournalExportQuery,
  type ReplaceTradeLegs,
  type ReviewSave,
  type UpdateTrade,
} from "./validation";

export type TradeLegDraft = {
  client_id: string;
  side: "buy" | "sell";
  qty: string;
  price: string;
  fee: string;
  slippage: string;
  executed_at: string;
};

export type CreateTradeFormValues = {
  account_id: string;
  instrument_id: string;
  strategy_id: string;
  setup: string;
  bias: "long" | "short";
  thesis: string;
  risk_per_trade: string;
  target_r: string;
  tags: string;
  opened_at: string;
  legs: TradeLegDraft[];
};

export type CreateTradeFormValidation =
  | { success: true; data: CreateTrade }
  | { success: false; fieldErrors: Record<string, string> };

export type UpdateTradeFormValues = Omit<CreateTradeFormValues, "legs">;

export type UpdateTradeFormValidation =
  | { success: true; data: UpdateTrade }
  | { success: false; fieldErrors: Record<string, string> };

export type TradeLegEditFormValues = {
  legs: TradeLegDraft[];
};

export type TradeLegEditFormValidation =
  | { success: true; data: ReplaceTradeLegs }
  | { success: false; fieldErrors: Record<string, string> };

export type ReviewSaveFormValues = {
  period: ReviewSave["period"];
  period_start: string;
  period_end: string;
  notes: string;
};

export type JournalExportFormValues = {
  resource: JournalExportResource;
  format: JournalExportFormat;
  from: string;
  to: string;
  period: JournalReviewPeriod | "";
};

function randomId() {
  return typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
    ? crypto.randomUUID()
    : `leg_${Math.random().toString(16).slice(2, 10)}`;
}

export function toDateTimeLocalInputValue(date = new Date()) {
  const localDate = new Date(
    date.getTime() - date.getTimezoneOffset() * 60_000,
  );
  return localDate.toISOString().slice(0, 16);
}

export function createEmptyTradeLegDraft(
  executedAt = toDateTimeLocalInputValue(),
): TradeLegDraft {
  return {
    client_id: randomId(),
    side: "buy",
    qty: "",
    price: "",
    fee: "0",
    slippage: "0",
    executed_at: executedAt,
  };
}

export function createInitialTradeFormValues(
  defaults: {
    account_id?: string;
    instrument_id?: string;
    strategy_id?: string;
  } = {},
): CreateTradeFormValues {
  const openedAt = toDateTimeLocalInputValue();

  return {
    account_id: defaults.account_id ?? "",
    instrument_id: defaults.instrument_id ?? "",
    strategy_id: defaults.strategy_id ?? "",
    setup: "",
    bias: "long",
    thesis: "",
    risk_per_trade: "",
    target_r: "",
    tags: "",
    opened_at: openedAt,
    legs: [createEmptyTradeLegDraft(openedAt)],
  };
}

function toNullableString(value: string) {
  const normalizedValue = value.trim();
  return normalizedValue === "" ? null : normalizedValue;
}

function toOptionalNumber(value: string) {
  const normalizedValue = value.trim();
  if (normalizedValue === "") {
    return null;
  }

  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN;
}

function toRequiredNumber(value: string) {
  const normalizedValue = value.trim();
  const parsedValue = Number(normalizedValue);
  return Number.isFinite(parsedValue) ? parsedValue : Number.NaN;
}

function toIsoDateTime(value: string) {
  const normalizedValue = value.trim();
  if (!normalizedValue) {
    return "";
  }

  const parsedDate = new Date(normalizedValue);
  return Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
}

function normalizeTags(value: string) {
  return value
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function formatPath(path: Array<string | number>) {
  return path.map((segment) => segment.toString()).join(".");
}

function firstIssueByPath(
  issues: Array<{ path: Array<string | number>; message: string }>,
) {
  return issues.reduce<Record<string, string>>((errors, issue) => {
    const fieldPath = formatPath(issue.path);
    if (!errors[fieldPath]) {
      errors[fieldPath] = issue.message;
    }

    return errors;
  }, {});
}

export function buildCreateTradePayload(
  values: CreateTradeFormValues,
): CreateTradeFormValidation {
  const payloadCandidate = {
    account_id: values.account_id,
    instrument_id: values.instrument_id,
    strategy_id:
      values.strategy_id.trim() === "" ? null : values.strategy_id,
    setup: toNullableString(values.setup),
    bias: values.bias,
    thesis: toNullableString(values.thesis),
    risk_per_trade: toOptionalNumber(values.risk_per_trade),
    target_r: toOptionalNumber(values.target_r),
    tags: normalizeTags(values.tags),
    opened_at: toIsoDateTime(values.opened_at),
    screenshot_urls: [],
    legs: values.legs.map((leg) => ({
      side: leg.side,
      qty: toRequiredNumber(leg.qty),
      price: toRequiredNumber(leg.price),
      fee: toRequiredNumber(leg.fee),
      slippage: toRequiredNumber(leg.slippage),
      executed_at: toIsoDateTime(leg.executed_at),
    })),
  };

  const validation = CreateTradeSchema.safeParse(payloadCandidate);
  if (validation.success) {
    return { success: true, data: validation.data };
  }

  return {
    success: false,
    fieldErrors: firstIssueByPath(validation.error.issues),
  };
}

export function createInitialUpdateTradeFormValues(
  trade: Pick<
    TradeDetailResponse,
    | "account_id"
    | "instrument_id"
    | "strategy_id"
    | "setup"
    | "bias"
    | "thesis"
    | "risk_per_trade"
    | "target_r"
    | "tags"
    | "opened_at"
  >,
): UpdateTradeFormValues {
  return {
    account_id: trade.account_id,
    instrument_id: trade.instrument_id,
    strategy_id: trade.strategy_id ?? "",
    setup: trade.setup ?? "",
    bias: trade.bias,
    thesis: trade.thesis ?? "",
    risk_per_trade:
      trade.risk_per_trade == null ? "" : String(trade.risk_per_trade),
    target_r: trade.target_r == null ? "" : String(trade.target_r),
    tags: trade.tags.join(", "),
    opened_at: toDateTimeLocalInputValue(new Date(trade.opened_at)),
  };
}

export function buildUpdateTradePayload(
  values: UpdateTradeFormValues,
): UpdateTradeFormValidation {
  const payloadCandidate = {
    account_id: values.account_id,
    instrument_id: values.instrument_id,
    strategy_id:
      values.strategy_id.trim() === "" ? null : values.strategy_id,
    setup: toNullableString(values.setup),
    bias: values.bias,
    thesis: toNullableString(values.thesis),
    risk_per_trade: toOptionalNumber(values.risk_per_trade),
    target_r: toOptionalNumber(values.target_r),
    tags: normalizeTags(values.tags),
    opened_at: toIsoDateTime(values.opened_at),
  };

  const validation = UpdateTradeSchema.safeParse(payloadCandidate);
  if (validation.success) {
    return { success: true, data: validation.data };
  }

  return {
    success: false,
    fieldErrors: firstIssueByPath(validation.error.issues),
  };
}

export function createInitialTradeLegEditFormValues(
  legs: TradeLegRow[],
): TradeLegEditFormValues {
  if (legs.length === 0) {
    return { legs: [createEmptyTradeLegDraft()] };
  }

  return {
    legs: legs.map((leg) => ({
      client_id:
        leg.id ?? `${leg.executed_at ?? "leg"}-${leg.side}-${leg.qty}`,
      side: leg.side,
      qty: String(leg.qty),
      price: String(leg.price),
      fee: String(leg.fee ?? 0),
      slippage: String(leg.slippage ?? 0),
      executed_at: leg.executed_at
        ? toDateTimeLocalInputValue(new Date(leg.executed_at))
        : toDateTimeLocalInputValue(),
    })),
  };
}

export function createEmptyEditableTradeLeg(executedAt?: string) {
  return createEmptyTradeLegDraft(executedAt);
}

export function buildReplaceTradeLegsPayload(
  values: TradeLegEditFormValues,
): TradeLegEditFormValidation {
  const payloadCandidate = {
    legs: values.legs.map((leg) => ({
      side: leg.side,
      qty: toRequiredNumber(leg.qty),
      price: toRequiredNumber(leg.price),
      fee: toRequiredNumber(leg.fee),
      slippage: toRequiredNumber(leg.slippage),
      executed_at: toIsoDateTime(leg.executed_at),
    })),
  };

  const validation = ReplaceTradeLegsSchema.safeParse(payloadCandidate);
  if (validation.success) {
    return { success: true, data: validation.data };
  }

  return {
    success: false,
    fieldErrors: firstIssueByPath(validation.error.issues),
  };
}

const supportedReviewStatsKeys = new Set([
  "total_trades",
  "closed_trades",
  "open_trades",
  "partially_closed_trades",
  "net_pnl_closed",
  "avg_r_closed_or_resolved",
  "completeness",
  "unsupported_keys",
  "notes",
]);

function createEmptySnapshot(notes: string[]): JournalReviewStatsSnapshot {
  return {
    total_trades: null,
    closed_trades: null,
    open_trades: null,
    partially_closed_trades: null,
    net_pnl_closed: null,
    avg_r_closed_or_resolved: null,
    completeness: "missing",
    unsupported_keys: [],
    notes,
  };
}

function readFiniteNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function readStringArray(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is string => typeof entry === "string");
  }

  if (typeof value === "string" && value.trim() !== "") {
    return [value];
  }

  return [];
}

function parseAutoStatsObject(value: unknown) {
  if (value == null) {
    return null;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }

      return null;
    } catch {
      return null;
    }
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return null;
}

export function normalizeStoredReviewStats(
  autoStats: unknown,
): JournalReviewStatsSnapshot {
  if (autoStats == null) {
    return createEmptySnapshot([
      "No saved auto_stats snapshot is stored for this review.",
    ]);
  }

  const parsed = parseAutoStatsObject(autoStats);
  if (!parsed) {
    return createEmptySnapshot([
      "Stored auto_stats could not be parsed into a supported object.",
    ]);
  }

  const notes: string[] = [];
  const totalTrades =
    readFiniteNumber(parsed.total_trades) ??
    readFiniteNumber(parsed.trades);

  if (
    readFiniteNumber(parsed.trades) != null &&
    readFiniteNumber(parsed.total_trades) == null
  ) {
    notes.push('Legacy "trades" was mapped into total trades.');
  }

  const snapshot: JournalReviewStatsSnapshot = {
    total_trades: totalTrades,
    closed_trades: readFiniteNumber(parsed.closed_trades),
    open_trades: readFiniteNumber(parsed.open_trades),
    partially_closed_trades: readFiniteNumber(
      parsed.partially_closed_trades,
    ),
    net_pnl_closed: readFiniteNumber(parsed.net_pnl_closed),
    avg_r_closed_or_resolved: readFiniteNumber(
      parsed.avg_r_closed_or_resolved,
    ),
    completeness: "missing",
    unsupported_keys: Object.keys(parsed).filter(
      (key) => !supportedReviewStatsKeys.has(key) && key !== "trades",
    ),
    notes: [...readStringArray(parsed.notes), ...notes],
  };

  if (readStringArray(parsed.unsupported_keys).length > 0) {
    snapshot.unsupported_keys.push(
      ...readStringArray(parsed.unsupported_keys),
    );
  }

  const populatedFields = [
    snapshot.total_trades,
    snapshot.closed_trades,
    snapshot.open_trades,
    snapshot.partially_closed_trades,
    snapshot.net_pnl_closed,
    snapshot.avg_r_closed_or_resolved,
  ].filter((value) => value != null).length;

  if (populatedFields === 0) {
    snapshot.completeness = "missing";
    snapshot.notes.push(
      "No supported stats fields were found in the saved auto_stats payload.",
    );
  } else if (populatedFields === 6) {
    snapshot.completeness = "supported";
  } else {
    snapshot.completeness = "partial";
    snapshot.notes.push(
      "Saved auto_stats are partial, so only supported fields are shown.",
    );
  }

  if (snapshot.unsupported_keys.length > 0) {
    snapshot.notes.push(
      `Unsupported saved stats keys are hidden: ${snapshot.unsupported_keys.join(
        ", ",
      )}.`,
    );
  }

  return snapshot;
}

export function buildReviewStatsSnapshotFromDashboardStats(
  stats: JournalDashboardStats,
  notes: string[] = [],
): JournalReviewStatsSnapshot {
  return {
    total_trades: stats.total_trades,
    closed_trades: stats.closed_trades,
    open_trades: stats.open_trades,
    partially_closed_trades: stats.partially_closed_trades,
    net_pnl_closed: stats.net_pnl_closed,
    avg_r_closed_or_resolved: stats.avg_r_closed_or_resolved,
    completeness: "supported",
    unsupported_keys: [],
    notes,
  };
}

export function buildReviewSavePayload(values: ReviewSaveFormValues) {
  const normalizedInput = {
    period: values.period,
    period_start: values.period_start.trim(),
    period_end: values.period_end.trim(),
    notes: values.notes.trim() ? values.notes.trim() : null,
  };
  const result = ReviewSaveSchema.safeParse(normalizedInput);

  if (!result.success) {
    return {
      success: false as const,
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  return { success: true as const, data: result.data };
}

export function buildPersistedReviewAutoStats(
  snapshot: JournalReviewStatsSnapshot,
) {
  return {
    total_trades: snapshot.total_trades,
    closed_trades: snapshot.closed_trades,
    open_trades: snapshot.open_trades,
    partially_closed_trades: snapshot.partially_closed_trades,
    net_pnl_closed: snapshot.net_pnl_closed,
    avg_r_closed_or_resolved: snapshot.avg_r_closed_or_resolved,
    completeness: snapshot.completeness,
    unsupported_keys: snapshot.unsupported_keys,
    notes: snapshot.notes,
  };
}

export function buildReviewSaveRecord(
  userId: string,
  input: ReviewSave,
  autoStats: ReturnType<typeof buildPersistedReviewAutoStats>,
) {
  return {
    user_id: userId,
    period: input.period,
    period_start: input.period_start,
    period_end: input.period_end,
    notes: input.notes ?? null,
    auto_stats: autoStats,
  };
}

function formatDateInput(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function createInitialJournalExportFormValues(): JournalExportFormValues {
  const today = new Date();
  const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  return {
    resource: "trades",
    format: "csv",
    from: formatDateInput(startOfMonth),
    to: formatDateInput(today),
    period: "",
  };
}

export function buildJournalExportQuery(values: JournalExportFormValues) {
  const normalizedInput = {
    resource: values.resource,
    format: values.format,
    from: values.from.trim(),
    to: values.to.trim(),
    period: values.resource === "reviews" ? values.period || null : null,
  };
  const result = JournalExportQuerySchema.safeParse(normalizedInput);

  if (!result.success) {
    return {
      success: false as const,
      fieldErrors: result.error.flatten().fieldErrors,
    };
  }

  return { success: true as const, data: result.data };
}

export function buildJournalExportSearchParams(query: JournalExportQuery) {
  const searchParams = new URLSearchParams({
    resource: query.resource,
    format: query.format,
    from: query.from,
    to: query.to,
  });

  if (query.period) {
    searchParams.set("period", query.period);
  }

  return searchParams;
}
