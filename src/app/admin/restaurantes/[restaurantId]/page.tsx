import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function RestaurantOverviewPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  return (
    <AdminLayout active="admin" restaurantId={restaurant.id} title={restaurant.name}>
      <SectionTitle title="Resumen del restaurante" description="Ficha base para superadmin y admins asignados." />
      <Card className="mt-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <p className="text-sm font-semibold text-slate-500">URL pública</p>
              <p className="mt-1 text-xl font-black">/r/{restaurant.slug}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Plan</p>
              <p className="mt-1 text-xl font-black">{restaurant.planKey ?? "sin plan"}</p>
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-500">Módulos</p>
              <p className="mt-1 text-xl font-black">{restaurant.activeModules?.length ?? 0}</p>
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link className={buttonClasses("secondary")} href={`/r/${restaurant.slug}`}>Ver menú</Link>
            <Link className={buttonClasses("primary")} href={`/admin/restaurantes/${restaurant.id}/dashboard`}>Gestionar</Link>
          </div>
        </div>
      </Card>
    </AdminLayout>
  );
}
