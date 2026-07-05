/**
 * Legal identity shown in the footer and used for ad-network verification.
 * Values must match the KvK registration and the Google payment profile
 * exactly. Empty strings hide the corresponding footer line until filled
 * (owner action — see OWNER_TODO.md).
 */
export const COMPANY = {
  legalName: "", // e.g. "IntelliTrade B.V."
  kvk: "", // KvK number, e.g. "12345678"
  address: "", // street + number, postal code, city
  email: "info@intellitrade.tech",
} as const;

export const RISK_DISCLAIMER =
  "Trading foreign exchange and other leveraged products involves substantial risk of loss. " +
  "All content and tools on this site are for informational and educational purposes only and " +
  "do not constitute investment advice or trading signals. Past performance is not indicative of future results.";
