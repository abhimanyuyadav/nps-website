import { PageHeading } from "@/components/admin/page-heading";
import { UsersManager } from "@/components/admin/users-manager";
export default function UsersPage() {
  return (
    <>
      <PageHeading
        eyebrow="Staff accounts"
        title="Users and roles"
        description="Choose what each staff member can do and suspend access when needed."
      />
      <UsersManager />
    </>
  );
}
