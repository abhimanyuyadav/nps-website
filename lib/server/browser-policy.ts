const isProduction = process.env.NODE_ENV === "production";
const clerkFapiOrigin = (() => {
  try {
    const value = process.env.NEXT_PUBLIC_CLERK_FAPI;
    if (!value) return "";
    const url = new URL(value);
    return url.protocol === "https:" ? ` ${url.origin}` : "";
  } catch {
    return "";
  }
})();

export function schoolContentSecurityPolicy(scriptMode: "application" | "public" | "none" = "application") {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    scriptMode === "none"
      ? "script-src 'none'"
      : scriptMode === "public"
        ? "script-src 'self' https://challenges.cloudflare.com"
        : `script-src 'self' 'unsafe-inline'${isProduction ? "" : " 'unsafe-eval'"} https://*.clerk.accounts.dev https://*.clerk.com https://*.protect.clerk.com https://challenges.cloudflare.com${clerkFapiOrigin}`,
    "style-src 'self' 'unsafe-inline'",
    "font-src 'self' data:",
    `img-src 'self' data: blob: https://*.convex.cloud https://img.clerk.com https://images.clerk.dev${clerkFapiOrigin}`,
    "media-src 'self' blob: https://*.convex.cloud",
    `connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.clerk.accounts.dev https://*.clerk.com https://*.protect.clerk.com https://clerk-telemetry.com https://*.clerk-telemetry.com https://img.clerk.com https://challenges.cloudflare.com${clerkFapiOrigin}`,
    `frame-src 'self' https://*.clerk.accounts.dev https://*.clerk.com https://*.protect.clerk.com https://challenges.cloudflare.com${clerkFapiOrigin}`,
    "worker-src 'self' blob:",
    ...(isProduction ? ["upgrade-insecure-requests"] : []),
  ].join("; ");
}
