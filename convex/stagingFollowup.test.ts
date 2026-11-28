import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import type { PaginationResult } from "convex/server";
import type { DiscoveryRoute, SearchEntry } from "../lib/content/discovery";
import { api, internal } from "./_generated/api";
import schema from "./schema";
import { modules } from "./test.setup";

it("returns every eligible URL across page boundaries and never returns private article content", async () => {
  const t = convexTest(schema, modules);
  await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkUserId: "stage",
      email: "staff@example.test",
      name: "Fixture",
      roles: ["admin"],
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const common = {
      status: "published" as const,
      createdBy: owner,
      updatedBy: owner,
      createdAt: 1,
      updatedAt: 1,
      featured: false,
      order: 0,
      seo: {},
    };
    for (let i = 0; i < 205; i++)
      await ctx.db.insert("pages", {
        ...common,
        slug: "item-" + i,
        title: "Fixture",
        body: "Full page text",
        seo: { noIndex: i === 4 },
      });
    await ctx.db.insert("pages", {
      ...common,
      slug: "draft",
      title: "Fixture",
      body: "Draft",
      status: "draft",
    });
    await ctx.db.insert("notices", {
      status: "published",
      createdBy: owner,
      updatedBy: owner,
      createdAt: 1,
      updatedAt: 1,
      seo: {},
      title: "Later",
      slug: "later",
      body: "Later",
      audiences: [],
      priority: "normal",
      startAt: 9,
    });
  });
  const slugs: string[] = [];
  let cursor: string | null = null;
  do {
    const page: PaginationResult<DiscoveryRoute> = await t.query(api.content.listDiscoveryRoutes, {
      collection: "pages",
      paginationOpts: { cursor, numItems: 100 },
    });
    for (const row of page.page) {
      expect(Object.keys(row).sort()).toEqual(["lastModified", "noIndex", "slug"]);
      if (!row.noIndex) slugs.push(row.slug);
    }
    cursor = page.isDone ? null : page.continueCursor;
  } while (cursor);
  let searchCursor: string | null = null;
  const found: string[] = [];
  do {
    const page: PaginationResult<SearchEntry> = await t.query(api.content.listSearchEntries, {
      collection: "pages",
      paginationOpts: { numItems: 100, cursor: searchCursor },
    });
    found.push(...page.page.map((x) => x.href));
    searchCursor = page.isDone ? null : page.continueCursor;
  } while (searchCursor);
  expect(found).toHaveLength(205);
  expect(found).toContain("/item-204");
  expect(found).not.toContain("/draft");
  expect(
    (
      await t.query(api.content.listSearchEntries, {
        collection: "notices",
        paginationOpts: { numItems: 100, cursor: null },
      })
    ).page,
  ).toEqual([]);
  expect(new Set(slugs).size).toBe(204);
  expect(slugs).toContain("item-204");
  expect(slugs).not.toContain("draft");
  expect(
    (
      await t.query(api.content.listDiscoveryRoutes, {
        collection: "notices",
        paginationOpts: { cursor: null, numItems: 10 },
      })
    ).page,
  ).toEqual([]);
});

it("counts stored files without listing, publishing or deleting unregistered bytes", async () => {
  const t = convexTest(schema, modules);
  const blob = new Blob(["test"], { type: "image/png" });
  const [known, unregistered] = await t.run(async (ctx) => {
    const owner = await ctx.db.insert("users", {
      clerkUserId: "media",
      email: "media@example.test",
      name: "Fixture",
      roles: ["admin"],
      status: "active",
      createdAt: 1,
      updatedAt: 1,
    });
    const known = await ctx.storage.store(blob),
      unknown = await ctx.storage.store(new Blob(["draft"]));
    await ctx.db.insert("mediaAssets", {
      storageId: known,
      fileName: "fixture.png",
      mimeType: "image/png",
      size: 4,
      status: "ready",
      uploadedBy: owner,
      createdAt: 1,
      updatedAt: 1,
    });
    return [known, unknown];
  });
  const result = await t.query(internal.media.inventoryStoragePage, {
    paginationOpts: { numItems: 10, cursor: null },
  });
  expect(result).toMatchObject({ total: 2, registered: 1, unregistered: 1, isDone: true });
  expect(JSON.stringify(result)).not.toContain(unregistered);
  expect(await t.run(async (ctx) => (await ctx.storage.get(known))?.size)).toBe(4);
  expect(await t.run(async (ctx) => (await ctx.storage.get(unregistered))?.size)).toBe(5);
});
