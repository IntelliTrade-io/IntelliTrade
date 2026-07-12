import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Overridable so `npm run build` can use a separate output dir while the
  // always-running dev server holds .next — sharing the dir corrupts route
  // manifests (phantom 404s / "Cannot find module for page").
  distDir: process.env.NEXT_DIST_DIR || ".next",
  transpilePackages: ["recharts"],
  images: {
    domains: ["cdn.sanity.io"], // add Sanity CDN here
  },

  // Legacy /dashboard was removed (superseded by /dashboardv2); keep old
  // links/bookmarks working.
  async redirects() {
    return [
      {
        source: "/dashboard",
        destination: "/dashboardv2",
        permanent: true,
      },
    ];
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
