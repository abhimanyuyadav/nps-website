import "server-only";
import { createHash } from "node:crypto";
import { fetchAction } from "convex/nextjs";
import sharp from "sharp";
import { readBoundedBody } from "./request-body";
import { api } from "@/convex/_generated/api";
import { getPublicFormConfiguration } from "./form-configuration";
import { signPublicFormPayload } from "./public-forms";

export type DraftCover = { image: string; alt: string; version: string };
export const coverJson = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export async function pendingCover(
  articleId: string,
  op: "read" | "write" | "clear",
  cover?: DraftCover,
  studentToken?: string,
): Promise<DraftCover | null> {
  const config = getPublicFormConfiguration();
  const primary = process.env.NEXT_PUBLIC_CONVEX_URL;
  if (!config || !primary) throw new Error("Cover storage is unavailable.");
  const { formServiceSecret } = config;
  const split = new URL(primary).href !== new URL(config.convexUrl).href;
  async function callStore(url: string, operation: "read" | "readPrimary" | "writeLocal" | "clear" | "clearLocal" | "clearOwn") {
    const input = {
      articleId,
      op: operation,
      version: cover?.version ?? "",
      image: operation === "writeLocal" ? cover!.image : "",
      alt: operation === "writeLocal" ? cover!.alt : "",
    };
    return fetchAction(
      api.formActions.articleCover,
      { ...input, ...signPublicFormPayload(formServiceSecret, { form: "article-cover", ...input }) },
      { url, ...(url === primary && studentToken ? { token: studentToken } : {}) },
    );
  }
  if (op === "write") {
    if (!cover || !studentToken) throw new Error("Signed-in article author required.");
    await callStore(primary, "writeLocal");
    return null;
  }
  const local = await callStore(primary, split ? "readPrimary" : "read");
  if (op === "clear") {
    if (local === "legacy") await callStore(config.convexUrl, "clear");
    else if (local && local.version === cover?.version)
      await callStore(primary, studentToken ? "clearOwn" : split ? "clearLocal" : "clear");
    return null;
  }
  if (local !== "legacy") return local;
  const legacy = await callStore(config.convexUrl, "read");
  return legacy === "legacy" ? null : legacy;
}
export async function readCoverUpload(request: Request): Promise<DraftCover | null> {
  try {
    const body = await readBoundedBody(request, 4_200_000);
    if (!body) return null;
    const form = await new Response(body, {
      headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    }).formData();
    const file = form.get("image"),
      alt = form.get("alt");
    if (
      !(file instanceof File) ||
      file.size > 4_000_000 ||
      !file.size ||
      typeof alt !== "string" ||
      !alt.trim() ||
      alt.trim().length > 300
    )
      return null;
    const source = sharp(Buffer.from(await file.arrayBuffer()), {
      limitInputPixels: 40_000_000,
      failOn: "error",
    });
    const { format } = await source.metadata();
    if (!["jpeg", "png", "webp"].includes(format)) return null;
    const bytes = await source
      .rotate()
      .resize({ width: 1600, height: 1200, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
    if (bytes.length > 600_000) return null;
    return {
      image: bytes.toString("base64"),
      alt: alt.trim(),
      version: createHash("sha256").update(bytes).update(alt.trim()).digest("hex"),
    };
  } catch {
    return null;
  }
}
