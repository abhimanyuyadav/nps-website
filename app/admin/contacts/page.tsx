import { PageHeading } from "@/components/admin/page-heading";
import { SubmissionManager } from "@/components/admin/submission-manager";
export default function ContactsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Community support"
        title="Contact enquiries"
        description="Read messages from families, choose who will reply, add private notes, and close a request when it is resolved."
      />
      <SubmissionManager type="contacts" />
    </>
  );
}
