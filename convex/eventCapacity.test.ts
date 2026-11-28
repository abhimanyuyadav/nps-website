import { convexTest } from "convex-test";
import { expect, it, vi } from "vitest";
import type { Doc, Id } from "./_generated/dataModel";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

async function setup(capacity?: number) {
  const t = convexTest(schema, modules);
  const now = Date.now();
  const { eventId, editorId } = await t.run(async (ctx) => {
    const editorId = await ctx.db.insert("users", {
      clerkUserId: "capacity-owner",
      name: "Fixture",
      email: "staff@example.test",
      status: "active",
      roles: ["admin"],
      createdAt: now,
      updatedAt: now,
    });
    const eventId = await ctx.db.insert("events", {
      slug: "capacity-fixture",
      title: "Fixture",
      description: "School event",
      startAt: now + 86400000,
      endAt: now + 172800000,
      isOnline: false,
      timezone: "UTC",
      capacity,
      registrationEnabled: true,
      featured: false,
      seo: {},
      status: "published",
      publishedAt: now,
      createdBy: editorId,
      updatedBy: editorId,
      createdAt: now,
      updatedAt: now,
    });
    return { eventId, editorId };
  });
  const staff = t.withIdentity({ subject: "capacity-owner", issuer: process.env.CLERK_JWT_ISSUER_DOMAIN! });
  let sequence = 0;
  const add = async (n: number, status: Doc<"eventRegistrations">["status"], seats = 1) => {
    // Independent fixture batches keep each seeding mutation bounded.
    const ids: Id<"eventRegistrations">[] = [];
    while (n > 0) {
      const size = Math.min(n, 100);
      const start = sequence;
      sequence += size;
      ids.push(
        ...(await t.run(async (ctx) => {
          const batch = [];
          for (let i = start; i < start + size; i++) {
            batch.push(
              await ctx.db.insert("eventRegistrations", {
                eventId,
                idempotencyKey: "fixture-order-" + i,
                registrationNumber: "NPS-TEST-" + i,
                name: "Fixture",
                email: "family-" + i + "@example.test",
                attendees: seats,
                consent: true,
                status,
                cancellationToken: "fixture-cancel-" + i,
                createdAt: now + i,
                updatedAt: now,
              }),
            );
          }
          return batch;
        })),
      );
      n -= size;
    }
    return ids;
  };
  const read = () => t.run((ctx) => ctx.db.get("events", eventId));
  return { t, staff, eventId, editorId, add, read, now };
}

it("counts historical occupied seats before adding seats to an unlimited legacy event", async () => {
  const { t, add, read, eventId } = await setup();
  await add(1, "attended", 2);
  await add(1, "no_show", 3);
  await add(1, "waitlisted", 10);
  await t.mutation(internal.forms.registerEvent, {
    eventId,
    idempotencyKey: "fixture-new-order",
    cancellationToken: "fixture-new-cancel",
    name: "Fixture",
    email: "new-fixture@example.test",
    attendees: 2,
    consent: true,
    fingerprint: "fixture-network-key",
  });
  expect((await read())?.registeredAttendeeCount).toBe(7);
});

it("guards zero-capacity promotions and refuses to lower a legacy cap below occupied seats", async () => {
  const { t, staff, add, read, eventId, now } = await setup(0);
  await add(1, "registered", 3);
  const [waitlisted] = await add(1, "waitlisted");
  await expect(
    staff.mutation(api.admin.updateSubmission, {
      type: "eventRegistrations",
      id: waitlisted,
      status: "registered",
    }),
  ).rejects.toThrow(/at capacity/i);
  const data = {
    slug: "capacity-fixture",
    title: "Fixture",
    description: "A school event description.",
    startAt: now + 86400000,
    endAt: now + 172800000,
    timezone: "UTC",
    isOnline: false,
    registrationEnabled: true,
    capacity: 2,
  };
  await expect(
    staff.mutation(api.admin.upsertContent, { payload: { type: "events", id: eventId, data } }),
  ).rejects.toThrow(/capacity cannot be lower/i);
  expect((await read())?.capacity).toBe(0);
  const created = await staff.mutation(api.admin.upsertContent, {
    payload: { type: "events", data: { ...data, slug: "new-fixture" } },
  });
  expect(await t.run((ctx) => ctx.db.get("events", created as Id<"events">))).toMatchObject({
    registeredAttendeeCount: 0,
  });
});

