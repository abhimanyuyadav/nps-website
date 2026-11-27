import type { SiteProfile } from "@/lib/data/public";
import { schoolSearchAliases, schoolSearchDescription, schoolSearchShortName } from "./school-search";

export function schoolStructuredData(site: SiteProfile, siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "School",
    name: site.schoolName,
    alternateName: schoolSearchAliases,
    url: siteUrl,
    logo: new URL(site.logoUrl ?? "/media/nps-logo.png", siteUrl).toString(),
    description: site.description,
    address: {
      "@type": "PostalAddress",
      streetAddress: site.location,
      addressLocality: "Garuda",
      addressRegion: "Rautahat",
      addressCountry: "NP",
    },
    ...(site.phone ? { telephone: site.phone } : {}),
    ...(site.email ? { email: site.email } : {}),
  };
}

export function websiteStructuredData(siteUrl: string) {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: schoolSearchShortName,
    alternateName: schoolSearchAliases,
    url: siteUrl,
    description: schoolSearchDescription,
  };
}
