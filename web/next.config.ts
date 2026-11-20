import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  images: {
    // AVIF first, WebP as the fallback; the key-art PNG is 700 KB as shipped.
    formats: ["image/avif", "image/webp"],
    // 75 is the default; 85 is the full-bleed hero, where 75 shows banding and soft edges.
    qualities: [75, 85],
  },
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
