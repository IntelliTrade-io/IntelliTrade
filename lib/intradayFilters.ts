// Pure chip / pair-focus filter state for the Intraday CSM panel (refactor plan:
// interactive logic lives in tested pure functions, not React). No React, no DOM,
// no localStorage here — the panel owns persistence and calls these reducers.

export const ALL_CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;
export type CCY = (typeof ALL_CURRENCIES)[number];

export interface PairFocus {
  base: CCY;
  quote: CCY;
}

export interface FilterState {
  visible: CCY[];
  pairFocus: PairFocus | null;
}

const CCY_SET = new Set<string>(ALL_CURRENCIES);

function isCcy(value: unknown): value is CCY {
  return typeof value === "string" && CCY_SET.has(value);
}

/** All eight currencies visible in canonical order, no pair focus. */
export function initialState(): FilterState {
  return { visible: [...ALL_CURRENCIES], pairFocus: null };
}

/** Reorder a currency list into the canonical ALL_CURRENCIES order. */
function canonicalOrder(list: CCY[]): CCY[] {
  const set = new Set(list);
  return ALL_CURRENCIES.filter((c) => set.has(c));
}

/**
 * Toggle a currency in the stored selection. Turning off the last remaining
 * visible currency is a no-op (there must always be at least one line to plot).
 * Never mutates pair focus.
 */
export function toggleCurrency(state: FilterState, ccy: CCY): FilterState {
  if (state.visible.includes(ccy)) {
    if (state.visible.length <= 1) return state; // last-visible guard
    return { ...state, visible: state.visible.filter((c) => c !== ccy) };
  }
  return { ...state, visible: canonicalOrder([...state.visible, ccy]) };
}

/** Restore all eight currencies AND clear any pair focus. */
export function showAll(state: FilterState): FilterState {
  return { visible: [...ALL_CURRENCIES], pairFocus: state.pairFocus ? null : state.pairFocus };
}

/**
 * Hide every currency AND clear pair focus. The chart renders no lines until the
 * user re-enables a currency or shows all again. An empty selection is not
 * persisted as empty: on reload `deserialize` treats it as "all visible".
 */
export function showNone(state: FilterState): FilterState {
  return { visible: [], pairFocus: state.pairFocus ? null : state.pairFocus };
}

/** True when every currency is in the stored selection. */
export function isAllVisible(state: FilterState): boolean {
  return state.visible.length === ALL_CURRENCIES.length;
}

/**
 * Focus a single pair. This is a temporary override that does NOT mutate the
 * stored `visible` selection; selecting a new pair replaces the focus.
 */
export function focusPair(state: FilterState, base: CCY, quote: CCY): FilterState {
  return { ...state, pairFocus: { base, quote } };
}

/** Clear pair focus, restoring the stored `visible` selection exactly. */
export function clearPairFocus(state: FilterState): FilterState {
  if (!state.pairFocus) return state;
  return { ...state, pairFocus: null };
}

/**
 * Currencies that should actually render. Pair focus overrides the stored
 * selection with exactly its two currencies (canonical order); otherwise the
 * stored selection is used.
 */
export function effectiveVisible(state: FilterState): CCY[] {
  if (state.pairFocus) {
    return canonicalOrder([state.pairFocus.base, state.pairFocus.quote]);
  }
  return state.visible;
}

/** Serialize the persistable slice (the stored selection only; not pair focus). */
export function serialize(state: FilterState): string {
  return JSON.stringify(state.visible);
}

/**
 * Rebuild state from a persisted string. Corrupt JSON, wrong shapes, unknown
 * currencies, or an empty result all fall back to "all eight visible". Pair
 * focus is never persisted, so it always resets to null.
 */
export function deserialize(raw: string | null | undefined): FilterState {
  if (!raw) return initialState();
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return initialState();
    const visible = canonicalOrder(parsed.filter(isCcy));
    if (visible.length === 0) return initialState();
    return { visible, pairFocus: null };
  } catch {
    return initialState();
  }
}
