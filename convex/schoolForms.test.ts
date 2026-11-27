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
      answers: ["Art"],
    };
    await expect(
      t.mutation(internal.schoolForms.record, { ...input, answers: ["Invalid"] }),
    ).rejects.toThrow();
    const ref = await t.mutation(internal.schoolForms.record, input);
    expect(await t.mutation(internal.schoolForms.record, input)).toBe(ref);
    const jobs = await t.run((ctx) => ctx.db.query("jobs").collect());
    expect(jobs.map((j) => j.type).sort()).toEqual(["school_form_alert", "school_form_receipt"]);
    const query = { id, paginationOpts: { numItems: 20, cursor: null } };
    await expect(t.query(api.schoolForms.responses, query)).rejects.toThrow();
    expect((await admin.query(api.schoolForms.responses, query)).page).toHaveLength(1);
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
