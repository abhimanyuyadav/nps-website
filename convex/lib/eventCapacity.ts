import { ConvexError } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { QueryCtx, MutationCtx } from "../_generated/server";

const countedStatuses = ["registered", "attended", "no_show"] as const;
const inlineLimit = 1_000;
type ReadCtx = Pick<QueryCtx, "db">;

export function occupiesSeats(status: string) {
  return countedStatuses.some((counted) => counted === status);
}

export function pendingCapacity(): never {
  throw new ConvexError({
    code: "CAPACITY_RECONCILIATION_REQUIRED",
    message: "Event capacity is temporarily unavailable while registrations are reconciled.",
  });
}

// A missing count is unknown. Limit total rows read across all three indexed statuses.
export async function attendeeCount(ctx: ReadCtx, event: Doc<"events">) {
  if (event.registeredAttendeeCount !== undefined) return event.registeredAttendeeCount;
  let rowsRead = 0;
  let total = 0;
  for (const status of countedStatuses) {
    const rows = await ctx.db
      .query("eventRegistrations")
      .withIndex("by_event_status", (q) => q.eq("eventId", event._id).eq("status", status))
      .take(inlineLimit + 1 - rowsRead);
    rowsRead += rows.length;
    if (rowsRead > inlineLimit) return undefined;
    for (const row of rows) total += row.attendees;
  }
  return total;
}

export function capacityProgress(ctx: ReadCtx, eventId: Id<"events">) {
  return ctx.db
    .query("eventCapacityProgress")
    .withIndex("by_event", (q) => q.eq("eventId", eventId))
    .unique();
}

// Writers run in the same transaction as the registration change. Discard any
// partial owner reconciliation so that its next page starts over on a fresh ledger.
export async function storeAttendeeCount(ctx: MutationCtx, event: Doc<"events">, total: number | undefined) {
  if (event.registeredAttendeeCount === undefined) {
    const progress = await capacityProgress(ctx, event._id);
    if (progress) await ctx.db.delete("eventCapacityProgress", progress._id);
  }
  if (total !== event.registeredAttendeeCount) {
    await ctx.db.patch("events", event._id, { registeredAttendeeCount: total });
  }
}

// Set the same canonical backend URL on every deployment during the enrollment
// cutover. CONVEX_CLOUD_URL identifies the backend executing this transaction.
export function requireSeatWriter() {
  const authority = process.env.NPS_EVENT_REGISTRATION_AUTHORITY;
  if (authority === undefined) return;
  const local = process.env.CONVEX_CLOUD_URL;
  if (!authority || !local || authority !== local) {
    throw new ConvexError({ code: "REGISTRATION_WRITER_UNAVAILABLE",
      message: "This database is not the enrollment writer." });
  }
}
