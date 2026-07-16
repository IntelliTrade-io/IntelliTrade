// Intraday panel constants. Defined fresh here (not imported from strength-panel)
// so the redesigned panel owns its own palette and currency list.

export const CURRENCIES = ["USD", "EUR", "GBP", "JPY", "AUD", "NZD", "CAD", "CHF"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const CURRENCY_COLORS: Record<string, string> = {
  USD: "#60a5fa",
  EUR: "#a78bfa",
  GBP: "#f472b6",
  JPY: "#fbbf24",
  AUD: "#34d399",
  NZD: "#2dd4bf",
  CAD: "#fb923c",
  CHF: "#94a3b8",
};
