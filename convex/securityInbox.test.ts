import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import { api } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

it("keeps the security inbox private and lets an admin set and clear it", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    for (const role of ["admin", "editor"] as const) {
      await ctx.db.insert("users", {
        clerkUserId: role,
        name: role,
        email: role + "@example.test",
        roles: [role],
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    }
  });
  const admin = t.withIdentity({ subject: "admin" });
  for (const visitor of [t, t.withIdentity({ subject: "editor" })]) {
    await expect(visitor.query(api.admin.getSecurityInbox, {})).rejects.toThrow();
    await expect(
      visitor.mutation(api.admin.setSecurityInbox, { email: "alerts@example.test" }),
    ).rejects.toThrow();
  }
  expect(await admin.query(api.admin.getSecurityInbox, {})).toBe("");
  await expect(admin.mutation(api.admin.setSecurityInbox, { email: "invalid" })).rejects.toThrow();
  await admin.mutation(api.admin.setSecurityInbox, { email: " alerts@example.test " });
  expect(await admin.query(api.admin.getSecurityInbox, {})).toBe("alerts@example.test");
  await admin.mutation(api.admin.setSecurityInbox, { email: "" });
  expect(await admin.query(api.admin.getSecurityInbox, {})).toBe("");
});
