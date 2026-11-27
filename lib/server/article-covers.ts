import "server-only";
import { createHash } from "node:crypto";
import { fetchAction } from "convex/nextjs";
import sharp from "sharp";
import { api } from "@/convex/_generated/api";
import { getPublicFormConfiguration } from "./form-configuration";
import { signPublicFormPayload } from "./public-forms";

export type DraftCover = { image: string; alt: string; version: string };
export const coverJson = (data: unknown, status = 200) =>
  Response.json(data, { status, headers: { "Cache-Control": "private, no-store" } });
export function sameOrigin(request: Request) {
  return request.headers.get("origin") === new URL(request.url).origin;
}
export async function pendingCover(articleId: string, op: "read" | "write" | "clear", cover?: DraftCover) {
  const config = getPublicFormConfiguration();
  if (!config) throw new Error("Cover storage is unavailable.");
  const sameDatabase =
    config.convexUrl.replace(/\/+$/, "") === process.env.NEXT_PUBLIC_CONVEX_URL?.replace(/\/+$/, "");
  const input = {
    articleId,
    op: op === "write" && sameDatabase ? ("writeLocal" as const) : op,
    version: cover?.version ?? "",
    image: op === "write" ? cover!.image : "",
    alt: op === "write" ? cover!.alt : "",
  };
  return fetchAction(
    api.formActions.articleCover,
    { ...input, ...signPublicFormPayload(config.formServiceSecret, { form: "article-cover", ...input }) },
    { url: config.convexUrl },
  );
}
export async function readCoverUpload(request: Request): Promise<DraftCover | null> {
  if (Number(request.headers.get("content-length")) > 4_200_000) return null;
  try {
    const form = await request.formData();
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
