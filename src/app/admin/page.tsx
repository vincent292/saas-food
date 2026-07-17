import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { SuperAdminDashboard } from "@/components/admin/SuperAdminDashboard";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { authService } from "@/lib/services/auth.service";
import { createClient } from "@/lib/supabase/server";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

export default async function AdminPage() {
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.globalRole !== "superadmin") {
    const supabase = await createClient();
    const { data: memberships } = await supabase
      .from("restaurant_memberships")
      .select("restaurant_id, role")
      .eq("user_id", profile.id)
      .eq("is_active", true);

    const restaurantIds = [...new Set((memberships ?? []).map((membership) => membership.restaurant_id))];

    if (!restaurantIds.length) {
      redirect("/admin/login?error=no-access");
    }

    const { data: restaurants } = await supabase
      .from("restaurants")
      .select("id,name,slug,city,status")
      .in("id", restaurantIds)
      .eq("status", "active")
      .is("deleted_at", null)
      .order("created_at", { ascending: true });

    if (!restaurants?.length) {
      redirect("/admin/login?error=no-access");
    }

    if (restaurants.length === 1) {
      redirect(`/admin/restaurantes/${restaurants[0].id}/dashboard`);
    }

    const rolesByRestaurant = new Map((memberships ?? []).map((membership) => [membership.restaurant_id, membership.role]));

    return (
      <main className="min-h-screen bg-[var(--color-surface)] px-4 py-6 text-[var(--color-heading)] sm:px-6 lg:px-8">
        <div className="mx-auto max-w-5xl space-y-6">
          <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Sesion de sucursal</p>
              <p className="mt-1 text-xl font-black">{profile.email}</p>
            </div>
            <Badge className="bg-[var(--color-success-soft)] text-[var(--color-success-strong)]">Responsable</Badge>
          </Card>

          <SectionTitle description="Elige la sucursal que quieres operar. Cada una mantiene pedidos, caja, inventario y reportes separados." title="Selecciona sucursal" />

          <div className="grid gap-4 md:grid-cols-2">
            {restaurants.map((restaurant) => (
              <Card className="flex flex-col gap-4" key={restaurant.id}>
                <div>
                  <p className="text-lg font-black">{restaurant.name}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                    {publicRestaurantPath(restaurant.slug)}
                    {restaurant.city ? ` - ${restaurant.city}` : ""}
                  </p>
                  <p className="mt-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">{rolesByRestaurant.get(restaurant.id) ?? "restaurant_admin"}</p>
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

  return (
    <AdminLayout active="/admin" title="Superadmin">
      <SuperAdminDashboard />
    </AdminLayout>
  );
}
