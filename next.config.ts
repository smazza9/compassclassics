import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The build the browser is running, so an open app can tell a newer one shipped.
  env: {
    NEXT_PUBLIC_BUILD_ID: process.env.VERCEL_GIT_COMMIT_SHA || "dev",
  },
  // Pin the workspace root to this project. Without it, Next sees the stray
  // package-lock.json in the home directory and guesses the wrong root.
  turbopack: {
    root: __dirname,
  },
  // One address: www goes to the plain domain.
  async redirects() {
    return [
      {
        source: "/:path*",
        has: [{ type: "host", value: "www.compassclassics.com" }],
        destination: "https://compassclassics.com/:path*",
        permanent: true,
      },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "microphone=(self), camera=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
