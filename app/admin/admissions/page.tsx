import { PageHeading } from "@/components/admin/page-heading";
import { SubmissionManager } from "@/components/admin/submission-manager";
export default function AdmissionsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Admissions"
        title="Applications"
        description="Review applications, choose a staff member to handle each one, write private notes, and update its status."
      />
      <SubmissionManager type="admissions" />
    </>
  );
}
