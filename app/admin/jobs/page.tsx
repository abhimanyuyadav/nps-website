import { JobsManager } from "@/components/admin/jobs-manager";
import { PageHeading } from "@/components/admin/page-heading";
export default function JobsPage() {
  return (
    <>
      <PageHeading
        eyebrow="System operations"
        title="Background jobs"
        description="Check automatic tasks such as sending emails and publishing pages. Read the error before trying a failed task again."
      />
      <JobsManager />
    </>
  );
}
