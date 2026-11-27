import { getAuthConfigProvider } from "@convex-dev/better-auth/auth-config";
import type { AuthConfig } from "convex/server";

export const betterAuthConfig = {
  providers: [getAuthConfigProvider()],
} satisfies AuthConfig;

export default {
  providers: [
    ...betterAuthConfig.providers,
    ...(process.env.WORKFLOW_JWKS && process.env.SCHOOL_CLERK_ISSUER
      ? [{ domain: process.env.SCHOOL_CLERK_ISSUER, applicationID: "convex" }]
      : []),
    ...(process.env.WORKFLOW_JWKS
      ? [
          {
            type: "customJwt" as const,
            algorithm: "RS256" as const,
            issuer: process.env.CLERK_JWT_ISSUER_DOMAIN!,
            applicationID: "nps-workflows",
            jwks: process.env.WORKFLOW_JWKS,
          },
        ]
      : [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" }]),
  ],
} satisfies AuthConfig;
