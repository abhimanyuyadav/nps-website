/* eslint-disable @next/next/no-head-element -- This route handler renders a complete HTML document. */
import "./safe-urls";
import { renderToString } from "preact-render-to-string";
import { HomeContent } from "@/components/home/home-content";
import { FooterContent } from "@/components/site/footer-content";
import { MaintenanceNotice } from "@/components/site/maintenance-notice";
import { SiteHeader } from "@/components/site/site-header";
import { AssistantLauncher } from "@/components/assistant/assistant-launcher";
import { schoolStructuredData, websiteStructuredData } from "@/lib/content/school-structured-data";
import {
  schoolSearchAliases,
  schoolSearchDescription,
  schoolSearchName,
  schoolSearchShortName,
} from "@/lib/content/school-search";
import { serializeJsonLd } from "@/lib/security/json-ld";
import { getImageProps } from "next/image";
import type { HomeDocumentData } from "./types";
import { createElement as h } from "preact";
import { DocumentPath } from "./path";
import type { DocumentShell, DocumentPage } from "../public-document/types";
declare const PAGE_ASSETS: Record<string, string>;
declare const HOME_ASSETS: { css: string; script: string; font: string };

export function renderHomeDocument(data: HomeDocumentData) {
  return renderDocument({ ...data, site: data.home.site }, undefined, data.home);
}

export function renderDocument(
  { site, header, utility, footer, newsletterAvailable, origin }: DocumentShell,
  page?: DocumentPage,
  home?: HomeDocumentData["home"],
) {
  const title = page?.title ?? schoolSearchName + " | " + schoolSearchShortName;
  const description = page?.description ?? schoolSearchDescription;
  const canonical = page?.canonical ?? new URL("/", origin).href;
  const image = new URL(page?.image ?? site.seoImageUrl ?? "/og.png", origin).href;
  const firstSlide = !site.maintenanceMode && home?.publishedSlides[0];
  const robots = page?.robots ?? (site.noIndex ? "noindex, nofollow" : undefined);
  const heroImage =
    firstSlide &&
    getImageProps({ src: firstSlide.src, alt: "", fill: true, quality: 65, sizes: "100vw" }).props;
  return (
    "<!doctype html>" +
    renderToString(
      h(
        DocumentPath.Provider,
        { value: page?.pathname ?? "/" },
        <html
          lang="en"
          className={page ? "school-home-document school-inner-document" : "school-home-document"}
        >
          <head>
            <meta charSet="utf-8" />
            <meta name="viewport" content="width=device-width, initial-scale=1" />
            <title>{title}</title>
            <meta name="description" content={description} />
            <meta name="application-name" content={schoolSearchShortName} />
            <meta name="theme-color" content="#1e1f5c" />
            <meta name="color-scheme" content="light" />
            <meta name="category" content="education" />
            <meta
              name="keywords"
              content={[...schoolSearchAliases, "school in Rautahat", "Nepal education"].join(", ")}
            />
            <link rel="canonical" href={canonical} />
            {robots && <meta name="robots" content={robots} />}
            <link rel="icon" href={site.faviconUrl ?? site.logoUrl ?? "/media/nps-logo.png"} />
            <link rel="apple-touch-icon" href={site.logoUrl ?? "/media/nps-logo.png"} />
            <meta property="og:type" content="website" />
            <meta property="og:locale" content="en_NP" />
            <meta property="og:site_name" content={schoolSearchShortName} />
            <meta property="og:url" content={canonical} />
            <meta property="og:title" content={title} />
            <meta property="og:description" content={description} />
            <meta property="og:image" content={image} />
            <meta name="twitter:card" content="summary_large_image" />
            <meta name="twitter:title" content={title} />
            <meta name="twitter:description" content={description} />
            <meta name="twitter:image" content={image} />
            {heroImage && (
              <link
                rel="preload"
                as="image"
                imageSrcSet={heroImage.srcSet}
                imageSizes="100vw"
                fetchPriority="high"
              />
            )}
            <link rel="preload" as="font" type="font/woff2" href={HOME_ASSETS.font} crossOrigin="anonymous" />
            <link rel="stylesheet" href={HOME_ASSETS.css} />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: serializeJsonLd(schoolStructuredData(site, origin)) }}
            />
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: serializeJsonLd(websiteStructuredData(origin)) }}
            />
          </head>
          <body>
            <a className="skip-link" href="#main-content">
              Skip to main content
            </a>
            {site.maintenanceMode ? (
              <MaintenanceNotice site={site} />
            ) : (
              <div className="min-h-screen min-w-0 bg-white [overflow-wrap:anywhere] text-[#2f3169]">
                <SiteHeader
                  schoolName={site.schoolName}
                  location={site.location}
                  tagline={site.tagline}
                  logoUrl={site.logoUrl}
                  phone={site.phone}
                  email={site.email}
                  admissionsOpen={site.admissionsOpen}
                  navigationItems={header}
                  utilityNavigationItems={utility}
                />
                {page ? (
                  <main
                    id="main-content"
                    className="min-w-0"
                    dangerouslySetInnerHTML={{ __html: page.body }}
                  />
                ) : (
                  <main id="main-content" className="min-w-0">
                    {home && <HomeContent {...home} />}
                  </main>
                )}
                <FooterContent
                  site={site}
                  navigationItems={footer}
                  subscriptionsAvailable={newsletterAvailable}
                />
                {site.assistantEnabled && page?.pathname !== "/assistant" && <AssistantLauncher />}
                <script type="module" defer src={HOME_ASSETS.script} />
                {page &&
                  Object.entries(PAGE_ASSETS)
                    .filter(([name]) => page.body.includes('data-school-control="' + name + '"'))
                    .map(([name, src]) => <script key={name} type="module" defer src={src} />)}
              </div>
            )}
          </body>
        </html>,
      ),
    )
  );
}
