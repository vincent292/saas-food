import Link from "next/link";
import { Plus } from "lucide-react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { buttonClasses } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function RestaurantsPage() {
  const restaurants = await restaurantService.listRestaurants();

  return (
    <AdminLayout active="admin" title="Restaurantes">
      <SectionTitle
        action={
          <Link className={buttonClasses("primary")} href="/admin/restaurantes/nuevo">
            <Plus className="h-4 w-4" />
            Nuevo restaurante
          </Link>
        }
        description="Solo superadmin puede crear, activar, suspender y asignar usuarios."
        title="Empresas gastronómicas"
      />
      <div className="mt-6">
        <DataTable
          headers={["Nombre", "Slug", "Ciudad", "Plan", "Módulos", "Estado", "Acción"]}
          rows={restaurants.map((restaurant) => [
            restaurant.name,
            restaurant.slug,
            restaurant.city,
            restaurant.planKey ?? "sin plan",
            restaurant.activeModules?.length ?? 0,
            restaurant.status,
            <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}`} key={restaurant.id}>
              Ver
            </Link>,
          ])}
        />
      </div>
    </AdminLayout>
  );
}
