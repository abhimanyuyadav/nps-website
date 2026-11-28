import { readBoundedJson } from "@/lib/server/request-body";
import { createHmac, randomUUID } from "node:crypto";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import { api } from "@/convex/_generated/api";
import { isConfiguredSecret } from "@/lib/security/configuration";
import {
  serializeArchiveReceipt,
  type ArchiveReceipt,
  type ArchiveRecordType,
} from "@/lib/security/archive-receipt";

const id = z.string().regex(/^[a-z0-9]{16,64}$/);
const cursor = z.string().max(8192).nullable();
const paginationOpts = z.strictObject({
  numItems: z.number().int().min(1).max(100),
  cursor,
  endCursor: cursor.optional(),
  id: z.number().int().optional(),
});
const status = z.string().min(1).max(64).optional();
const type = z.enum(["contacts", "admissions", "eventRegistrations"]);
const read = z.literal("read");
const selection = z.union([
  z.strictObject({
    operation: read,
    source: z.literal("admin:listSubmissions"),
    params: z.strictObject({ type, paginationOpts, status, eventId: id.optional() }),
  }),
  z.strictObject({
    operation: read,
    source: z.literal("admin:getSubmission"),
    params: z.strictObject({ type, id }),
  }),
  z.strictObject({
    operation: read,
    source: z.literal("admin:listSubscribers"),
    params: z.strictObject({ paginationOpts, status }),
  }),
  z.strictObject({
    operation: read,
    source: z.literal("admin:listAiConversations"),
    params: z.strictObject({ paginationOpts, status }),
  }),
  z.strictObject({
    operation: read,
    source: z.literal("admin:getAiConversation"),
    params: z.strictObject({ conversationId: id }),
  }),
  z.strictObject({
    operation: z.literal("export"),
    ids: z
      .array(id)
      .min(1)
      .max(100)
      .refine((ids) => new Set(ids).size === ids.length),
  }),
]);
function reply(value: unknown, code = 200) {
  return Response.json(value, {
    status: code,
    headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
  });
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply(null, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return reply(null, 415);
  const { userId, getToken, sessionClaims } = await auth();
  if (!userId) return reply(null, 401);
  const parsed = selection.safeParse(await readBoundedJson(request, 24576));
  if (!parsed.success) return reply(null, 400);
  const spec = parsed.data;
  const kind: ArchiveRecordType =
    spec.operation === "export"
      ? "eventRegistrations"
      : "type" in spec.params
        ? spec.params.type
        : spec.source === "admin:listSubscribers"
          ? "newsletterSubscribers"
          : "aiConversations";
  const primaryUrl = process.env.NEXT_PUBLIC_CONVEX_URL;
  const archiveUrl = process.env.NEXT_PUBLIC_ARCHIVE_CONVEX_URL;
  const key = process.env.FORM_SERVICE_SECRET;
  if (!primaryUrl || !archiveUrl || !isConfiguredSecret(key)) return reply(null, 503);
  try {
    const token = await getToken(sessionClaims?.aud === "convex" ? {} : { template: "convex" });
    if (!token) return reply(null, 401);
    const primary = new ConvexHttpClient(primaryUrl);
    const archive = new ConvexHttpClient(archiveUrl);
    primary.setAuth(token);
    archive.setAuth(token);
    const staff = await primary.query(api.users.current, {});
    if (
      !staff ||
      staff.clerkUserId !== userId ||
      staff.status !== "active" ||
      !(staff.roles.includes("admin") || (kind === "admissions" && staff.roles.includes("admissions")))
    )
      return reply(null, 403);
    let result;
    let ids: string[];
    const archiveMode = process.env.ARCHIVE_RECORD_API ?? "legacy";
    if (archiveMode !== "legacy" && archiveMode !== "audited") return reply(null, 503);
    if (spec.operation === "export" && archiveMode === "audited") {
      const rows = await archive.mutation(
        makeFunctionReference<"mutation">("recordAccess:exportRegistrations"),
        { ids: spec.ids },
      );
      if (
        !Array.isArray(rows) ||
        rows.length !== spec.ids.length ||
        rows.some((row, index) => row?._id !== spec.ids[index])
      )
        return reply(null, 409);
      result = rows;
      ids = spec.ids;
    } else if (spec.operation === "export") {
      const rows = [];
      // Bound concurrent work on the historical backend, preserving requested CSV order.
      for (let offset = 0; offset < spec.ids.length; offset += 8) {
        const batch = await Promise.all(
          spec.ids.slice(offset, offset + 8).map((recordId) =>
            archive.query(makeFunctionReference<"query">("admin:getSubmission"), {
              type: kind,
              id: recordId,
            }),
          ),
        );
        if (batch.some((row, index) => !row || row._id !== spec.ids[offset + index])) return reply(null, 409);
        rows.push(...batch);
      }
      result = rows;
      ids = rows.map((row) => row._id);
    } else {
      result =
        archiveMode === "audited"
          ? await archive.mutation(makeFunctionReference<"mutation">("recordAccess:read"), {
              source: spec.source,
              params: spec.params,
            })
          : await archive.query(makeFunctionReference<"query">(spec.source), spec.params);
      const rows = result?.page ?? (result ? [result.conversation ?? result] : []);
      ids = rows.map((row: { _id: string }) => row._id);
      if (spec.source === "admin:getSubmission" && result && result._id !== spec.params.id)
        return reply(null, 409);
      if (
        spec.source === "admin:getAiConversation" &&
        result &&
        result.conversation?._id !== spec.params.conversationId
      )
        return reply(null, 409);
    }
    if (ids.length) {
      const receipt: ArchiveReceipt = {
        actor: userId,
        kind,
        operation: spec.operation === "read" ? "view" : "export",
        ids,
        nonce: randomUUID(),
        issuedAt: Date.now(),
      };
      const signature = createHmac("sha256", key).update(serializeArchiveReceipt(receipt)).digest("hex");
      await primary.mutation(makeFunctionReference<"mutation">("archiveAccess:record"), {
        ...receipt,
        signature,
      });
    }
    return reply(result);
  } catch {
    return reply({ error: "The earlier record could not be released." }, 503);
  }
}
