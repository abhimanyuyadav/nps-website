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
async function boundedJson(request: Request) {
  const reader = request.body?.getReader();
  if (!reader) return null;
  let size = 0;
  let text = "";
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) return JSON.parse(text + decoder.decode());
      size += value.byteLength;
      if (size > 24576) {
        await reader.cancel();
        return null;
      }
      text += decoder.decode(value, { stream: true });
    }
  } catch {
    return null;
  } finally {
    reader.releaseLock();
  }
}
export async function POST(request: Request) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return reply(null, 403);
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json")
    return reply(null, 415);
  const { userId, getToken, sessionClaims } = await auth();
  if (!userId) return reply(null, 401);
  const parsed = selection.safeParse(await boundedJson(request));
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
    if (spec.operation === "export") {
      const rows = [];
      // Bound concurrent work on the historical backend, preserving requested CSV order.
      for (let offset = 0; offset < spec.ids.length; offset += 8) {
        const batch = await Promise.all(
          spec.ids
            .slice(offset, offset + 8)
            .map((recordId) =>
              archive.query(makeFunctionReference<"query">("admin:getSubmission"), {
                type: kind,
                id: recordId,
              }),
            ),
        );
        if (batch.some((row) => !row)) return reply(null, 409);
        rows.push(...batch);
      }
      result = rows;
      ids = rows.map((row) => row._id);
    } else {
      result = await archive.query(makeFunctionReference<"query">(spec.source), spec.params);
      const rows = result?.page ?? (result ? [result.conversation ?? result] : []);
      ids = rows.map((row: { _id: string }) => row._id);
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
