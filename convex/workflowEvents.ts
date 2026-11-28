import { ConvexError, v } from "convex/values";
import { internalMutation } from "./_generated/server";

import { capacityProgress, occupiesSeats, pendingCapacity } from "./lib/eventCapacity";

// A local event row supplies the transaction and capacity counter for new registrations.
export const refresh = internalMutation({
  args: {
    slug: v.string(),
    title: v.string(),
    description: v.string(),
    startAt: v.number(),
    endAt: v.number(),
    timezone: v.string(),
    isOnline: v.boolean(),
    venue: v.optional(v.string()),
    capacity: v.optional(v.number()),
    previousAttendees: v.optional(v.number()),
    registrationEnabled: v.boolean(),
  },
  handler: async (ctx, { previousAttendees, ...event }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", event.slug))
      .unique();
    let capacity = event.capacity;
    if (capacity !== undefined) {
      if (previousAttendees === undefined || !Number.isSafeInteger(previousAttendees) || previousAttendees < 0) {
        pendingCapacity();
      }
      capacity = Math.max(0, capacity - previousAttendees);
    }
    const values = { ...event, capacity, updatedAt: now };
    if (row) {
      await ctx.db.patch("events", row._id, values);
      return row._id;
    }
    const serviceId = "school-event-import";
    const existing = await ctx.db
      .query("users")
      .withIndex("by_clerk_user_id", (q) => q.eq("clerkUserId", serviceId))
      .unique();
    const actor =
      existing?._id ??
      (await ctx.db.insert("users", {
        clerkUserId: serviceId,
        name: "Published school events",
        email: "events@example.invalid",
        roles: [],
        status: "suspended",
        createdAt: now,
        updatedAt: now,
      }));
    return await ctx.db.insert("events", {
      ...values,
      registeredAttendeeCount: 0,
      featured: false,
      seo: {},
      status: "published",
      createdBy: actor,
      updatedBy: actor,
      createdAt: now,
    });
  },
});


// Owner-invoked only. Repeat with the same eventId until done. Use restart once
// to recompute a previously materialized count. Cursors and subtotals stay server-side.
export const reconcileCapacity = internalMutation({
  args: { eventId: v.id("events"), restart: v.optional(v.boolean()) },
  returns: v.object({ done: v.boolean(), count: v.optional(v.number()) }),
  handler: async (ctx, { eventId, restart }) => {
    const event = await ctx.db.get("events", eventId);
    if (!event) throw new ConvexError("Event not found.");
    if (!restart && event.registeredAttendeeCount !== undefined) {
      return { done: true, count: event.registeredAttendeeCount };
    }
    const progress = await capacityProgress(ctx, eventId);
    const page = await ctx.db.query("eventRegistrations")
      .withIndex("by_event_created_at", (q) => q.eq("eventId", eventId))
      .paginate({ cursor: restart ? null : progress?.cursor ?? null, numItems: 100 });
    let subtotal = restart ? 0 : progress?.subtotal ?? 0;
    for (const row of page.page) if (occupiesSeats(row.status)) subtotal += row.attendees;
    if (page.isDone) {
      await ctx.db.patch("events", eventId, { registeredAttendeeCount: subtotal });
      if (progress) await ctx.db.delete("eventCapacityProgress", progress._id);
      return { done: true, count: subtotal };
    }
    if (event.registeredAttendeeCount !== undefined) {
      await ctx.db.patch("events", eventId, { registeredAttendeeCount: undefined });
    }
    const next = { cursor: page.continueCursor, subtotal };
    if (progress) await ctx.db.patch("eventCapacityProgress", progress._id, next);
    else await ctx.db.insert("eventCapacityProgress", { eventId, ...next });
    return { done: false };
  },
});
