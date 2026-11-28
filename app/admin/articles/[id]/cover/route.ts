import { readBoundedJson } from "@/lib/server/request-body";
import { auth } from "@clerk/nextjs/server";
import { ConvexHttpClient } from "convex/browser";
import { revalidateTag } from "next/cache";
import type { Id } from "@/convex/_generated/dataModel";
import { api } from "@/convex/_generated/api";
import { coverJson, pendingCover, readCoverUpload, sameOrigin } from "@/lib/server/article-covers";
type Context = { params: Promise<{ id: string }> };
async function reviewer(id: string) {
  const { getToken, userId, sessionClaims } = await auth();
  if (!userId || !/^[a-z0-9]{16,64}$/.test(id)) return null;
  const token = await getToken(sessionClaims?.aud === "convex" ? {} : { template: "convex" });
  if (!token) return null;
  const client = new ConvexHttpClient(process.env.NEXT_PUBLIC_CONVEX_URL!);
  client.setAuth(token);
  const staff = await client.query(api.users.current, {});
  if (staff?.status !== "active" || !staff.roles.includes("admin")) return null;
  const article = await client.mutation(api.recordAccess.read, { source: "articleAdmin:getArticle", params: { id: id as Id<"articles"> } });
  return article ? { client, article } : null;
}
export async function GET(_: Request, { params }: Context) {
  const { id } = await params;
  if (!(await reviewer(id))) return coverJson(null, 403);
  return coverJson(await pendingCover(id, "read"));
}
export async function POST(request: Request, { params }: Context) {
  if (!sameOrigin(request)) return coverJson(null, 403);
  const { id } = await params,
    access = await reviewer(id);
  if (!access || !["submitted", "published"].includes(access.article.status)) return coverJson(null, 403);
  const { client, article } = access;
  const proposed = await pendingCover(id, "read");
  const usingProposal = request.headers.get("content-type")?.includes("application/json");
  const selection = usingProposal ? await readBoundedJson(request, 2048) : null;
  if (usingProposal && (!proposed || !selection || typeof selection !== "object" ||
      !("version" in selection) || selection.version !== proposed.version))
    return coverJson({ error: "The proposed cover changed. Reload to review it." }, 409);
  const cover = usingProposal ? proposed : await readCoverUpload(request);
  if (!cover)
    return coverJson(
      { error: "Choose a smaller JPG, PNG or WebP image (up to 4 MB) and enter its description." },
      400,
    );
  const bytes = Buffer.from(cover.image, "base64");
  const uploadUrl = await client.mutation(api.media.generateUploadUrl, {});
  const uploaded = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": "image/webp" },
    body: bytes,
  });
  if (!uploaded.ok)
    return coverJson({ error: "The media library could not accept the image. Please retry." }, 502);
  const { storageId } = await uploaded.json();
  await client.mutation(api.media.finalizeUpload, {
    storageId,
    fileName: "article-cover-" + id + ".webp",
    mimeType: "image/webp",
    size: bytes.length,
    alt: cover.alt,
    folder: "student-articles",
  });
  await client.mutation(api.articleAdmin.updateEditorial, {
    id: article._id,
    editorial: {
      category: article.category,
      featured: article.featured,
      seo: article.seo,
      featuredImageId: storageId,
      featuredImageAlt: cover.alt,
    },
  });
  if (proposed) await pendingCover(id, "clear", proposed);
  revalidateTag("public-content", { expire: 0 });
  return coverJson(null);
}
