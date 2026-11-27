import { MaintenanceNotice } from "@/components/site/maintenance-notice";
import type { Metadata } from "next";
import { AssistantAvailability } from "@/components/assistant/assistant-availability";
import { MaintenanceGate } from "@/components/site/maintenance-gate";
import { SiteFooter } from "@/components/site/site-footer";
import { SiteHeader } from "@/components/site/site-header";
import { getNavigation, getSiteProfile } from "@/lib/data/public";
import { schoolSearchShortName } from "@/lib/content/school-search";

export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const site = await getSiteProfile();
  const socialImage = site.seoImageUrl ?? "/og.png";
  return {
    title: { default: site.seoTitle ?? site.schoolName, template: `%s | ${site.shortName}` },
    description:
      site.seoDescription ??
      "Official information, academics, admissions, notices, events, and resources from Nepal Police School, Garuda, Rautahat.",
    openGraph: {
      type: "website",
      siteName: schoolSearchShortName,
      images: [{ url: socialImage, alt: site.schoolName }],
    },
    twitter: { card: "summary_large_image", images: [socialImage] },
  };
}

export default async function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const [site, headerNavigation, footerNavigation, utilityNavigation] = await Promise.all([
    getSiteProfile(),
    getNavigation("header"),
    getNavigation("footer"),
    getNavigation("utility"),
  ]);

  return (
    <MaintenanceGate enabled={site.maintenanceMode} fallback={<MaintenanceNotice site={site} />}>
      <div className="min-h-screen min-w-0 bg-white [overflow-wrap:anywhere] text-[#2f3169]">
        <SiteHeader
          schoolName={site.schoolName}
          location={site.location}
          tagline={site.tagline}
          logoUrl={site.logoUrl}
          phone={site.phone}
          email={site.email}
          admissionsOpen={site.admissionsOpen}
          navigationItems={headerNavigation}
          utilityNavigationItems={utilityNavigation}
        />
        <main id="main-content" className="min-w-0">
          {children}
        </main>
        <SiteFooter site={site} navigationItems={footerNavigation} />
        <AssistantAvailability initialEnabled={site.assistantEnabled} />
      </div>
    </MaintenanceGate>
  );
}
