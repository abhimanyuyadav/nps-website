import { NavigationManager } from "@/components/admin/navigation-manager";
import { PageHeading } from "@/components/admin/page-heading";
export default function NavigationPage() {
  return (
    <>
      <PageHeading
        eyebrow="Website structure"
        title="Navigation"
        description="Choose the links in the school website menus, their order, and who can see them."
      />
      <NavigationManager />
    </>
  );
}
