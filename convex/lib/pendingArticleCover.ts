import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

export async function removePendingArticleCover(ctx: MutationCtx, articleId: Id<"articles">) {
  const cover = await ctx.db
    .query("articleCoverDrafts")
    .withIndex("by_article", (q) => q.eq("articleId", articleId))
    .unique();
  if (cover) await ctx.db.delete("articleCoverDrafts", cover._id);
}
