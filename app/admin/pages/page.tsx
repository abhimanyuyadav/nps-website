import { AdminCollectionPage } from "@/components/admin/content-manager";

import { DepartmentsBanner } from "@/components/admin/departments-banner";

const websitePageSections = new Set(["about", "academics", "campus-life", "admissions"]);

export default async function AdminPagesPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string }>;
}) {
  const { section } = await searchParams;
  return (
    <>
      {section === "campus-life" && <DepartmentsBanner section="campus-life" />}
      <AdminCollectionPage
        collection="pages"
        initialSearch={section && websitePageSections.has(section) ? section : ""}
      />
    </>
  );
}
