import { AdminCollectionPage } from "@/components/admin/content-manager";

import { DepartmentsBanner } from "@/components/admin/departments-banner";

export default function AdminDepartmentsPage() {
  return (
    <AdminCollectionPage collection="departments">
      <DepartmentsBanner />
    </AdminCollectionPage>
  );
}
