import { describe, expect, it } from "vitest";
import {
  buildSupportResistanceVisibleLogicalRange,
  getSupportResistanceChartMinHeight,
  getSupportResistanceChartViewportHeight,
} from "./chartSizing";

describe("support resistance chart sizing", () => {
  it("uses a taller full-page chart while preserving the compact widget height", () => {
    expect(getSupportResistanceChartMinHeight(false)).toBe(460);
    expect(getSupportResistanceChartMinHeight(true)).toBe(270);
  });

  it("lets the chart fill a taller stretched card", () => {
    const host = { clientHeight: 812 } as HTMLElement;

    expect(getSupportResistanceChartViewportHeight(host, 620)).toBe(812);
    expect(getSupportResistanceChartViewportHeight(null, 620)).toBe(620);
  });

  it("pads the visible candle range so the chart uses the available width", () => {
    expect(buildSupportResistanceVisibleLogicalRange(28)).toEqual({ from: -2, to: 29 });
    expect(buildSupportResistanceVisibleLogicalRange(0)).toBeNull();
  });
});
