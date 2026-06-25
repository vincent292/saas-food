import { AdminLayout } from "@/components/layout/AdminLayout";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";

export default function AdminPage() {
  return (
    <AdminLayout active="admin" title="Superadmin">
      <SuperAdminDashboard />
    </AdminLayout>
  );
}
