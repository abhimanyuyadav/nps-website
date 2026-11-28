import { ConvexError, v } from "convex/values";
import { internalQuery, internalMutation, type MutationCtx } from "./_generated/server";
import { requireStudentProfile } from "./lib/studentAuth";

async function editableArticle(ctx: MutationCtx, articleId: string) {
  const author = await requireStudentProfile(ctx);
  const id = ctx.db.normalizeId("articles", articleId);
  const article = id && await ctx.db.get("articles", id);
  if (!article || article.authorId !== author._id || !["draft", "rejected"].includes(article.status))
    throw new ConvexError("Only the author of an existing editable article can change its pending cover.");
  return article;
}

export const read = internalQuery({
  args: { articleId: v.string(), checkPrimary: v.optional(v.boolean()) },
  handler: async (ctx, { articleId, checkPrimary }) => {
    const id = checkPrimary ? ctx.db.normalizeId("articles", articleId) : null;
    const article = id ? await ctx.db.get("articles", id) : null;
    if (checkPrimary && !article) return null;
    const row = await ctx.db
      .query("articleCoverDrafts")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .unique();
    if (row) return { image: row.image, alt: row.alt, version: row.version };
    return checkPrimary && !article?.primaryCoverManaged ? ("legacy" as const) : null;
  },
});
export const write = internalMutation({
  args: {
    articleId: v.string(),
    image: v.string(),
    alt: v.string(),
    version: v.string(),
  },
  handler: async (ctx, data) => {
    const article = await editableArticle(ctx, data.articleId);
    await ctx.db.patch("articles", article._id, { primaryCoverManaged: true });
    const old = await ctx.db
      .query("articleCoverDrafts")
      .withIndex("by_article", (q) => q.eq("articleId", data.articleId))
      .unique();
    if (old) await ctx.db.replace("articleCoverDrafts", old._id, data);
    else await ctx.db.insert("articleCoverDrafts", data);
  },
});
export const clear = internalMutation({
  args: {
    articleId: v.string(), version: v.string(),
    primary: v.optional(v.boolean()), authorOnly: v.optional(v.boolean()),
  },
  handler: async (ctx, { articleId, version, primary, authorOnly }) => {
    if (authorOnly) await editableArticle(ctx, articleId);
    const old = await ctx.db
      .query("articleCoverDrafts")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .unique();
    if (!old || old.version !== version) return;
    await ctx.db.delete("articleCoverDrafts", old._id);
    if (primary) {
      const id = ctx.db.normalizeId("articles", articleId);
      if (id && await ctx.db.get("articles", id))
        await ctx.db.patch("articles", id, { primaryCoverManaged: true });
    }
  },
});
