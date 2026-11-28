import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internalMutation, internalQuery, mutation, query } from "./_generated/server";
import { field, formState } from "./lib/schoolFormFields";
import { requireRole } from "./lib/auth";
import { enforceRateLimit, protectSharedNetwork } from "./lib/rateLimit";
import { normalizedEmail, referenceNumber, shortHash } from "./lib/input";
import { enqueueJob } from "./lib/jobs";
import { schoolResponseExpiry } from "./lib/schoolRetention";
import { writeAudit } from "./lib/audit";

function invalid(message: string): never {
  throw new ConvexError({ code: "FORM_INVALID", message });
}
export const openForms = query({
  args: {},
  handler: async (ctx) =>
    (
      await ctx.db
        .query("schoolForms")
        .withIndex("by_status_updated", (q) => q.eq("status", "open"))
        .order("desc")
        .take(100)
    ).map((f) => ({ id: f._id, title: f.title, description: f.description })),
});
export const publicForm = query({
  args: { id: v.string() },
  handler: async (ctx, { id }) => {
    const key = ctx.db.normalizeId("schoolForms", id);
    const form = key && (await ctx.db.get("schoolForms", key));
    return form && form.status === "open" ? form : null;
  },
});
export const staffList = query({
  args: { paginationOpts: paginationOptsValidator },
  handler: async (ctx, { paginationOpts }) => {
    await requireRole(ctx, ["admin"]);
    return ctx.db.query("schoolForms").order("desc").paginate(paginationOpts);
  },
});
export const responses = internalQuery({
  args: { id: v.id("schoolForms"), paginationOpts: paginationOptsValidator },
  handler: async (ctx, { id, paginationOpts }) => {
    await requireRole(ctx, ["admin"]);
    return ctx.db
      .query("schoolResponses")
      .withIndex("by_form", (q) => q.eq("formId", id))
      .order("desc")
      .paginate(paginationOpts);
  },
});
export const saveDraft = mutation({
  args: {
    id: v.optional(v.id("schoolForms")),
    revision: v.optional(v.number()),
    title: v.string(),
    description: v.string(),
    fields: v.array(field),
  },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin"]);
    const title = args.title.trim(),
      description = args.description.trim();
    if (
      !title ||
      title.length > 120 ||
      description.length > 1500 ||
      !args.fields.length ||
      args.fields.length > 20
    )
      invalid("Enter a title and between one and twenty questions.");
    const fields = args.fields.map((f) => {
      const label = f.label.trim();
      const options = f.kind === "choice" ? f.options.map((s) => s.trim()) : [];
      if (!label || label.length > 150) invalid("Each question needs a label of up to 150 characters.");
      if (
        f.kind === "choice" &&
        (options.length < 2 ||
          options.length > 20 ||
          options.some((o) => !o || o.length > 100) ||
          new Set(options).size !== options.length)
      )
        invalid("Enter two to twenty distinct choices per choice question.");
      return { ...f, label, options };
    });
    const values = { title, description, fields, updatedAt: Date.now() };
    if (!args.id) return ctx.db.insert("schoolForms", { ...values, status: "draft", revision: 1 });
    const old = await ctx.db.get("schoolForms", args.id);
    if (!old || old.status !== "draft" || old.revision !== args.revision)
      invalid("This draft changed. Reopen it before editing.");
    await ctx.db.patch("schoolForms", old._id, { ...values, revision: old.revision + 1 });
    return old._id;
  },
});
export const setStatus = mutation({
  args: { id: v.id("schoolForms"), revision: v.number(), status: formState },
  handler: async (ctx, { id, revision, status }) => {
    await requireRole(ctx, ["admin"]);
    const old = await ctx.db.get("schoolForms", id);
    if (
      !old ||
      old.revision !== revision ||
      status === "draft" ||
      old.status === status ||
      (old.status === "draft" && status !== "open")
    )
      invalid("The form changed. Refresh and try again.");
    await ctx.db.patch("schoolForms", id, { status, updatedAt: Date.now(), revision: revision + 1 });
  },
});
export const record = internalMutation({
  args: {
    id: v.string(),
    revision: v.number(),
    submissionId: v.string(),
    networkKey: v.optional(v.string()),
    consentVersion: v.optional(v.literal("share-answers-v1")),
    fingerprint: v.string(),
    email: v.string(),
    answers: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const key = ctx.db.normalizeId("schoolForms", args.id);
    if (!key) invalid("Form unavailable.");
    const email = normalizedEmail(args.email);
    const stored = await ctx.db
      .query("schoolResponses")
      .withIndex("by_form_submission", (q) => q.eq("formId", key).eq("submissionId", args.submissionId))
      .unique();
    if (stored) {
      if (stored.email !== email) invalid("Invalid submission reference.");
      return stored.reference;
    }
    const form = await ctx.db.get("schoolForms", key);
    if (!form || form.status !== "open" || form.revision !== args.revision)
      invalid("This form has closed or changed. Reload it before submitting.");
    if (args.answers.length !== form.fields.length) invalid("Check each question.");
    const answers = form.fields.map((f, i) => {
      const a = args.answers[i].trim();
      if (!a && !f.required) return "";
      if (
        !a ||
        a.length > (f.kind === "paragraph" ? 3000 : 300) ||
        (f.kind === "choice" && !f.options.includes(a))
      )
        invalid("Check your answer to " + f.label + ".");
      if (
        f.kind === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(a) ||
          !Number.isFinite(Date.parse(a)) ||
          new Date(a).toISOString().slice(0, 10) !== a)
      )
        invalid("Enter a valid date.");
      return a;
    });
    await protectSharedNetwork(ctx, args.networkKey, "forms");
    for (const [scope, key] of [
      ["visitor", args.fingerprint],
      ["email", shortHash(email)],
    ])
      await enforceRateLimit(ctx, { scope: "school-forms:" + scope, key, limit: 10, windowMs: 3600000 });
    const reference = referenceNumber("NPS-F", Date.now(), args.submissionId);
    const id = await ctx.db.insert("schoolResponses", {
      formId: form._id,
      expiresAt: schoolResponseExpiry(form._id, form.revision, Date.now()),
      ...(args.consentVersion ? { consent: { at: Date.now(), version: args.consentVersion, formRevision: form.revision } } : {}),
      email,
      answers,
      reference,
      submissionId: args.submissionId,
    });
    for (const type of ["school_form_alert", "school_form_receipt"] as const)
      await enqueueJob(ctx, {
        type,
        idempotencyKey: type + ":" + id,
        payload: {
          entityType: "schoolResponses",
          entityId: id,
          recipient: type === "school_form_receipt" ? email : undefined,
        },
      });
    return reference;
  },
});

