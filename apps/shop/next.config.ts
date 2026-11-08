import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ['@poltergeist/protocol'],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
