import { convexTest } from "convex-test";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

const callback = "https://mail.example.test/school-callback";
const send = vi.fn<typeof fetch>();

beforeEach(() => {
  vi.stubEnv("NOTIFICATION_WEBHOOK_URL", callback);
  vi.stubEnv("NOTIFICATION_WEBHOOK_SECRET", "synthetic-notification-fixture-".repeat(2));
  vi.stubEnv("NOTIFICATION_WEBHOOK_ALLOWED_HOSTS", " mail.example.test. ");
  vi.stubEnv("SCHOOL_MAIL_TRANSPORT", "");
  send.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", send);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function processAlert() {
  const t = convexTest(schema, modules);
  const jobId = await t.run(async (ctx) => {
    const now = Date.now();
    await ctx.db.insert("schoolMail", {
      sender: "office@example.test",
      staff: "head@example.test",
      sealedKey: "synthetic-envelope",
      updatedAt: now,
    });
    const contactId = await ctx.db.insert("contacts", {
      idempotencyKey: "contact-fixture",
      ticketNumber: "NPS-C-SAMPLE",
      name: "Fixture sender",
      email: "sender@example.test",
      subject: "Fixture subject",
      message: "Fixture private message",
      consentToContact: true,
      status: "new",
      createdAt: now,
      updatedAt: now,
    });
    return ctx.db.insert("jobs", {
      type: "contact_staff_alert",
      status: "queued",
      idempotencyKey: "alert-fixture",
      payload: { entityType: "contacts", entityId: contactId, template: "contact-staff-alert" },
      attempts: 0,
      maxAttempts: 1,
      runAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });
  await t.action(internal.jobs.processOne, { jobId });
  return t.run((ctx) => ctx.db.get("jobs", jobId));
}

it.each([undefined, "", " , ", "other.example.test"])(
  "requires an explicitly allowed destination (%s)",
  async (hosts) => {
    vi.stubEnv("NOTIFICATION_WEBHOOK_ALLOWED_HOSTS", hosts);
    expect(await processAlert()).toMatchObject({
      status: "dead",
      lastError: expect.stringContaining("not allowlisted"),
    });
    expect(send).not.toHaveBeenCalled();
  },
);

it("minimizes the built-in staff alert at the outgoing HTTP boundary", async () => {
  vi.stubEnv("SCHOOL_MAIL_TRANSPORT", "python");
  expect(await processAlert()).toMatchObject({ status: "succeeded" });
  expect(send).toHaveBeenCalledTimes(1);
  const [url, init] = send.mock.calls[0];
  expect(url).toBe(callback);
  expect(init?.redirect).toBe("error");
  expect(JSON.parse(String(init?.body))).toEqual({
    version: 1,
    type: "contact_staff_alert",
    idempotencyKey: "alert-fixture",
    data: { ticketNumber: "NPS-C-SAMPLE" },
    mail: { sender: "office@example.test", staff: "head@example.test", sealedKey: "synthetic-envelope" },
  });
});

it("preserves the custom callback's payload and excludes built-in mail settings", async () => {
  expect(await processAlert()).toMatchObject({ status: "succeeded" });
  const payload = JSON.parse(String(send.mock.calls[0][1]?.body));
  expect(payload.template).toBe("contact-staff-alert");
  expect(payload.data).toMatchObject({ email: "sender@example.test", message: "Fixture private message" });
  expect(payload).not.toHaveProperty("mail");
});

it("keeps receiver text out of stored errors", async () => {
  const response = new Response("fixture-private-body", { status: 503 });
  const read = vi.spyOn(response, "text");
  send.mockResolvedValue(response);
  expect(await processAlert()).toMatchObject({ lastError: "RETRYABLE: webhook returned 503." });
  expect(read).not.toHaveBeenCalled();
});
