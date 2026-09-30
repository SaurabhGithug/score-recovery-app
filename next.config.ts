import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  // Prepared source documents and verified crops are uploaded to Supabase for production.
  // Keeping the 1+ GB offline corpus out of server-function traces is essential for Vercel.
  outputFileTracingExcludes: {
    "/*": ["data/**", "docs/**", "output/**", "services/**"],
  },
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
