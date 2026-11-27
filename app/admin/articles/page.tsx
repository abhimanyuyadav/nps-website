import { ArticleReviewManager } from "@/components/admin/article-review-manager";
import { PageHeading } from "@/components/admin/page-heading";

export default function AdminArticlesPage() {
  return (
    <>
      <PageHeading
        eyebrow="Student publishing"
        title="Article review"
        description="Review student submissions and manage published articles."
      />
      <ArticleReviewManager />
    </>
  );
}
