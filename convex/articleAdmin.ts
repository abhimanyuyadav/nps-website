import { paginationResultValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { legacyEditorialCover } from "../lib/content/student-article-covers";
import { internalMutation, internalQuery, mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  adminArticleSummaryValidator,
  adminArticleValidator,
  studentArticleDraftInputValidator,
} from "./lib/articleValidators";
import {
  cleanArticleDraft,
  toAdminArticleSummary,
  uniqueArticleSlug,
  validateArticleForSubmission,
} from "./lib/articles";
import { api, internal } from "./_generated/api";
import type { Infer } from "convex/values";
import { writeAudit } from "./lib/audit";
import { removePendingArticleCover } from "./lib/pendingArticleCover";
import { requireRole } from "./lib/auth";
import { optionalMediaUrl, plainText, singleLineText } from "./lib/input";
import { recordDeleted, recordStatusChanged } from "./lib/metrics";
import { seoValidator } from "./schema";
import { boundedPaginationOpts, paginationOptsValidator } from "./lib/validators";

const ADMIN_ONLY = ["admin"] as const;
const moderationStatusValidator = v.union(
  v.literal("submitted"),
  v.literal("rejected"),
  v.literal("published"),
  v.literal("archived"),
);

async function requiredAuthor(ctx: QueryCtx | MutationCtx, authorId: Id<"studentProfiles">) {
  const author = await ctx.db.get("studentProfiles", authorId);
  if (!author) {
    throw new ConvexError({ code: "DATA_INTEGRITY", message: "The article author profile is missing." });
  }
  return author;
}

async function fullAdminArticle(ctx: QueryCtx | MutationCtx, article: Doc<"articles">) {
  const author = await requiredAuthor(ctx, article.authorId);
  return {
    ...(await toAdminArticleSummary(ctx, article, author)),
    canManageContent: true as const,
    body: article.body,
    tags: article.tags,
    reviewNote: article.reviewNote,
    seo: article.seo,
  };
}

export const listArticles = internalQuery({
  args: {
    paginationOpts: paginationOptsValidator,
    status: moderationStatusValidator,
  },
  returns: paginationResultValidator(adminArticleSummaryValidator),
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ONLY);
    const page = await ctx.db
      .query("articles")
      .withIndex("by_status_and_updated_at", (q) => q.eq("status", args.status))
      .order("desc")
      .paginate(boundedPaginationOpts(args.paginationOpts));
    return {
      ...page,
      page: await Promise.all(
        page.page.map(async (article) => {
          const author = await requiredAuthor(ctx, article.authorId);
          return await toAdminArticleSummary(ctx, article, author);
        }),
      ),
    };
  },
});

export const getArticle = internalQuery({
  args: { id: v.id("articles") },
  returns: v.union(v.null(), adminArticleValidator),
  handler: async (ctx, args) => {
    await requireRole(ctx, ADMIN_ONLY);
    const article = await ctx.db.get("articles", args.id);
    return article && article.status !== "draft" ? await fullAdminArticle(ctx, article) : null;
  },
});

export const updateEditorial = mutation({
  args: {
    id: v.id("articles"),
    editorial: v.object({
      category: v.string(),
      featuredImageId: v.optional(v.id("_storage")),
      featuredImageAlt: v.optional(v.string()),
      featured: v.boolean(),
      seo: seoValidator,
    }),
  },
  returns: adminArticleValidator,
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ADMIN_ONLY);
    const article = await ctx.db.get("articles", args.id);
    if (!article || article.status === "draft") {
      throw new ConvexError({ code: "NOT_FOUND", message: "Article not found." });
    }

    if (args.editorial.featuredImageId) {
      const asset = await ctx.db
        .query("mediaAssets")
        .withIndex("by_storage_id", (q) => q.eq("storageId", args.editorial.featuredImageId!))
        .unique();
      if (!asset || asset.status !== "ready" || !asset.mimeType.startsWith("image/")) {
        throw new ConvexError({
          code: "INVALID_MEDIA",
          message: "Choose a ready image from the media library.",
        });
      }
      if (!args.editorial.featuredImageAlt?.trim()) {
        throw new ConvexError({
          code: "ALT_TEXT_REQUIRED",
          message: "Alternative text is required for the image.",
        });
      }
    }

    const now = Math.max(Date.now(), article.updatedAt + 1);
    await ctx.db.patch("articles", article._id, {
      category: singleLineText(args.editorial.category, "Category", 1, 80),
      featuredImageId: args.editorial.featuredImageId,
      featuredImageAlt: args.editorial.featuredImageAlt
        ? plainText(args.editorial.featuredImageAlt, "Alternative text", 1, 300)
        : undefined,
      featured: args.editorial.featured,
      seo: {
        title: args.editorial.seo.title
          ? singleLineText(args.editorial.seo.title, "SEO title", 1, 180)
          : undefined,
        description: args.editorial.seo.description
          ? plainText(args.editorial.seo.description, "SEO description", 1, 500)
          : undefined,
        imageUrl: optionalMediaUrl(args.editorial.seo.imageUrl),
        noIndex: args.editorial.seo.noIndex,
      },
      updatedAt: now,
    });
    await writeAudit(ctx, actor, {
      action: "article.editorial_updated",
      entityType: "articles",
      entityId: article._id,
      summary: `Updated editorial presentation for ${article.title}.`,
    });
    return await fullAdminArticle(ctx, (await ctx.db.get("articles", article._id))!);
  },
});

