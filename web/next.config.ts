import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  output: "standalone", // image Docker légère : node server.js
  cacheComponents: true,
  partialPrefetching: true,
};

export default nextConfig;
