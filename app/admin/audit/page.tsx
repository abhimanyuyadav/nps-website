import { AuditManager } from "@/components/admin/audit-manager";
import { PageHeading } from "@/components/admin/page-heading";
export default function AuditPage() {
  return (
    <>
      <PageHeading
        eyebrow="Security and compliance"
        title="Audit log"
        description="See who made changes in the admin panel and when. Entries cannot be edited here."
      />
      <AuditManager />
    </>
  );
}
