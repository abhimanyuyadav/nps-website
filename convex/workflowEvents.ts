import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

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
    previousAttendees: v.number(),
    registrationEnabled: v.boolean(),
  },
  handler: async (ctx, { previousAttendees, ...event }) => {
    const now = Date.now();
    const row = await ctx.db
      .query("events")
      .withIndex("by_slug", (q) => q.eq("slug", event.slug))
      .unique();
    // The existing registration counter tracks only seats allocated by this deployment.
    // Zero remaining seats must still imply a waitlist (the original capacity code treats 0 as unlimited).
    const values = {
      ...event,
      capacity: event.capacity === undefined ? undefined : Math.max(0, event.capacity - previousAttendees),
      updatedAt: now,
    };
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