export const setRetentionHold = mutation({
  args: { id: v.id("schoolResponses"), hold: v.boolean() },
  handler: async (ctx, { id, hold }) => {
    const actor = await requireRole(ctx, ["admin"]);
    const response = await ctx.db.get("schoolResponses", id);
    if (!response) invalid("Response unavailable.");
    if (Boolean(response.retentionHold) === hold) return;
    await ctx.db.patch("schoolResponses", id, { retentionHold: hold || undefined });
    await writeAudit(ctx, actor, { action: hold ? "retention.hold_set" : "retention.hold_released",
      entityType: "schoolResponses", entityId: id, summary: hold ? "Placed a preservation hold." : "Released a preservation hold." });
  },
});

export const mailSettings = query({
  args: {},
  handler: async (ctx) => {
    await requireRole(ctx, ["admin"]);
    const settings = await ctx.db.query("schoolMail").unique();
    return {
      sender: settings?.sender ?? "",
      staff: settings?.staff ?? "",
      hasKey: Boolean(settings?.sealedKey),
    };
  },
});
export const mailConnection = internalQuery({
  args: {},
  handler: async (ctx) => ctx.db.query("schoolMail").unique(),
});
export const saveMail = mutation({
  args: { sender: v.string(), staff: v.string(), sealedKey: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await requireRole(ctx, ["admin"]);
    const sender = normalizedEmail(args.sender),
      staff = normalizedEmail(args.staff);
    if (args.sealedKey && (args.sealedKey.length > 1600 || !/^[A-Za-z0-9_-]+$/.test(args.sealedKey)))
      invalid("Invalid sending credential.");
    const old = await ctx.db.query("schoolMail").unique();
    const values = { sender, staff, sealedKey: args.sealedKey ?? old?.sealedKey, updatedAt: Date.now() };
    if (old) await ctx.db.patch("schoolMail", old._id, values);
    else await ctx.db.insert("schoolMail", values);
  },
});
