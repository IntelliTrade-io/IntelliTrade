import { ImageResponse } from "next/og";

// Shared 1200x630 social card builder used by the per-route opengraph-image
// files (prices-today x4, /pro, /smart-support-zones). Code-only via next/og
// so there are no binary assets to keep in sync and each card is themed to its
// page accent. Twitter cards fall back to the OG image automatically, so these
// cover both. All styling is inline — Satori (next/og) supports a flexbox
// subset only, so every multi-child element sets display:flex explicitly.

export const OG_SIZE = { width: 1200, height: 630 };
export const OG_CONTENT_TYPE = "image/png";

type PriceOgParams = {
  eyebrow: string;
  title: string;
  subtitle: string;
  /** Accent RGB triplet, matching the page's brand theme. */
  accent: [number, number, number];
};

export function renderPriceOg({ eyebrow, title, subtitle, accent }: PriceOgParams) {
  const [r, g, b] = accent;
  const accentCss = `rgb(${r}, ${g}, ${b})`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: "72px 80px",
          backgroundColor: "#050507",
          backgroundImage: `radial-gradient(1000px 500px at 82% -10%, rgba(${r}, ${g}, ${b}, 0.22), transparent 60%)`,
          fontFamily: "sans-serif",
        }}
      >
        {/* Brand row */}
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              width: 48,
              height: 48,
              borderRadius: 12,
              backgroundImage: `linear-gradient(135deg, ${accentCss}, rgba(${r}, ${g}, ${b}, 0.55))`,
            }}
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#050507" strokeWidth="2.6" strokeLinecap="round">
              <path d="M4 19V10M9 19V5M14 19V13M19 19V8" />
            </svg>
          </div>
          <span style={{ fontSize: 30, fontWeight: 700, color: "#f4f4f6" }}>IntelliTrade</span>
        </div>

        {/* Title block */}
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span
            style={{
              fontSize: 22,
              fontWeight: 700,
              letterSpacing: 6,
              textTransform: "uppercase",
              color: accentCss,
            }}
          >
            {eyebrow}
          </span>
          <span
            style={{
              marginTop: 20,
              fontSize: 76,
              fontWeight: 800,
              lineHeight: 1.05,
              color: "#f8f8fb",
              maxWidth: 960,
            }}
          >
            {title}
          </span>
          <span
            style={{
              marginTop: 26,
              fontSize: 30,
              fontWeight: 400,
              lineHeight: 1.35,
              color: "#a1a1aa",
              maxWidth: 900,
            }}
          >
            {subtitle}
          </span>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ display: "flex", width: 40, height: 4, borderRadius: 999, backgroundColor: accentCss }} />
          <span style={{ fontSize: 24, fontWeight: 600, color: "#71717a" }}>intellitrade.tech</span>
        </div>
      </div>
    ),
    { ...OG_SIZE },
  );
}
