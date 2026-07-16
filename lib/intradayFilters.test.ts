import { describe, it, expect } from "vitest";
import {
  ALL_CURRENCIES,
  initialState,
  toggleCurrency,
  showAll,
  focusPair,
  clearPairFocus,
  effectiveVisible,
  serialize,
  deserialize,
} from "./intradayFilters";

describe("intradayFilters", () => {
  it("toggle hides then shows a currency", () => {
    const s0 = initialState();
    const s1 = toggleCurrency(s0, "USD");
    expect(s1.visible).not.toContain("USD");
    const s2 = toggleCurrency(s1, "USD");
    expect(s2.visible).toContain("USD");
    // Restored in canonical order.
    expect(s2.visible).toEqual([...ALL_CURRENCIES]);
  });

  it("last-visible currency cannot be toggled off", () => {
    let s = initialState();
    for (const c of ALL_CURRENCIES.slice(1)) s = toggleCurrency(s, c);
    expect(s.visible).toEqual(["USD"]);
    const same = toggleCurrency(s, "USD");
    expect(same.visible).toEqual(["USD"]); // no-op
  });

  it("showAll restores all eight and exits pair focus", () => {
    let s = toggleCurrency(initialState(), "EUR");
    s = focusPair(s, "GBP", "JPY");
    const shown = showAll(s);
    expect(shown.visible).toEqual([...ALL_CURRENCIES]);
    expect(shown.pairFocus).toBeNull();
  });

  it("focusPair yields exactly two effective currencies without mutating visible", () => {
    const s0 = toggleCurrency(initialState(), "EUR"); // EUR hidden in stored selection
    const s1 = focusPair(s0, "GBP", "JPY");
    expect(effectiveVisible(s1)).toEqual(["GBP", "JPY"]);
    // Stored selection is untouched (still missing EUR, still has others).
    expect(s1.visible).toEqual(s0.visible);
  });

  it("clearing focus restores the stored selection exactly, keeping hidden currencies hidden", () => {
    const s0 = toggleCurrency(initialState(), "EUR");
    const focused = focusPair(s0, "GBP", "JPY");
    const cleared = clearPairFocus(focused);
    expect(cleared.pairFocus).toBeNull();
    expect(effectiveVisible(cleared)).toEqual(s0.visible);
    expect(cleared.visible).not.toContain("EUR");
  });

  it("selecting a new pair replaces the focus", () => {
    let s = focusPair(initialState(), "GBP", "JPY");
    s = focusPair(s, "EUR", "USD");
    expect(effectiveVisible(s)).toEqual(["USD", "EUR"]); // canonical order
  });

  it("deserialize of garbage falls back to all visible", () => {
    expect(deserialize("not json").visible).toEqual([...ALL_CURRENCIES]);
    expect(deserialize("{}").visible).toEqual([...ALL_CURRENCIES]);
    expect(deserialize("[]").visible).toEqual([...ALL_CURRENCIES]);
    expect(deserialize('["XXX","YYY"]').visible).toEqual([...ALL_CURRENCIES]);
    expect(deserialize(null).visible).toEqual([...ALL_CURRENCIES]);
  });

  it("refresh simulation (serialize -> deserialize) preserves the stored selection", () => {
    let s = toggleCurrency(initialState(), "USD");
    s = toggleCurrency(s, "CHF");
    s = focusPair(s, "GBP", "JPY"); // focus is transient, must not persist
    const restored = deserialize(serialize(s));
    expect(restored.visible).toEqual(s.visible);
    expect(restored.pairFocus).toBeNull();
  });
});
