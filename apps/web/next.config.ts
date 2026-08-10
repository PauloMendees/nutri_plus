import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Tree-shake icon and UI packages so the marketing page doesn't pull full libs.
  experimental: {
    optimizePackageImports: ['lucide-react', 'radix-ui'],
  },
  // Prefer modern image formats when next/image is used on the LP.
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  // Compress responses (also enabled by default on Vercel).
  compress: true,
  poweredByHeader: false,
};

export default nextConfig;
