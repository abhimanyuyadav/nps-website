import type { NextRequest } from "next/server";
import { getNavigation, getSiteProfile } from "@/lib/data/public";
import { getSiteUrl } from "@/lib/server/site-url";
import { hasPublicFormConfiguration } from "@/lib/server/form-configuration";
import { renderPublicPage } from "@/lib/home-document/generated/public.mjs";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, context: RouteContext<"/school-pages/[...parts]">) {
  const { parts } = await context.params;
  const pathname = "/" + parts.join("/");
  const search: Record<string, string | string[]> = Object.create(null);
  const params = request.nextUrl.searchParams;
  for (const key of new Set(params.keys())) {
    const values = params.getAll(key);
    search[key] = values.length === 1 ? values[0] : values;
  }
  const [site, header, utility, footer] = await Promise.all([
    getSiteProfile(),
    getNavigation("header"),
    getNavigation("utility"),
    getNavigation("footer"),
  ]);
  const html = await renderPublicPage({
    pathname,
    search,
    site,
    header,
    utility,
    footer,
    origin: getSiteUrl(),
    newsletterAvailable: hasPublicFormConfiguration(),
  });
  const headers = new Headers({
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "private, no-store",
    Vary: "RSC, Accept",
  });
  // Only anonymous, query-free editorial documents can share an edge copy. Forms, account
  // pages, searches and token links always reflect the request and the latest available data.
  if (
    !params.size &&
    !/^\/(?:student|forms|search|newsletter|articles)(?:\/|$)/.test(pathname) &&
    !["/events/cancel", "/admissions/submitted"].includes(pathname)
  ) {
    headers.set("Cache-Control", "public, max-age=0, must-revalidate");
    headers.set("Vercel-CDN-Cache-Control", "public, s-maxage=60, stale-while-revalidate=60");
  }
  return new Response(html, { headers });
}
