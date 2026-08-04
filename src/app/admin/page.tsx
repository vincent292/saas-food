import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, LogOut } from "lucide-react";
import { signOutAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { authService } from "@/lib/services/auth.service";
import { membershipService, type UserRestaurantMembership } from "@/lib/services/membership.service";
import { ownerMembershipsForUser } from "@/lib/services/owner-dashboard.service";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

export default async function AdminPage() {
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.mustChangePassword) {
    redirect("/admin/cambiar-contrasena");
  }

  if (profile.isCustomerAccount) {
    redirect("/admin/login?error=customer-account");
  }

  if (profile.globalRole !== "superadmin") {
    const memberships = await membershipService.listActiveRestaurantsForUser(profile.id);

    if (!memberships.length) {
      const allMemberships = await membershipService.listRestaurantsForUser(profile.id);
      const allOwnerMemberships = ownerMembershipsForUser(allMemberships, profile.id);

      if (allOwnerMemberships.length > 0 || !allMemberships.length) {
        redirect("/dueno");
      }

      return <SuspendedAccessNotice email={profile.email} memberships={allMemberships} />;
    }

    const ownerMemberships = ownerMembershipsForUser(memberships, profile.id);

    if (ownerMemberships.length > 0) {
      redirect("/dueno");
    }

    if (memberships.length === 1) {
      redirect(`/admin/restaurantes/${memberships[0].restaurant.id}/dashboard`);
    }

    return <BranchSelector email={profile.email} memberships={memberships} />;
  }

  return (
    <AdminLayout active="/admin" title="Superadmin">
      <SuperAdminDashboard />
    </AdminLayout>
  );
}

function SuspendedAccessNotice({ email, memberships }: { email: string; memberships: UserRestaurantMembership[] }) {
  return (
    <main className="min-h-screen bg-[var(--color-surface)] px-4 py-6 text-[var(--color-heading)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-3xl space-y-6">
        <Card className="space-y-5">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Sesion de sucursal</p>
            <h1 className="mt-1 break-words text-2xl font-black sm:text-3xl">{email}</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              No puedes iniciar sesion operativo porque la cuenta del negocio esta suspendida o inactiva.
              Ponte en contacto con yopido.shop para regularizar el acceso.
            </p>
          </div>
          <div className="grid gap-2">
            {memberships.map(({ restaurant, role }) => (
              <div className="flex min-h-14 flex-col gap-2 rounded-2xl border border-[var(--border)] bg-[var(--color-neutral-50)] p-3 sm:flex-row sm:items-center sm:justify-between" key={restaurant.id}>
                <div className="min-w-0">
                  <p className="truncate text-sm font-black">{restaurant.name}</p>
                  <p className="text-xs font-bold text-[var(--color-secondary-text)]">{role}</p>
                </div>
                <Badge className="bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">
                  {restaurant.status === "suspended" ? "Suspendida" : "Inactiva"}
                </Badge>
              </div>
            ))}
          </div>
          <form action={signOutAction}>
            <button className={buttonClasses("secondary", "w-full sm:w-auto")} type="submit">
              <LogOut className="h-4 w-4" />
              Salir
            </button>
          </form>
        </Card>
      </div>
    </main>
  );
}

function BranchSelector({ email, memberships }: { email: string; memberships: UserRestaurantMembership[] }) {
  return (
    <main className="min-h-screen bg-[var(--color-surface)] px-4 py-6 text-[var(--color-heading)] sm:px-6 lg:px-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Sesion de sucursal</p>
            <p className="mt-1 text-xl font-black">{email}</p>
          </div>
          <Badge className="bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">Equipo</Badge>
        </Card>

        <SectionTitle description="Elige la sucursal que quieres operar. Cada una mantiene pedidos, caja, inventario y reportes separados." title="Tus sucursales" />

        <div className="grid gap-4 md:grid-cols-2">
          {memberships.map(({ restaurant, role }) => (
            <Card className="flex flex-col gap-4" key={restaurant.id}>
              <div>
                <p className="text-lg font-black">{restaurant.name}</p>
                <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                  {publicRestaurantPath(restaurant.slug)}
                  {restaurant.city ? ` - ${restaurant.city}` : ""}
                </p>
                <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">{role}</p>
              </div>
              <Link className={buttonClasses("primary", "w-full")} href={`/admin/restaurantes/${restaurant.id}/dashboard`}>
                Entrar
              </Link>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}
