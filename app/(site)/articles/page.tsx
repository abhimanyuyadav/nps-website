import Link from "next/link";
import { ShieldCheck } from "lucide-react";
import { EmptyState } from "@/components/site/empty-state";
import { PageHero } from "@/components/site/page-hero";
import { StudentArticleCard } from "@/components/site/student-article-card";
import { contentMetadata } from "@/lib/content/public-metadata";
import { getStudentArticlePage } from "@/lib/data/public";

export const metadata = contentMetadata({
  title: "Student articles",
  description: "Student writing reviewed before publication on the Nepal Police School, Garuda website.",
  path: "/articles",
});

export const dynamic = "force-dynamic";

export default async function ArticlesPage({ searchParams }: { searchParams: Promise<{ after?: string }> }) {
  const { after } = await searchParams;
  const page = await getStudentArticlePage(25, after || null).catch(() => null);
  const articles = page?.articles ?? [];

  return (
    <>
      <PageHero
        eyebrow="Student voices"
        title="Student articles"
        description="Ideas, reflections, and stories written by students and reviewed before publication on the school website."
        crumbs={[{ label: "Articles" }]}
      />
      <section className="px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-7xl">
          <div className="mb-8 flex max-w-4xl items-start gap-4 rounded-2xl border border-sky-100 bg-sky-50 p-5 text-sky-950 sm:p-6">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[#2e3192] shadow-sm">
              <ShieldCheck size={20} aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-sm font-extrabold sm:text-base">
                Student contribution, reviewed before publication
              </h2>
              <p className="mt-1 text-sm leading-6 text-sky-900/80">
                These pieces represent their student authors. They are separate from official school news and
                notices.
              </p>
            </div>
          </div>
          {articles.length ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {articles.map((article) => (
                <StudentArticleCard key={article.id} article={article} />
              ))}
            </div>
          ) : (
            <EmptyState
              title={page ? "No student articles published yet" : "Articles could not be loaded"}
              description={
                page
                  ? "Approved student writing will appear here after an administrator completes the review."
                  : "Please try opening the article list again."
              }
              actionLabel={page ? "Read school news" : "Open article list"}
              actionHref={page ? "/news" : "/articles"}
            />
          )}
          {(after || page?.nextCursor) && (
            <nav
              aria-label="Article pages"
              className="mt-8 flex flex-wrap gap-6 font-semibold text-indigo-800"
            >
              {after && <Link href="/articles">Newest articles</Link>}
              {page?.nextCursor && (
                <Link href={"/articles?after=" + encodeURIComponent(page.nextCursor)}>Older articles →</Link>
              )}
            </nav>
          )}
        </div>
      </section>
    </>
  );
}
