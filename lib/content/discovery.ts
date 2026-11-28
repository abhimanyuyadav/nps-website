export const discoveryPrefixes = {
  pages: "",
  departments: "/departments",
  teachers: "/teachers",
  leadership: "/about/leadership",
  news: "/news",
  notices: "/notices",
  events: "/events",
  galleryAlbums: "/campus-life/gallery",
} as const;

export type DiscoveryCollection = keyof typeof discoveryPrefixes;
export type DiscoveryRoute = { slug: string; noIndex: boolean; lastModified?: number };

export const searchCollections = [
  "navigationItems",
  "pages",
  "programs",
  "departments",
  "facilities",
  "news",
  "notices",
  "events",
  "articles",
  "teachers",
  "faqs",
] as const;
export type SearchCollection = (typeof searchCollections)[number];
export type SearchEntry = { title: string; description: string; href: string; type: string };
