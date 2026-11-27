import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const originalInitialAdminClerkUserId = process.env.INITIAL_ADMIN_CLERK_USER_ID;

afterEach(() => {
  if (originalInitialAdminClerkUserId === undefined) {
    delete process.env.INITIAL_ADMIN_CLERK_USER_ID;
  } else {
    process.env.INITIAL_ADMIN_CLERK_USER_ID = originalInitialAdminClerkUserId;
  }
});

function asStaff(t: ReturnType<typeof convexTest>, clerkUserId: string) {
  return t.withIdentity({
    subject: clerkUserId,
    email: `${clerkUserId}@example.test`,
    name: clerkUserId,
  });
}

describe("first-administrator bootstrap", () => {
  it("requires an authenticated Clerk session before checking deployment configuration", async () => {
    process.env.INITIAL_ADMIN_CLERK_USER_ID = "user_initial_admin";
    const t = convexTest(schema, modules);

    await expect(t.query(api.users.bootstrapEligibility, {})).resolves.toEqual({
      status: "approval_required",
    });
    await expect(t.mutation(api.users.bootstrapFirstAdmin, {})).rejects.toThrow("Sign in is required");
  });

  it("fails closed when the allowlist is missing or belongs to a different Clerk user", async () => {
    const t = convexTest(schema, modules);
    const caller = asStaff(t, "user_Allowed");

    process.env.INITIAL_ADMIN_CLERK_USER_ID = "";
    await expect(caller.query(api.users.bootstrapEligibility, {})).resolves.toEqual({
      status: "approval_required",
    });
    await expect(caller.mutation(api.users.bootstrapFirstAdmin, {})).rejects.toThrow(
      "not configured for this deployment",
    );

    process.env.INITIAL_ADMIN_CLERK_USER_ID = "user_allowed";
    await expect(caller.query(api.users.bootstrapEligibility, {})).resolves.toEqual({
      status: "approval_required",
    });
    await expect(caller.mutation(api.users.bootstrapFirstAdmin, {})).rejects.toThrow(
      "not authorised for initial administrator activation",
    );
  });

  it("requires the allowlisted identity to synchronize a staff profile first", async () => {
    process.env.INITIAL_ADMIN_CLERK_USER_ID = "user_initial_admin";
    const t = convexTest(schema, modules);
    const caller = asStaff(t, "user_initial_admin");

    await expect(caller.query(api.users.bootstrapEligibility, {})).resolves.toEqual({
      status: "eligible",
    });
    await expect(caller.mutation(api.users.bootstrapFirstAdmin, {})).rejects.toThrow(
      "Run users.syncCurrent first",
    );
  });

  it("activates only the allowlisted pending profile, preserves roles, and audits the claim", async () => {
    process.env.INITIAL_ADMIN_CLERK_USER_ID = "  user_initial_admin  ";
    const t = convexTest(schema, modules);
    const caller = asStaff(t, "user_initial_admin");
    const userId = await caller.mutation(api.users.syncCurrent, {});
    await t.run(async (ctx) => await ctx.db.patch("users", userId, { roles: ["editor"] }));

    await expect(caller.query(api.users.bootstrapEligibility, {})).resolves.toEqual({
      status: "eligible",
    });
    await expect(caller.mutation(api.users.bootstrapFirstAdmin, {})).resolves.toEqual({ ok: true });
    await expect(caller.query(api.users.bootstrapEligibility, {})).resolves.toEqual({
      status: "approved",
    });

    const user = await t.run(async (ctx) => await ctx.db.get("users", userId));
    expect(user?.status).toBe("active");
    expect(user?.roles).toEqual(["editor", "admin"]);

    const audit = await t.run(async (ctx) =>
      ctx.db.query("auditLogs").withIndex("by_created_at").order("desc").take(5),
    );
    expect(audit.filter((entry) => entry.action === "user.bootstrap_admin")).toHaveLength(1);

    await expect(caller.mutation(api.users.bootstrapFirstAdmin, {})).rejects.toThrow(
      "An admin already exists",
    );
  });

  it("refuses to activate a suspended allowlisted account", async () => {
    process.env.INITIAL_ADMIN_CLERK_USER_ID = "user_initial_admin";
    const t = convexTest(schema, modules);
    const caller = asStaff(t, "user_initial_admin");
    const userId = await caller.mutation(api.users.syncCurrent, {});
    await t.run(async (ctx) => await ctx.db.patch("users", userId, { status: "suspended" }));

    await expect(caller.query(api.users.bootstrapEligibility, {})).resolves.toEqual({
      status: "approval_required",
    });
    await expect(caller.mutation(api.users.bootstrapFirstAdmin, {})).rejects.toThrow(
      "This account is suspended",
    );
  });

  it("refuses a new claim when any existing profile retains the administrator role", async () => {
    process.env.INITIAL_ADMIN_CLERK_USER_ID = "user_initial_admin";
    const t = convexTest(schema, modules);
    const caller = asStaff(t, "user_initial_admin");
    await caller.mutation(api.users.syncCurrent, {});
    await t.run(async (ctx) => {
      const now = Date.now();
      await ctx.db.insert("users", {
        clerkUserId: "user_previous_admin",
        email: "previous-admin@example.test",
        name: "Previous administrator",
        roles: ["admin"],
        status: "suspended",
        createdAt: now,
        updatedAt: now,
      });
    });

    await expect(caller.query(api.users.bootstrapEligibility, {})).resolves.toEqual({
      status: "approval_required",
    });
    await expect(caller.mutation(api.users.bootstrapFirstAdmin, {})).rejects.toThrow(
      "An admin already exists",
    );
  });
});

