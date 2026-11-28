import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { fetchStudentAuthQuery, getStudentAuthToken } from "@/lib/auth/student-server";
import { coverJson, pendingCover, readCoverUpload, sameOrigin } from "@/lib/server/article-covers";
type Context = { params: Promise<{ id: string }> };
async function ownArticle(id: string) {
  const token = await getStudentAuthToken();
  if (!token || !/^[a-z0-9]{16,64}$/.test(id)) return null;
  const article = await fetchStudentAuthQuery(api.articles.getMine, { articleId: id as Id<"articles"> });
  return article ? { article, token } : null;
}
export async function GET(_: Request, { params }: Context) {
  const { id } = await params;
  if (!(await ownArticle(id))) return coverJson({ error: "Sign in as the article author." }, 403);
  return coverJson(await pendingCover(id, "read"));
}
export async function POST(request: Request, { params }: Context) {
  if (!sameOrigin(request)) return coverJson({ error: "Invalid request origin." }, 403);
  const { id } = await params,
    access = await ownArticle(id);
  if (!access || !["draft", "rejected"].includes(access.article.status))
    return coverJson({ error: "Only the author can change an editable draft." }, 403);
  const cover = await readCoverUpload(request);
  if (!cover)
    return coverJson(
      { error: "Choose a smaller JPG, PNG or WebP image (up to 4 MB) and enter its description." },
      400,
    );
  await pendingCover(id, "write", cover, access.token);
  return coverJson(cover);
}
export async function DELETE(request: Request, { params }: Context) {
  if (!sameOrigin(request)) return coverJson(null, 403);
  const { id } = await params,
    access = await ownArticle(id);
  if (!access || !["draft", "rejected"].includes(access.article.status)) return coverJson(null, 403);
  const current = await pendingCover(id, "read");
  if (current) await pendingCover(id, "clear", current, access.token);
  return coverJson(null);
}