it("keeps completed attendance and ended event registrations intact", async () => {
  const { t, add, eventId, now } = await setup(10);
  const [attended] = await add(1, "attended");
  const [absent] = await add(1, "no_show");
  const [registered] = await add(1, "registered");
  const [waiting] = await add(1, "waitlisted");
  for (let i = 0; i < 2; i++)
    await t.mutation(api.forms.cancelEventRegistration, { token: "fixture-cancel-" + i });
  await t.run((ctx) => ctx.db.patch("events", eventId, { endAt: now - 1 }));
  for (let i = 2; i < 4; i++)
    await t.mutation(api.forms.cancelEventRegistration, { token: "fixture-cancel-" + i });
  const statuses = await t.run(async (ctx) =>
    Promise.all(
      [attended, absent, registered, waiting].map(
        async (id) => (await ctx.db.get("eventRegistrations", id))?.status,
      ),
    ),
  );
  expect(statuses).toEqual(["attended", "no_show", "registered", "waitlisted"]);
});

it("preserves unknown remote counts and requires evidence before allocating finite seats", async () => {
  const { t, add, now } = await setup(4);
  await add(1, "registered", 4);
  expect(
    await t.query(api.content.getEvent, { slug: "capacity-fixture", resolveCapacity: true }),
  ).toMatchObject({ registeredAttendeeCount: 4 });
  const args = {
    slug: "mirror",
    title: "Fixture",
    description: "School event",
    startAt: now + 5,
    endAt: now + 100000,
    timezone: "UTC",
    isOnline: false,
    capacity: 4,
    registrationEnabled: true,
  };
  await expect(t.mutation(internal.workflowEvents.refresh, args)).rejects.toThrow(/reconciled/i);
  const id = await t.mutation(internal.workflowEvents.refresh, { ...args, previousAttendees: 4 });
  expect(await t.run((ctx) => ctx.db.get("events", id))).toMatchObject({
    capacity: 0,
    registeredAttendeeCount: 0,
  });
});

it("keeps cancellation available and restarts a paged tally after a concurrent cancellation", async () => {
  const { t, eventId, add, read } = await setup(4000);
  await add(1002, "registered");
  expect(await t.mutation(internal.workflowEvents.reconcileCapacity, { eventId })).toEqual({ done: false });
  await t.mutation(api.forms.cancelEventRegistration, { token: "fixture-cancel-0" });
  expect((await read())?.registeredAttendeeCount).toBeUndefined();
  let result: { done: boolean; count?: number } = { done: false };
  for (let i = 0; i < 15 && !result.done; i++) {
    result = await t.mutation(internal.workflowEvents.reconcileCapacity, { eventId });
  }
  expect(result).toEqual({ done: true, count: 1001 });
  expect((await read())?.registeredAttendeeCount).toBe(1001);
  expect(await t.mutation(internal.workflowEvents.reconcileCapacity, { eventId })).toEqual(result);
});

it("permits new seat allocations only on the designated database after the fence is configured", async () => {
  const { t, staff, eventId, add } = await setup(4);
  const [waiting] = await add(1, "waitlisted");
  const input = {
    eventId,
    idempotencyKey: "authority-one",
    cancellationToken: "authority-cancel",
    name: "Fixture",
    email: "one@example.test",
    attendees: 1,
    consent: true,
    fingerprint: "authority-test-ip",
  };
  vi.stubEnv("NPS_EVENT_REGISTRATION_AUTHORITY", "https://writer.example.test");
  try {
    vi.stubEnv("CONVEX_CLOUD_URL", "https://earlier.example.test");
    await expect(t.mutation(internal.forms.registerEvent, input)).rejects.toThrow(/enrollment writer/i);
    await expect(
      staff.mutation(api.admin.updateSubmission, {
        type: "eventRegistrations",
        id: waiting,
        status: "registered",
      }),
    ).rejects.toThrow(/enrollment writer/i);
    vi.stubEnv("CONVEX_CLOUD_URL", "https://writer.example.test");
    await expect(t.mutation(internal.forms.registerEvent, input)).resolves.toMatchObject({ ok: true });
    vi.stubEnv("CONVEX_CLOUD_URL", "https://earlier.example.test");
    await expect(t.mutation(internal.forms.registerEvent, input)).resolves.toMatchObject({ ok: true });
  } finally {
    vi.unstubAllEnvs();
  }
});
