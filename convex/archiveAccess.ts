import { ConvexError, v } from "convex/values";
import { mutation } from "./_generated/server";
import { writeAudit } from "./lib/audit";
import { requireRole } from "./lib/auth";
import { isConfiguredSecret } from "./lib/secrets";
import { serializeArchiveReceipt } from "../lib/security/archive-receipt";

export const record = mutation({
  args: {
    actor: v.string(),
    kind: v.union(
      v.literal("contacts"),
      v.literal("admissions"),
      v.literal("eventRegistrations"),
      v.literal("newsletterSubscribers"),
      v.literal("aiConversations"),
    ),
    operation: v.union(v.literal("view"), v.literal("export")),
    ids: v.array(v.string()),
    nonce: v.string(),
    issuedAt: v.number(),
    signature: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const staff = await requireRole(ctx, args.kind === "admissions" ? ["admin", "admissions"] : ["admin"]);
    const secret = process.env.FORM_SERVICE_SECRET;
    if (
      !isConfiguredSecret(secret) ||
      staff.clerkUserId !== args.actor ||
      (args.operation === "export" && args.kind !== "eventRegistrations") ||
      !args.ids.length ||
      args.ids.length > 100 ||
      new Set(args.ids).size !== args.ids.length ||
      !args.ids.every((id) => /^[a-z0-9]{16,64}$/.test(id)) ||
      !/^[a-f0-9-]{36}$/.test(args.nonce) ||
      !/^[a-f0-9]{64}$/.test(args.signature) ||
      !Number.isSafeInteger(args.issuedAt) ||
      Math.abs(Date.now() - args.issuedAt) > 120_000
    )
      throw new ConvexError("Invalid archive access receipt.");
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      "raw",
      encoder.encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const signature = Uint8Array.from(args.signature.match(/../g)!, (h) => parseInt(h, 16));
    if (!(await crypto.subtle.verify("HMAC", key, signature, encoder.encode(serializeArchiveReceipt(args)))))
      throw new ConvexError("Invalid archive access receipt.");
    const recorded = await ctx.db
      .query("auditLogs")
      .withIndex("by_archive_receipt", (q) =>
        q.eq("actorId", staff._id).eq("archiveReceipt", args.nonce),
      )
      .first();
    if (recorded) return null;
    for (const id of args.ids) {
      await writeAudit(ctx, staff, {
        action: args.operation === "export" ? "record.exported" : "record.viewed",
        entityType: args.kind,
        entityId: id,
        summary:
          args.operation === "export"
            ? "Released an earlier registration for CSV export."
            : "Released an earlier record to the staff panel.",
        archiveReceipt: args.nonce,
        metadata: { actorName: staff.name },
      });
    }
    return null;
  },
});
