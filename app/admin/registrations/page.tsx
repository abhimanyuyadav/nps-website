import { PageHeading } from "@/components/admin/page-heading";
import { SubmissionManager } from "@/components/admin/submission-manager";

export default function EventRegistrationsPage() {
  return (
    <>
      <PageHeading
        eyebrow="Event operations"
        title="Event registrations"
        description="See who signed up, manage the waiting list and cancellations, mark attendance, and download the list as a CSV file."
      />
      <SubmissionManager type="eventRegistrations" />
    </>
  );
}
