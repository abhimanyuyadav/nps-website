import {
  getCmsPages,
  getDepartments,
  getEvents,
  getFacilities,
  getGalleryAlbums,
  getLeadership,
  getNews,
  getNotices,
  getPrograms,
  getStudentArticlePage,
  getTeachers,
} from "@/lib/data/public";
import { listOpenForms } from "@/lib/server/school-forms";

type Page = { title: string; href: string };

async function articlePages() {
  const pages: Page[] = [];
  let cursor: string | null = null;
  do {
    const batch = await getStudentArticlePage(100, cursor);
    pages.push(
      ...batch.articles.map((article) => ({ title: article.title, href: "/articles/" + article.slug })),
    );
    cursor = batch.nextCursor;
  } while (cursor);
  return pages;
}

export async function GET() {
  const collections = await Promise.allSettled([
    getCmsPages().then((items) => items.map((i) => ({ title: i.title, href: "/" + i.slug }))),
    getDepartments().then((items) => items.map((i) => ({ title: i.name, href: "/departments/" + i.slug }))),
    getTeachers().then((items) => items.map((i) => ({ title: i.name, href: "/teachers/" + i.slug }))),
    getLeadership().then((items) =>
      items.map((i) => ({ title: i.name, href: "/about/leadership/" + i.slug })),
    ),
    getNews(200).then((items) => items.map((i) => ({ title: i.title, href: "/news/" + i.slug }))),
    getNotices(200).then((items) => items.map((i) => ({ title: i.title, href: "/notices/" + i.slug }))),
    getEvents("all", 200).then((items) => items.map((i) => ({ title: i.title, href: "/events/" + i.slug }))),
    getGalleryAlbums().then((items) =>
      items.map((i) => ({ title: i.title, href: "/campus-life/gallery/" + i.slug })),
    ),
    getFacilities().then((items) => items.map((i) => ({ title: i.name, href: "/facilities#" + i.slug }))),
    getPrograms().then((items) => items.map((i) => ({ title: i.name, href: "/academics#" + i.slug }))),
    listOpenForms().then((items) => items.map((i) => ({ title: i.title, href: "/forms/" + i.id }))),
    articlePages(),
  ]);
  const pages = collections.flatMap((collection) =>
    collection.status === "fulfilled" ? collection.value : [],
  );
  return Response.json(
    { pages },
    {
      headers: {
        "Cache-Control": collections.every((c) => c.status === "fulfilled")
          ? "public, s-maxage=30"
          : "no-store",
      },
    },
  );
}
