import { ConvexError, v } from "convex/values";
import { internalQuery, internalMutation } from "./_generated/server";
export const read = internalQuery({
  args: { articleId: v.string() },
  handler: async (ctx, { articleId }) => {
    const row = await ctx.db
      .query("articleCoverDrafts")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .unique();
    return row ? { image: row.image, alt: row.alt, version: row.version } : null;
  },
});
export const write = internalMutation({
  args: {
    articleId: v.string(),
    image: v.string(),
    alt: v.string(),
    version: v.string(),
    verifyArticle: v.optional(v.boolean()),
  },
  handler: async (ctx, { verifyArticle, ...data }) => {
    if (verifyArticle) {
      const id = ctx.db.normalizeId("articles", data.articleId);
      const article = id && (await ctx.db.get("articles", id));
      if (!article || (article.status !== "draft" && article.status !== "rejected"))
        throw new ConvexError("Only an existing editable article can receive a pending cover.");
    }
    const old = await ctx.db
      .query("articleCoverDrafts")
      .withIndex("by_article", (q) => q.eq("articleId", data.articleId))
      .unique();
    if (old) await ctx.db.replace("articleCoverDrafts", old._id, data);
    else await ctx.db.insert("articleCoverDrafts", data);
  },
});
export const clear = internalMutation({
  args: { articleId: v.string(), version: v.string() },
  handler: async (ctx, { articleId, version }) => {
    const old = await ctx.db
      .query("articleCoverDrafts")
      .withIndex("by_article", (q) => q.eq("articleId", articleId))
      .unique();
    if (old && old.version === version) await ctx.db.delete("articleCoverDrafts", old._id);
  },
});
