import { canonicalPublicHref } from "@/lib/content/canonical-public-href";
import type { MetadataRoute } from "next";
import { discoveryPrefixes, type DiscoveryCollection } from "@/lib/content/discovery";
import { getDiscoveryRoutes, getSiteProfile, getStudentArticlePage } from "@/lib/data/public";
import { getSiteUrl } from "@/lib/server/site-url";

export const revalidate = 3600;

const routes = [
  "",
  "/about",
  "/about/leadership",
  "/about/testimonials",
  "/academics",
  "/departments",
  "/facilities",
  "/campus-life",
  "/campus-life/activities",
  "/campus-life/gallery",
  "/admissions",
  "/admissions/process",
  "/admissions/eligibility",
  "/admissions/fees-scholarships",
  "/admissions/faq",
  "/admissions/apply",
  "/news",
  "/articles",
  "/notices",
  "/events",
  "/downloads",
  "/assistant",
  "/contact",
  "/forms",
  "/privacy",
  "/terms",
  "/accessibility",
];

// These routes have their own private, noindex, redirect, or metadata handlers.
// A CMS slug with the same name cannot create an indexable public page there.
function isDiscoverableCmsPage(slug: string) {
  return !(
    canonicalPublicHref(`/${slug}`) !== `/${slug}` ||
    /^(admin|api|sign-in|student|search|newsletter)(\/|$)/.test(slug) ||
    ["admissions/submitted", "events/cancel", "robots.txt", "sitemap.xml"].includes(slug)
  );
}

async function publishedArticleRoutes() {
  const entries: { route: string; lastModified?: string }[] = [];
  if (!process.env.NEXT_PUBLIC_CONVEX_URL) return entries;
  let cursor: string | null = null;
  do {
    const page = await getStudentArticlePage(100, cursor);
    for (const article of page.articles) {
      if (!article.seo?.noIndex) {
        entries.push({
          route: `/articles/${article.slug}`,
          lastModified: article.updatedAt ?? article.publishedAt,
        });
      }
    }
    cursor = page.nextCursor;
  } while (cursor);
  return entries;
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const siteUrl = getSiteUrl();
  const site = await getSiteProfile();
  if (site.noIndex) return [];
  const collections = Object.keys(discoveryPrefixes) as DiscoveryCollection[];
  const [groups, articles] = await Promise.all([
    Promise.all(
      collections.map(async (collection) => ({
        collection,
        rows: await getDiscoveryRoutes(collection),
      })),
    ),
    publishedArticleRoutes(),
  ]);
  const noIndexPages = new Set(
    groups
      .find((group) => group.collection === "pages")
      ?.rows.filter((row) => row.noIndex)
      .map((row) => "/" + row.slug),
  );
  const staticEntries: MetadataRoute.Sitemap = routes
    .filter((route) => !noIndexPages.has(route))
    .map((route) => ({
      url: new URL(route || "/", siteUrl).toString(),
      changeFrequency:
        route === "" || route === "/notices" || route === "/news" || route === "/articles"
          ? "daily"
          : "monthly",
      priority: route === "" ? 1 : route.startsWith("/admissions") ? 0.8 : 0.7,
    }));
  const dynamicRouteCandidates: Array<{ route: string; lastModified?: string }> = [
    ...groups.flatMap(({ collection, rows }) =>
      rows
        .filter((row) => !row.noIndex && (collection !== "pages" || isDiscoverableCmsPage(row.slug)))
        .map((row) => ({
          route: discoveryPrefixes[collection] + "/" + row.slug,
          lastModified: row.lastModified !== undefined ? new Date(row.lastModified).toISOString() : undefined,
        })),
    ),
    ...articles,
  ];
  const dynamicRoutes = [
    ...new Map(
      dynamicRouteCandidates
        .filter(({ route }) => !routes.includes(route))
        .map((entry) => [entry.route, entry]),
    ).values(),
  ];

  return [
    ...staticEntries,
    ...dynamicRoutes.map(({ route, lastModified }) => ({
      url: new URL(route, siteUrl).toString(),
      ...(lastModified ? { lastModified } : {}),
      changeFrequency: "weekly" as const,
      priority: 0.65,
    })),
  ];
}
