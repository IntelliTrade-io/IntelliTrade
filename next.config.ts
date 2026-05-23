import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: ["cdn.sanity.io"], // add Sanity CDN here
  },

  // ─── Rewrites ─────────────────────────────────────────────────────────────
  // The bundled iframe HTML apps fetch these hardcoded JSON paths.
  // We intercept them and serve our FastForex-backed API instead.
  async rewrites() {
    return [
      // Daily currency strength meter
      {
        source: "/data/current/heatmap_currencies_v152.json",
        destination: "/api/currency-strength-heatmap?type=daily",
      },
      // Intraday currency strength meter
      {
        source: "/data/current/intraday_currencies_trusted.json",
        destination: "/api/currency-strength-heatmap?type=intraday",
      },
    ];
  },
};

export default nextConfig;