async function editableRecord(ctx: MutationCtx, id: Id<"articles">, expectedUpdatedAt: number) {
  const article = await ctx.db.get("articles", id);
  if (!article || article.status === "draft")
    throw new ConvexError({ code: "NOT_FOUND", message: "Article not found." });
  if (article.updatedAt !== expectedUpdatedAt)
    throw new ConvexError({ code: "STALE", message: "This article changed. Reopen it before continuing." });
  return article;
}

export const editContent = mutation({
  args: { id: v.id("articles"), expectedUpdatedAt: v.number(), content: studentArticleDraftInputValidator },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ADMIN_ONLY);
    const article = await editableRecord(ctx, args.id, args.expectedUpdatedAt);
    const content = cleanArticleDraft(args.content);
    validateArticleForSubmission(content);
    await ctx.db.patch("articles", article._id, {
      ...content,
      updatedAt: Math.max(Date.now(), article.updatedAt + 1),
    });
    await writeAudit(ctx, actor, {
      action: "article.content_edited",
      entityType: "articles",
      entityId: article._id,
      summary: "Edited article: " + content.title,
    });
    return { ok: true };
  },
});

export const remove = mutation({
  args: { id: v.id("articles"), expectedUpdatedAt: v.number() },
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ADMIN_ONLY);
    const article = await editableRecord(ctx, args.id, args.expectedUpdatedAt);
    await removePendingArticleCover(ctx, article._id);
    await ctx.db.delete("articles", article._id);
    await recordDeleted(ctx, "articles", article.status);
    await writeAudit(ctx, actor, {
      action: "article.deleted",
      entityType: "articles",
      entityId: article._id,
      summary: "Deleted article: " + article.title,
    });
    return { ok: true };
  },
});

const reviewedCover = v.object({
  storageId: v.id("_storage"),
  size: v.number(),
  alt: v.string(),
  proposalVersion: v.optional(v.string()),
});

async function registerReviewedCover(ctx: MutationCtx, article: Doc<"articles">, cover: Infer<typeof reviewedCover>) {
  const alt = plainText(cover.alt, "Alternative text", 1, 300);
  if (!Number.isSafeInteger(cover.size) || cover.size <= 0 || cover.size > 600_000)
    throw new ConvexError({ code: "INVALID_COVER", message: "Invalid cover size." });
  // The staged storage ID has no library entry. Make it visible in the publication transaction.
  const storageId = cover.storageId;
  await ctx.runMutation(api.media.finalizeUpload, {
    storageId,
    fileName: "article-cover-" + article._id + ".webp",
    mimeType: "image/webp",
    size: cover.size,
    alt,
    folder: "student-articles",
  });
  if (cover.proposalVersion) {
    await ctx.runMutation(internal.articleCoverDrafts.clear, {
      articleId: article._id, version: cover.proposalVersion, primary: true,
    });
  }
  return { featuredImageId: storageId, featuredImageAlt: alt };
}

export const replacePublishedCover = mutation({
  args: { id: v.id("articles"), expectedUpdatedAt: v.number(), cover: reviewedCover },
  returns: v.null(),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ADMIN_ONLY);
    const article = await editableRecord(ctx, args.id, args.expectedUpdatedAt);
    if (article.status !== "published")
      throw new ConvexError({ code: "STALE", message: "Reopen the article before changing its cover." });
    const fields = await registerReviewedCover(ctx, article, args.cover);
    await ctx.db.patch("articles", article._id, { ...fields, updatedAt: Math.max(Date.now(), article.updatedAt + 1) });
    await writeAudit(ctx, actor, {
      action: "article.editorial_updated", entityType: "articles", entityId: article._id,
      summary: "Updated the published article cover.",
    });
    return null;
  },
});

