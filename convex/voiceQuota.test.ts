import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createHmac } from "node:crypto";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

describe("voice transcription quota", () => {
  const secret = "school-test-signing-secret-32-characters";
  afterEach(() => vi.unstubAllEnvs());
  it("admits a correctly signed server request", async () => {
    vi.stubEnv("FORM_SERVICE_SECRET", secret);
    const t = convexTest(schema, modules);
    const requestTimestamp = Date.now();
    const networkKey = "a".repeat(64);
    const canonical = JSON.stringify({ requestTimestamp, form: "voice-quota", networkKey });
    const signature = createHmac("sha256", secret).update(canonical).digest("hex");
    await expect(
      t.action(api.formActions.authorizeVoice, { requestTimestamp, networkKey, signature }),
    ).resolves.toBe(true);
  });

  it("refuses unsigned callers before reserving capacity", async () => {
    vi.stubEnv("FORM_SERVICE_SECRET", secret);
    const t = convexTest(schema, modules);
    await expect(
      t.action(api.formActions.authorizeVoice, {
        requestTimestamp: Date.now(),
        networkKey: "a".repeat(64),
        signature: "0".repeat(64),
      }),
    ).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("rateLimits").collect())).toHaveLength(0);
  });

  it("enforces individual network and shared service quotas across workers", async () => {
    const t = convexTest(schema, modules);
    const networkKey = "a".repeat(64);
    const take = (key: string) => t.mutation(internal.forms.reserveVoiceCapacity, { networkKey: key });
    await expect(take(networkKey)).resolves.toBe(true);
    await t.run(async (ctx) => {
      const rows = await ctx.db.query("rateLimits").collect();
      const network = rows.find((row) => row.scope === "voice:network")!;
      await ctx.db.patch("rateLimits", network._id, { count: 120 });
    });
    await expect(take(networkKey)).resolves.toBe(false);
    await expect(take("b".repeat(64))).resolves.toBe(true);
    await t.run(async (ctx) => {
      const all = await ctx.db
        .query("rateLimits")
        .withIndex("by_key_scope", (q) => q.eq("key", "all").eq("scope", "voice:service"))
        .unique();
      await ctx.db.patch("rateLimits", all!._id, { count: 1200 });
    });
    await expect(take("c".repeat(64))).resolves.toBe(false);
  });
});
