import { ConvexError } from "convex/values";
import { isConfiguredSecret } from "./secrets";
import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";
import type { UserIdentity } from "convex/server";

export type StaffRole = "admin" | "publisher" | "editor" | "admissions";

type AuthContext = Pick<QueryCtx | MutationCtx, "auth" | "db">;

function normalizedIssuer(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

export function isClerkStaffIdentity(identity: UserIdentity): boolean {
  const configuredIssuer = process.env.CLERK_JWT_ISSUER_DOMAIN;
  const schoolIssuer = process.env.SCHOOL_CLERK_ISSUER;
  if (process.env.WORKFLOW_JWKS && schoolIssuer && normalizedIssuer(identity.issuer) === normalizedIssuer(schoolIssuer)) return true;
  if (!configuredIssuer?.trim()) return false;
  return normalizedIssuer(identity.issuer) === normalizedIssuer(configuredIssuer);
}

export function delegatedStaffRoles(identity: UserIdentity): StaffRole[] | null {
  if (!process.env.WORKFLOW_JWKS || !isClerkStaffIdentity(identity)) return null;
  const schoolIssuer = process.env.SCHOOL_CLERK_ISSUER;
  if (schoolIssuer && normalizedIssuer(identity.issuer) === normalizedIssuer(schoolIssuer)) return null;
  return Array.isArray(identity.roles)
    ? identity.roles.filter(
        (role): role is StaffRole =>
          role === "admin" || role === "publisher" || role === "editor" || role === "admissions",
      )
    : [];
}

export async function requireClerkStaffIdentity(ctx: Pick<AuthContext, "auth">): Promise<UserIdentity> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !isClerkStaffIdentity(identity)) {
    throw new ConvexError({ code: "UNAUTHENTICATED", message: "Sign in is required." });
  }
  return identity;
}

export async function currentUser(ctx: AuthContext): Promise<Doc<"users"> | null> {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !isClerkStaffIdentity(identity)) return null;
  const profile = await ctx.db
    .query("users")
    .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", identity.subject))
    .unique();
  if (!profile) return null;
  const delegated = delegatedStaffRoles(identity);
  if (delegated === null) return profile;
  const roles = profile.status === "active" ? profile.roles.filter((role) => delegated.includes(role)) : [];
  const status = profile.status === "active" && !roles.length ? "pending" : profile.status;
  return { ...profile, roles, status };
}

export async function requireUser(ctx: AuthContext): Promise<Doc<"users">> {
  await requireClerkStaffIdentity(ctx);
  const user = await currentUser(ctx);
  if (!user) {
    throw new ConvexError({
      code: "PROFILE_REQUIRED",
      message: "Your staff profile has not been synchronized yet.",
    });
  }
  if (user.status !== "active") {
    throw new ConvexError({ code: "ACCOUNT_DISABLED", message: "This account is not active." });
  }
  return user;
}

export async function requireRole(ctx: AuthContext, allowed: readonly StaffRole[]): Promise<Doc<"users">> {
  const user = await requireUser(ctx);
  if (!user.roles.some((role) => allowed.includes(role))) {
    throw new ConvexError({
      code: "FORBIDDEN",
      message: `One of these roles is required: ${allowed.join(", ")}.`,
    });
  }
  return user;
}

export function secureEqual(left: string, right: string): boolean {
  const length = Math.max(left.length, right.length);
  let difference = left.length ^ right.length;
  for (let index = 0; index < length; index += 1) {
    difference |= (left.charCodeAt(index) || 0) ^ (right.charCodeAt(index) || 0);
  }
  return difference === 0;
}

export function requireServiceSecret(provided: string, environmentKey: string): void {
  const expected = process.env[environmentKey];
  if (!isConfiguredSecret(expected) || !secureEqual(provided, expected)) {
    throw new ConvexError({ code: "FORBIDDEN", message: "Invalid service credential." });
  }
}
