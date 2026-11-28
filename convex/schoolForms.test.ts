import { convexTest } from "convex-test";
import { describe, it, expect, vi } from "vitest";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("school office forms", () => {
  it("publishes drafts, validates responses, enqueues once and preserves earlier responses after closure", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("users", {
        clerkUserId: "head",
        name: "School head",
        email: "head@example.test",
        roles: ["admin"],
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
    });
    const admin = t.withIdentity({ subject: "head" }),
      draft = {
        title: "Club registration",
        description: "Choose a club.",
        fields: [{ label: "Club", required: true, kind: "choice" as const, options: ["Music", "Art"] }],
      };
    await expect(t.mutation(api.schoolForms.saveDraft, draft)).rejects.toThrow();
    const id = await admin.mutation(api.schoolForms.saveDraft, draft);
    expect(await t.query(api.schoolForms.publicForm, { id })).toBeNull();
    await admin.mutation(api.schoolForms.setStatus, { id, revision: 1, status: "open" });
    expect((await t.query(api.schoolForms.openForms, {}))[0].title).toBe(draft.title);
    const input = {
      id,
      revision: 2,
      submissionId: "42a64c65-cb50-497a-abde-d8e0783d86d8",
      email: "parent@example.test",
      fingerprint: "visitor-test",
      networkKey: "a".repeat(64),
      consentVersion: "share-answers-v1" as const,
      answers: ["Art"],
    };
    await expect(
      t.mutation(internal.schoolForms.record, { ...input, answers: ["Invalid"] }),
    ).rejects.toThrow();
    const ref = await t.mutation(internal.schoolForms.record, input);
    expect(await t.mutation(internal.schoolForms.record, input)).toBe(ref);
    const saved = await t.run((ctx) => ctx.db.query("schoolResponses").unique());
    expect(saved?.expiresAt).toBeUndefined();
    expect(saved?.consent).toMatchObject({ version: "share-answers-v1", formRevision: 2, at: expect.any(Number) });
    await t.run(async ctx => {
      const quota = await ctx.db.query("rateLimits").withIndex("by_key_scope", q => q.eq("key", "a".repeat(64)).eq("scope", "forms:network")).unique();
      if (!quota) throw new Error("Missing shared network quota");
      await ctx.db.patch("rateLimits", quota._id, { count: 120 });
    });
    await expect(t.mutation(internal.schoolForms.record, { ...input, fingerprint: "another-session", submissionId: "another-response", email: "another@example.test" })).rejects.toThrow();
    const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
    expect(jobs.map((j) => j.type).sort()).toEqual(["school_form_alert", "school_form_receipt"]);
    const query = { id, paginationOpts: { numItems: 20, cursor: null } };
    await expect(t.query(internal.schoolForms.responses, query)).rejects.toThrow();
    expect((await admin.query(internal.schoolForms.responses, query)).page).toHaveLength(1);
    await admin.mutation(api.schoolForms.setStatus, { id, revision: 2, status: "closed" });
    await expect(
      t.mutation(internal.schoolForms.record, { ...input, submissionId: "other-request" }),
    ).rejects.toThrow();
    expect(await t.query(api.schoolForms.openForms, {})).toHaveLength(0);
    vi.stubEnv("SCHOOL_MAIL_TRANSPORT", "python");
    try {
      expect(await t.mutation(internal.jobs.claim, { jobId: jobs[0]._id })).toBeNull();
      expect((await t.run((ctx) => ctx.db.get("jobs", jobs[0]._id)))?.attempts).toBe(0);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});

it("schedules only explicitly approved revisions and restricts preservation holds to admins", async () => {
  const t = convexTest(schema, modules);
  const admin = t.withIdentity({ subject: "head" });
  const id = await t.run(async ctx => {
    await ctx.db.insert("users", { clerkUserId: "head", name: "Head", email: "head@example.test",
      roles: ["admin"], status: "active", createdAt: 1, updatedAt: 1 });
    return ctx.db.insert("schoolForms", { title: "Routine", description: "", fields: [], status: "open", revision: 2, updatedAt: 1 });
  });
  const input = { id, revision: 2, fingerprint: "fixture", email: "fixture@example.test", answers: [] };
  try {
    vi.stubEnv("SCHOOL_RESPONSE_RETENTION_DAYS", "365");
    vi.stubEnv("SCHOOL_ROUTINE_FORM_REVISIONS", id + "@1");
    await t.mutation(internal.schoolForms.record, { ...input, submissionId: "previous-policy" });
    vi.stubEnv("SCHOOL_ROUTINE_FORM_REVISIONS", id + "@2");
    await t.mutation(internal.schoolForms.record, { ...input, submissionId: "approved-policy" });
    const [old, eligible] = await t.run(ctx => ctx.db.query("schoolResponses").take(2));
    expect(old.expiresAt).toBeUndefined();
    expect(Math.abs(eligible.expiresAt! - eligible._creationTime - 365 * 86_400_000)).toBeLessThan(5000);
    await expect(t.mutation(api.schoolForms.setRetentionHold, { id: eligible._id, hold: true })).rejects.toThrow();
    await admin.mutation(api.schoolForms.setRetentionHold, { id: eligible._id, hold: true });
    expect((await t.run(ctx => ctx.db.get("schoolResponses", eligible._id)))?.retentionHold).toBe(true);
    await admin.mutation(api.schoolForms.setRetentionHold, { id: eligible._id, hold: false });
    expect((await t.run(ctx => ctx.db.get("schoolResponses", eligible._id)))?.retentionHold).toBeUndefined();
    const audit = await t.run(ctx => ctx.db.query("auditLogs").take(10));
    expect(audit.map(row => row.action)).toEqual(["retention.hold_set", "retention.hold_released"]);
  } finally { vi.unstubAllEnvs(); }
});
