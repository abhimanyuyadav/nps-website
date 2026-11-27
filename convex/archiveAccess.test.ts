import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { expect, it, vi } from "vitest";
import schema from "./schema";
import { modules } from "./test.setup";
import { serializeArchiveReceipt, type ArchiveReceipt } from "../lib/security/archive-receipt";

it("verifies the staff-bound signed receipt, excludes forged entries and deduplicates retries", async () => {
  const key = "archive-receipt-test-secret-".repeat(3);
  vi.stubEnv("FORM_SERVICE_SECRET", key);
  try {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      for (const actor of ["admin", "other"])
        await ctx.db.insert("users", {
          clerkUserId: actor,
          name: actor,
          email: actor + "@example.test",
          roles: ["admin"],
          status: "active",
          createdAt: 1,
          updatedAt: 1,
        });
    });
    const receipt: ArchiveReceipt = {
      actor: "admin",
      kind: "eventRegistrations",
      operation: "export",
      ids: ["00000000000000000000000000000001"],
      nonce: crypto.randomUUID(),
      issuedAt: Date.now(),
    };
    const utf8 = new TextEncoder();
    const hmac = await crypto.subtle.importKey(
      "raw",
      utf8.encode(key),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const bytes = await crypto.subtle.sign("HMAC", hmac, utf8.encode(serializeArchiveReceipt(receipt)));
    const signed = {
      ...receipt,
      signature: Array.from(new Uint8Array(bytes), (n) => n.toString(16).padStart(2, "0")).join(""),
    };
    const ref = makeFunctionReference<"mutation">("archiveAccess:record");
    const admin = t.withIdentity({ subject: "admin" });
    await expect(t.withIdentity({ subject: "other" }).mutation(ref, signed)).rejects.toThrow();
    await expect(
      admin.mutation(ref, { ...signed, ids: ["00000000000000000000000000000002"] }),
    ).rejects.toThrow();
    await admin.mutation(ref, signed);
    await admin.mutation(ref, signed);
    const rows = await t.run((ctx) => ctx.db.query("auditLogs").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      actorClerkId: "admin",
      entityId: receipt.ids[0],
      action: "record.exported",
    });
  } finally {
    vi.unstubAllEnvs();
  }
});