describe("independent school administrator access", () => {
  it.each([true, false])("honors local suspensions and role changes on an issued bridge token (school issuer: %s)", async (hasSchoolIssuer) => {
    vi.stubEnv("WORKFLOW_JWKS", "configured");
    vi.stubEnv("SCHOOL_CLERK_ISSUER", hasSchoolIssuer ? "https://school.example.test" : undefined);
    vi.stubEnv("CLERK_JWT_ISSUER_DOMAIN", "https://bridge.example.test");
    try {
      const t = convexTest(schema, modules);
      const identity = {
        issuer: "https://bridge.example.test",
        subject: "delegated-staff",
        email: "staff@example.test",
      };
      const caller = t.withIdentity({ ...identity, roles: ["admin", "editor"] });
      const id = await caller.mutation(api.users.syncCurrent, {});
      const expected = hasSchoolIssuer ? { status: "pending", roles: [] } : { status: "active", roles: ["admin", "editor"] };
      expect(await caller.query(api.users.current, {})).toMatchObject(expected);

      await t.run((ctx) => ctx.db.patch("users", id, { status: "active", roles: ["editor"] }));
      await caller.mutation(api.users.syncCurrent, {});
      expect(await caller.query(api.users.current, {})).toMatchObject({ status: "active", roles: ["editor"] });
      const adminRead = () => caller.query(internal.admin.listUsers, { paginationOpts: { numItems: 1, cursor: null } });
      await expect(adminRead()).rejects.toThrow("required");
      const limited = t.withIdentity({ ...identity, roles: ["admissions"] });
      expect(await limited.query(api.users.current, {})).toMatchObject({ roles: [], status: "pending" });

      await t.run((ctx) => ctx.db.patch("users", id, { status: "suspended", roles: ["admin"] }));
      await caller.mutation(api.users.syncCurrent, {});
      expect(await caller.query(api.users.current, {})).toMatchObject({ status: "suspended", roles: [] });
      await expect(adminRead()).rejects.toThrow("not active");
    } finally {
      vi.unstubAllEnvs();
    }
  });

  it("checks the migrated roster and preserves a suspension during synchronization", async () => {
    vi.stubEnv("SCHOOL_CLERK_ISSUER", "https://school.example.test");
    vi.stubEnv("WORKFLOW_JWKS", "configured");
    try {
      const t = convexTest(schema, modules);
      const caller = t.withIdentity({
        issuer: "https://school.example.test",
        subject: "staff-member",
        email: "staff@example.test",
        roles: ["admin"],
      });
      const id = await caller.mutation(api.users.syncCurrent, {});
      await expect(caller.query(api.users.current, {})).resolves.toMatchObject({
        roles: [], status: "pending",
      });
      await t.run(async (ctx) => ctx.db.patch("users", id, { roles: ["admin"], status: "active" }));
      await expect(caller.query(internal.admin.listUsers, {
        paginationOpts: { numItems: 1, cursor: null },
      })).resolves.toBeDefined();
      await t.run(async (ctx) => ctx.db.patch("users", id, { roles: [], status: "suspended" }));
      await caller.mutation(api.users.syncCurrent, {});
      await expect(caller.query(internal.admin.listUsers, {
        paginationOpts: { numItems: 1, cursor: null },
      })).rejects.toThrow("not active");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
