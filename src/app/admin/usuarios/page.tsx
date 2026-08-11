import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SuperadminUsersManagementClient } from "@/components/admin/SuperadminUsersManagementClient";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { authService } from "@/lib/services/auth.service";
import { superadminUsersService, type SuperadminUserGroup } from "@/lib/services/superadmin-users.service";

function normalizeUserGroup(value?: string): SuperadminUserGroup {
  return value === "clientes" ? "clientes" : "operativos";
}

export default async function SuperadminUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; tipo?: string }>;
}) {
  const { q = "", tipo } = await searchParams;
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.mustChangePassword) {
    redirect("/admin/cambiar-contrasena");
  }

  if (profile.globalRole !== "superadmin") {
    redirect("/admin");
  }

  const search = q.trim();
  const activeGroup = normalizeUserGroup(tipo);
  const users = await superadminUsersService.listUsers(search, activeGroup);

  return (
    <AdminLayout active="/admin/usuarios" title="Usuarios">
      <SectionTitle
        description="Busca cuentas por nombre, correo, telefono o carnet; genera una clave temporal y marca el cambio obligatorio al iniciar sesion."
        title="Usuarios"
      />
      <div className="mt-6">
        <SuperadminUsersManagementClient activeGroup={activeGroup} search={search} users={users} />
      </div>
    </AdminLayout>
  );
}
