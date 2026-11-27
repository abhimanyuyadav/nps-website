import {
  getEvents,
  getGalleryAlbums,
  getHomeHighlights,
  getHomeSections,
  getLeadership,
  getNews,
  getNotices,
  getSiteProfile,
  getTestimonials,
} from "@/lib/data/public";

export async function getPublicHome() {
  const [
    site,
    sections,
    heroCards,
    aboutPillars,
    ecaCards,
    featuredNews,
    latestNews,
    notices,
    events,
    leaders,
    testimonials,
    albums,
  ] = await Promise.all([
    getSiteProfile(),
    getHomeSections(),
    getHomeHighlights("hero"),
    getHomeHighlights("about"),
    getHomeHighlights("eca"),
    getNews(3, true),
    getNews(6),
    getNotices(3),
    getEvents("upcoming", 3),
    getLeadership(),
    getTestimonials(8),
    getGalleryAlbums(),
  ]);

  const news = [
    ...featuredNews,
    ...latestNews.filter((item) => !featuredNews.some((featured) => featured.id === item.id)),
  ].slice(0, 3);

  const publishedSlides = heroCards.flatMap((card) =>
    card.imageUrl
      ? [{ src: card.imageUrl, alt: card.imageAlt ?? card.title, caption: card.summary ?? card.title }]
      : [],
  );
  return {
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
  };
}

export type PublicHome = Awaited<ReturnType<typeof getPublicHome>>;
