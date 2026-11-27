import { makeFunctionReference, paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { requireRole, requireUser } from "./lib/auth";
import { writeAudit } from "./lib/audit";
import { boundedPaginationOpts } from "./lib/validators";

// Only these private queries can be used here. Each one enforces its existing role checks.
const collections = {
  "admin:listContent": "content",
  "admin:listUsers": "users",
  "admin:getStaffRecord": "users",
  "admin:listSubmissions": "submissions",
  "admin:getSubmission": "submissions",
  "admin:listSubscribers": "newsletterSubscribers",
  "admin:listAiConversations": "aiConversations",
  "admin:getAiConversation": "aiConversations",
  "schoolForms:responses": "schoolResponses",
  "articleAdmin:listArticles": "articles",
  "articleAdmin:getArticle": "articles",
} as const;
type Source = keyof typeof collections;
type Row = { _id: string; [key: string]: any };
const selection = { source: v.string(), params: v.any() };
function sourceName(name: string): Source {
  if (!Object.hasOwn(collections, name)) throw new ConvexError("Unknown school record type.");
  return name as Source;
}
async function fetchRecords(ctx: QueryCtx | MutationCtx, source: string, params: any) {
  if (params.paginationOpts) boundedPaginationOpts(params.paginationOpts);
  return ctx.runQuery(makeFunctionReference<"query">(sourceName(source)), params);
}
async function fingerprint(value: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, (b) => b.toString(16).padStart(2, "0")).join("");
}
// Reactive notifications contain a digest only. Full field values are released by the mutation below.
export const pageVersion = query({
  args: { ...selection, paginationOpts: paginationOptsValidator },
  handler: async (ctx, { source, params, paginationOpts }) => {
    const result = await fetchRecords(ctx, source, { ...params, paginationOpts });
    if (!Array.isArray(result?.page)) throw new ConvexError("Expected a record list.");
    const { isDone, continueCursor, splitCursor, pageStatus } = result;
    return {
      isDone,
      continueCursor,
      splitCursor,
      pageStatus,
      page: [{ paginationOpts, version: await fingerprint(result.page) }],
    };
  },
});
export const detailVersion = query({
  args: selection,
  handler: async (ctx, { source, params }) => fingerprint(await fetchRecords(ctx, source, params)),
});
export const read = mutation({
  args: selection,
  handler: async (ctx, { source, params }) => {
    const actor = await requireUser(ctx);
    const result = await fetchRecords(ctx, source, params);
    const rows: Row[] = result?.page ?? (result ? [result.conversation ?? result] : []);
    const entityType = params.type ?? collections[sourceName(source)];
    for (const row of rows) {
      await writeAudit(ctx, actor, {
        action: "record.viewed",
        entityType,
        entityId: row._id,
        summary: result?.page ? "Displayed in a staff record list." : "Opened record details.",
        metadata: { actorName: actor.name },
      });
    }
    return result;
  },
});
export const exportRegistrations = mutation({
  args: { ids: v.array(v.id("eventRegistrations")) },
  handler: async (ctx, { ids }) => {
    const actor = await requireRole(ctx, ["admin"]);
    if (!ids.length || ids.length > 100 || new Set(ids).size !== ids.length)
      throw new ConvexError("Select between 1 and 100 different registrations per export batch.");
    const rows = [];
    for (const id of ids) {
      const record = await fetchRecords(ctx, "admin:getSubmission", { type: "eventRegistrations", id });
      if (!record) throw new ConvexError("A registration no longer exists. Refresh the list.");
      await writeAudit(ctx, actor, {
        action: "record.exported",
        entityType: "eventRegistrations",
        entityId: id,
        summary: "Released this registration for CSV export.",
        metadata: { actorName: actor.name },
      });
      rows.push(record);
    }
    return rows;
  },
});
