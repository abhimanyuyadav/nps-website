import publicDocumentRoutes from "./lib/public-document/routes.json";
import type { NextConfig } from "next";

import { schoolContentSecurityPolicy } from "./lib/server/browser-policy";
const isProduction = process.env.NODE_ENV === "production";

const securityHeaders = [
  { key: "Content-Security-Policy", value: schoolContentSecurityPolicy() },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Permitted-Cross-Domain-Policies", value: "none" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), payment=()" },
  ...(isProduction
    ? [{ key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" }]
    : []),
];

const nextConfig: NextConfig = {
  // School links are shared with readers that only inspect the HTML head.
  htmlLimitedBots: /.*/,
  reactStrictMode: true,
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ["image/avif", "image/webp"],
    qualities: [65, 75],
    remotePatterns: [
      { protocol: "https", hostname: "**.convex.cloud" },
      { protocol: "https", hostname: "img.clerk.com" },
      { protocol: "https", hostname: "images.clerk.dev" },
    ],
  },
  async rewrites() {
    return {
      beforeFiles:
        process.env.NODE_ENV === "production"
          ? [
              {
                source: "/",
                missing: [{ type: "header" as const, key: "rsc" }],
                destination: "/school-home-document",
              },
              {
                source: "/sign-in",
                missing: [
                  { type: "header" as const, key: "rsc" },
                  { type: "query" as const, key: "staff-ui" },
                ],
                destination: "/school-staff-sign-in",
              },
              ...publicDocumentRoutes
                .filter(
                  (route) =>
                    !route.startsWith("/student/") ||
                    Boolean(
                      process.env.NEXT_PUBLIC_CONVEX_URL &&
                      !process.env.NEXT_PUBLIC_CONVEX_URL.includes("your-deployment") &&
                      process.env.NEXT_PUBLIC_CONVEX_SITE_URL &&
                      !process.env.NEXT_PUBLIC_CONVEX_SITE_URL.includes("your-deployment"),
                    ),
                )
                .map((pattern) => {
                  const source = pattern.replace(/\[(\w+)\]/g, ":$1");
                  return {
                    source,
                    missing: [{ type: "header" as const, key: "rsc" }],
                    destination: "/school-pages" + source,
                  };
                }),
            ]
          : [],
      afterFiles: [],
      fallback: [],
    };
  },
  async headers() {
    const privatePages = [
      "/admin/:path*",
      "/student/:path*",
      "/sign-in/:path*",
      "/api/auth/:path*",
      "/newsletter/confirm",
      "/newsletter/unsubscribe",
      "/events/cancel",
    ];
    return [
      { source: "/(.*)", headers: securityHeaders },
      {
        source: "/school-home-assets/:path*",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      ...privatePages.map((source) => ({
        source,
        headers: [
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
        ],
      })),
    ];
  },
  async redirects() {
    return [
      { source: "/school-staff-sign-in", destination: "/sign-in", permanent: true },
      { source: "/school-home-document", destination: "/", permanent: true },
      { source: "/school-pages/:parts*", destination: "/:parts*", permanent: true },
      { source: "/login", destination: "/sign-in", permanent: true },
      { source: "/forgot-password", destination: "/sign-in?staff-method=recover", permanent: false },
      { source: "/academics/faculty", destination: "/departments", permanent: true },
      { source: "/academics/downloads", destination: "/downloads", permanent: true },
      { source: "/admin/announcements", destination: "/admin/notices", permanent: true },
    ];
  },
};

export default nextConfig;
