import { readBoundedJson } from "@/lib/server/request-body";
import { auth } from "@clerk/nextjs/server";
import { ConvexError } from "convex/values";
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
  if (request.headers.get("X-Article-Revision") !== String(article.updatedAt))
    return coverJson({ error: "The article changed. Reopen it before continuing." }, 409);
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
  if (article.status === "submitted" && article.author.status !== "active")
    return coverJson({ error: "The author is suspended. Reopen the article before continuing." }, 409);
  const bytes = Buffer.from(cover.image, "base64");
  const uploadUrl = await client.mutation(api.media.generateUploadUrl, {});
  const uploaded = await fetch(uploadUrl, {
    method: "POST", headers: { "Content-Type": "image/webp" }, body: bytes,
  });
  if (!uploaded.ok)
    return coverJson({ error: "The image could not be staged. Please retry." }, 502);
  const { storageId } = await uploaded.json();
  const change = {
    id: article._id,
    expectedUpdatedAt: article.updatedAt,
    cover: {
      storageId,
      size: bytes.length,
      alt: cover.alt,
      ...(proposed ? { proposalVersion: proposed.version } : {}),
    },
  };
  try {
    if (article.status === "submitted") await client.mutation(api.articleAdmin.approve, change);
    else await client.mutation(api.articleAdmin.replacePublishedCover, change);
  } catch (error) {
    if (error instanceof ConvexError && ["STALE", "NOT_FOUND", "INVALID_STATE"].includes(error.data?.code))
      return coverJson({ error: "The article changed. Reopen it before continuing." }, 409);
    throw error;
  }
  // A workflow deployment may still own a legacy proposal. A failed cleanup must not undo a committed decision.
  if (proposed) {
    try {
      await pendingCover(id, "clear", proposed);
    } catch {
      console.error("Could not clear the reviewed legacy article cover.");
    }
  }
  revalidateTag("public-content", { expire: 0 });
  return coverJson(null);
}