export const approve = mutation({
  args: { id: v.id("articles"), expectedUpdatedAt: v.number(), cover: v.optional(reviewedCover) },
  returns: v.object({ ok: v.literal(true), status: v.literal("published"), publishedAt: v.number() }),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ADMIN_ONLY);
    const article = await editableRecord(ctx, args.id, args.expectedUpdatedAt);
    if (article.status === "published") {
      throw new ConvexError({
        code: "INVALID_STATE",
        message: "Only reviewed submissions can be published.",
      });
    }
    validateArticleForSubmission(article);
    const author = await requiredAuthor(ctx, article.authorId);
    if (author.status !== "active") {
      throw new ConvexError({
        code: "ACCOUNT_DISABLED",
        message: "This article cannot be published while the student account is suspended.",
      });
    }
    const now = Math.max(Date.now(), article.updatedAt + 1);
    const slug = article.slug ?? (await uniqueArticleSlug(ctx, article.title, article._id));
    const cover = args.cover ? await registerReviewedCover(ctx, article, args.cover) : {};
    await ctx.db.patch("articles", article._id, {
      ...cover,
      slug,
      status: "published",
      authorNameSnapshot: author.name,
      reviewNote: undefined,
      reviewedBy: actor._id,
      reviewedAt: now,
      publishedAt: now,
      updatedAt: now,
    });
    await recordStatusChanged(ctx, "articles", article.status, "published");
    await writeAudit(ctx, actor, {
      action: "article.approved",
      entityType: "articles",
      entityId: article._id,
      summary: `Approved and published ${article.title}.`,
      metadata: { studentProfileId: article.authorId },
    });
    return { ok: true as const, status: "published" as const, publishedAt: now };
  },
});

export const reject = mutation({
  args: { id: v.id("articles"), expectedUpdatedAt: v.number(), note: v.string() },
  returns: v.object({ ok: v.literal(true), status: v.literal("rejected") }),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ADMIN_ONLY);
    const article = await editableRecord(ctx, args.id, args.expectedUpdatedAt);
    if (article.status !== "submitted") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Only submitted articles can be rejected." });
    }
    const note = plainText(args.note, "Review note", 3, 1_000);
    const now = Math.max(Date.now(), article.updatedAt + 1);
    await ctx.db.patch("articles", article._id, {
      status: "rejected",
      reviewNote: note,
      reviewedBy: actor._id,
      reviewedAt: now,
      updatedAt: now,
    });
    await recordStatusChanged(ctx, "articles", "submitted", "rejected");
    await writeAudit(ctx, actor, {
      action: "article.rejected",
      entityType: "articles",
      entityId: article._id,
      summary: `Rejected ${article.title} with feedback for the student.`,
      metadata: { studentProfileId: article.authorId },
    });
    return { ok: true as const, status: "rejected" as const };
  },
});

export const archive = mutation({
  args: { id: v.id("articles"), expectedUpdatedAt: v.number(), note: v.optional(v.string()) },
  returns: v.object({ ok: v.literal(true), status: v.literal("archived") }),
  handler: async (ctx, args) => {
    const actor = await requireRole(ctx, ADMIN_ONLY);
    const article = await editableRecord(ctx, args.id, args.expectedUpdatedAt);
    if (article.status !== "published") {
      throw new ConvexError({ code: "INVALID_STATE", message: "Only published articles can be archived." });
    }
    const note = args.note ? plainText(args.note, "Archive note", 3, 1_000) : undefined;
    const now = Math.max(Date.now(), article.updatedAt + 1);
    await ctx.db.patch("articles", article._id, {
      status: "archived",
      reviewNote: note,
      reviewedBy: actor._id,
      reviewedAt: now,
      updatedAt: now,
    });
    await recordStatusChanged(ctx, "articles", "published", "archived");
    await writeAudit(ctx, actor, {
      action: "article.archived",
      entityType: "articles",
      entityId: article._id,
      summary: `Archived ${article.title}.`,
      metadata: { studentProfileId: article.authorId },
    });
    return { ok: true as const, status: "archived" as const };
  },
});

// Explicit owner migration. The frontend release depends on a successful readback
// for each existing article that used the old editorial fallback.
export const attachLegacyEditorialCover = internalMutation({
  args: { id: v.id("articles"), expectedSlug: v.string(), expectedUpdatedAt: v.number() },
  returns: v.union(v.literal("attached"), v.literal("already-set")),
  handler: async (ctx, args) => {
    const row = await ctx.db.get("articles", args.id);
    const cover = legacyEditorialCover(args.expectedSlug);
    if (!row || row.status !== "published" || row.slug !== args.expectedSlug || !cover)
      throw new ConvexError("Verify the published article and its original address.");
    if (row.featuredImageId || row.editorialCover) return "already-set" as const;
    if (row.updatedAt !== args.expectedUpdatedAt) throw new ConvexError("Recheck the article revision.");
    await ctx.db.patch("articles", row._id, {
      editorialCover: { url: cover.url, alt: cover.alt },
      updatedAt: Math.max(Date.now(), row.updatedAt + 1),
    });
    return "attached" as const;
  },
});
