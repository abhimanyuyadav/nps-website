import { Suspense } from "react";
import { AboutSection } from "@/components/home/about-section";
import { AlumniSection } from "@/components/home/alumni-section";
import { EcaActivities } from "@/components/home/eca-activities";
import { GalleryPreview } from "@/components/home/gallery-preview";
import { HomeHero } from "./home-hero";
import { ManagementMessage } from "@/components/home/management-message";
import { NewsEvents } from "@/components/home/news-events";
import type { PublicHome } from "@/lib/data/home";

export function HomeContent({
  site,
  sections,
  publishedSlides,
  aboutPillars,
  ecaCards,
  news,
  notices,
  events,
  leaders,
  testimonials,
  albums,
}: PublicHome) {
  return (
    <>
      <HomeHero
        slides={publishedSlides}
        hero={sections.hero}
        site={{ schoolName: site.schoolName, description: site.description, location: site.location }}
      />

      <div className="home-deferred-section">
        <Suspense fallback={null}>
          <AboutSection site={site} section={sections.about} pillars={aboutPillars} />
        </Suspense>
      </div>
      <div className="home-deferred-section">
        <Suspense fallback={null}>
          <ManagementMessage leaders={leaders} section={sections.management} />
        </Suspense>
      </div>
      <div className="home-deferred-section">
        <Suspense fallback={null}>
          <NewsEvents news={news} events={events} notices={notices} section={sections.news} />
        </Suspense>
      </div>
      <div className="home-deferred-section">
        <Suspense fallback={null}>
          <EcaActivities section={sections.eca} cards={ecaCards} />
        </Suspense>
      </div>
      <div className="home-deferred-section">
        <Suspense fallback={null}>
          <GalleryPreview albums={albums} section={sections.gallery} />
        </Suspense>
      </div>
      <div className="home-deferred-section">
        <Suspense fallback={null}>
          <AlumniSection testimonials={testimonials} section={sections.alumni} />
        </Suspense>
      </div>
    </>
  );
}
