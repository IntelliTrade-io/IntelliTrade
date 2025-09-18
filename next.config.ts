import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  images: {
    domains: ["cdn.sanity.io"], // add Sanity CDN here
  },
};

export default nextConfig;
