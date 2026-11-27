import { showsMaintenanceNotice } from "@/lib/content/maintenance-routes";
import { h } from "preact";
import { renderToStringAsync } from "preact-render-to-string";
import { pages } from "school-page-modules";
import { notFound, PublicPageNotFound, renderMissingPage } from "./not-found";
import { DocumentPath } from "../home-document/path";
import { renderDocument } from "../home-document/document";
import type { PageDocumentData } from "./types";

async function renderPage(data: PageDocumentData) {
  const parts = data.pathname.slice(1).split("/");
  const key = Object.keys(pages).find((pattern) => {
    const segments = pattern.slice(1).split("/");
    return segments.length === parts.length && segments.every((s, i) => s.startsWith("[") || s === parts[i]);
  });
  if (!key) notFound();
  const params: Record<string, string> = {};
  key
    .slice(1)
    .split("/")
    .forEach((part, i) => {
      if (part.startsWith("[")) params[part.slice(1, -1)] = parts[i];
    });
  const mod = pages[key];
  const props = { params: Promise.resolve(params), searchParams: Promise.resolve(data.search) };
  const maintenance = showsMaintenanceNotice(data.site.maintenanceMode, data.pathname);
  const [content, meta] = await Promise.all([
    maintenance ? null : mod.default(props),
    mod.generateMetadata ? mod.generateMetadata(props) : (mod.metadata ?? {}),
  ]);
  const body = await renderToStringAsync(h(DocumentPath.Provider, { value: data.pathname }, content));
  const defaultTitle = data.site.seoTitle ?? data.site.schoolName;
  const title =
    meta.title && typeof meta.title === "object" && "absolute" in meta.title
      ? meta.title.absolute
      : (typeof meta.title === "string" ? meta.title : defaultTitle) + " | " + data.site.shortName;
  const description =
    meta.description ??
    data.site.seoDescription ??
    "Official information, academics, admissions, notices, events, and resources from Nepal Police School, Garuda, Rautahat.";
  const ogImages = meta.openGraph?.images;
  const ogImage = Array.isArray(ogImages) ? ogImages[0] : ogImages;
  const imageValue = typeof ogImage === "object" && ogImage && "url" in ogImage ? ogImage.url : ogImage;
  const robots = meta.robots;
  const privatePage = data.pathname.startsWith("/student/");
  const robotsText =
    data.site.noIndex || privatePage
      ? "noindex, nofollow"
      : typeof robots === "string"
        ? robots
        : robots && robots.index === false
          ? "noindex, " + (robots.follow === false ? "nofollow" : "follow")
          : undefined;
  const canonical =
    typeof meta.alternates?.canonical === "string" ? meta.alternates.canonical : data.pathname;
  return renderDocument(
    { ...data, site: { ...data.site, maintenanceMode: maintenance } },
    {
      pathname: data.pathname,
      title,
      description,
      canonical: new URL(canonical, data.origin).href,
      image: imageValue ? String(imageValue) : undefined,
      robots: robotsText,
      body,
    },
  );
}

export async function renderPublicPage(data: PageDocumentData) {
  try {
    return { status: 200, html: await renderPage(data) };
  } catch (error) {
    if (!(error instanceof PublicPageNotFound)) throw error;
    return { status: 404, html: renderMissingPage() };
  }
}
