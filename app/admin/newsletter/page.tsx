import { NewsletterManager } from "@/components/admin/newsletter-manager";
import { PageHeading } from "@/components/admin/page-heading";

export default function NewsletterPage() {
  return (
    <>
      <PageHeading
        eyebrow="Audience communications"
        title="Newsletter"
        description="Manage subscribers, write newsletters, and choose when to send them."
      />
      <NewsletterManager />
    </>
  );
}
