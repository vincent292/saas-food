import Link from "next/link";
import { Building2, Users, WalletCards } from "lucide-react";
import { buttonClasses } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";
import { authService } from "@/lib/services/auth.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export async function SuperAdminDashboard() {
  const [restaurants, profile] = await Promise.all([restaurantService.listRestaurants(), authService.getCurrentProfile()]);
  const activeModules = restaurants.reduce((sum, restaurant) => sum + (restaurant.activeModules?.length ?? 0), 0);

  return (
    <div className="space-y-6">
      <Card className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">Sesión administrativa</p>
          <p className="mt-1 text-xl font-black text-slate-950">{profile?.email ?? "Sin sesión activa"}</p>
        </div>
        <span className="w-fit rounded-full bg-emerald-50 px-4 py-2 text-sm font-bold text-emerald-800">
          {profile?.globalRole === "superadmin" ? "Superadmin" : "Sin rol superadmin"}
        </span>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Restaurantes" value={String(restaurants.length)} />
        <StatCard icon={<Users className="h-5 w-5" />} label="Usuarios" value="-" />
        <StatCard icon={<WalletCards className="h-5 w-5" />} label="Módulos activos" value={String(activeModules)} />
      </div>
      <DataTable
        headers={["Restaurante", "Slug", "Plan", "Estado", "Acción"]}
        rows={restaurants.map((restaurant) => [
          restaurant.name,
          `/r/${restaurant.slug}`,
          restaurant.planKey ?? "sin plan",
          restaurant.status,
          <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}/dashboard`} key={restaurant.id}>
            Gestionar
          </Link>,
        ])}
      />
    </div>
  );
}
