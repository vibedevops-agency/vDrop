import type { NextConfig } from "next";
import path from "path";

const nextConfig: NextConfig = {
  // Allow LAN IP during next dev (and keep listed for local testing).
  allowedDevOrigins: ["2.2.2.2", "127.0.0.1", "localhost"],
  experimental: {
    serverActions: {
      bodySizeLimit: "2gb",
    },
    proxyClientMaxBodySize: "2gb",
  },
  turbopack: {
    // Keep resolution inside this project (parent Videos/ lockfile otherwise wins)
    root: path.join(__dirname),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
