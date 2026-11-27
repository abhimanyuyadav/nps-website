import { PageHeading } from "@/components/admin/page-heading";
import { AdmissionDetail } from "@/components/admin/submission-manager";
export default async function AdmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <>
      <PageHeading
        eyebrow="Admissions"
        title="Application record"
        description="Review the student and guardian details before you update the application. Only staff can see the notes."
      />
      <AdmissionDetail id={id} />
    </>
  );
}
