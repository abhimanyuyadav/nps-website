type ArticleCover = { url: string; alt?: string };

const editorialCovers = new Map<string, ArticleCover>([
  [
    "my-journey-as-a-young-developer",
    {
      url: "/media/article-young-developer.webp",
      alt: "A laptop displaying code beside a notebook on a wooden desk",
    },
  ],
  [
    "a-day-of-learning-and-teamwork-43963",
    {
      url: "/media/facility-classrooms.webp",
      alt: "Rows of desks facing a whiteboard in a sunlit classroom",
    },
  ],
]);

export function studentArticleCover(slug?: string, uploadedUrl?: string, uploadedAlt?: string) {
  if (uploadedUrl) return { url: uploadedUrl, alt: uploadedAlt };
  return slug ? editorialCovers.get(slug) : undefined;
}
