import { PageHeading } from "@/components/admin/page-heading";
import { SettingsManager } from "@/components/admin/settings-manager";
export default function SettingsPage() {
  return (
    <>
      <PageHeading
        eyebrow="School website"
        title="Site settings"
        description="Edit school details, contact information, search descriptions, and website settings."
      />
      <SettingsManager />
    </>
  );
}
