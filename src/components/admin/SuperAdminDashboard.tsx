import Link from "next/link";
import { Archive, Building2, LifeBuoy, RotateCcw, ShieldCheck, Users, WalletCards } from "lucide-react";
import { archiveRestaurantAction, restoreRestaurantAction, setRestaurantStatusAction, updatePlanAction } from "@/app/admin/actions";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { StatCard } from "@/components/ui/StatCard";
import { moduleCatalog } from "@/lib/modules";
import { authService } from "@/lib/services/auth.service";
import { planService } from "@/lib/services/plan.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import type { Restaurant, RestaurantStatus, SubscriptionPlan } from "@/types/restaurant.types";

export async function SuperAdminDashboard() {
  const [restaurants, deletedRestaurants, plans, profile] = await Promise.all([
    restaurantService.listRestaurants(),
    restaurantService.listDeletedRestaurants(),
    planService.listPlans(),
    authService.getCurrentProfile(),
  ]);
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

      <div className="grid gap-4 md:grid-cols-4">
        <StatCard icon={<Building2 className="h-5 w-5" />} label="Restaurantes" value={String(restaurants.length)} />
        <StatCard icon={<ShieldCheck className="h-5 w-5" />} label="Activos" value={String(restaurants.filter((restaurant) => restaurant.status === "active").length)} />
        <StatCard icon={<WalletCards className="h-5 w-5" />} label="Módulos activos" value={String(activeModules)} />
        <StatCard icon={<Users className="h-5 w-5" />} label="Restauración" value={String(deletedRestaurants.length)} />
      </div>

      <section className="space-y-3">
        <div>
          <h2 className="text-2xl font-black text-slate-950">Planes</h2>
          <p className="text-sm font-semibold text-slate-600">Estos módulos definen lo que el restaurante ve y puede usar.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {plans.map((plan) => (
            <PlanEditor key={plan.id} plan={plan} />
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-2xl font-black text-slate-950">Restaurantes</h2>
            <p className="text-sm font-semibold text-slate-600">Crea tenants, entra al panel operativo y controla el acceso.</p>
          </div>
          <Link className={buttonClasses("primary")} href="/admin/restaurantes/nuevo">
            Nuevo restaurante
          </Link>
        </div>
        <DataTable
          headers={["Restaurante", "Responsable", "Plan", "Estado", "Acciones"]}
          rows={restaurants.map((restaurant) => [
            <RestaurantName restaurant={restaurant} key={`${restaurant.id}-name`} />,
            restaurant.ownerEmail || "Sin responsable",
            restaurant.planKey ?? "sin plan",
            <StatusBadge key={`${restaurant.id}-status`} status={restaurant.status} />,
            <RestaurantActions key={restaurant.id} restaurant={restaurant} />,
          ])}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2" id="soporte">
        <Card>
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-emerald-50 text-emerald-700">
              <LifeBuoy className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">Soporte</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">Vista base para revisar restaurantes suspendidos, responsables y planes asignados.</p>
            </div>
          </div>
        </Card>

        <Card id="restauracion">
          <div className="flex items-start gap-3">
            <div className="grid h-11 w-11 place-items-center rounded-2xl bg-amber-50 text-amber-700">
              <RotateCcw className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-950">Restauración</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">Los restaurantes archivados quedan fuera del acceso normal y solo superadmin puede restaurarlos.</p>
            </div>
          </div>
        </Card>
      </section>

      {deletedRestaurants.length ? (
        <section className="space-y-3">
          <h2 className="text-2xl font-black text-slate-950">Archivados</h2>
          <DataTable
            headers={["Restaurante", "Slug", "Responsable", "Acción"]}
            rows={deletedRestaurants.map((restaurant) => [
              restaurant.name,
              restaurant.slug,
              restaurant.ownerEmail || "Sin responsable",
              <form action={restoreRestaurantAction} key={restaurant.id}>
                <input name="restaurantId" type="hidden" value={restaurant.id} />
                <button className={buttonClasses("secondary")} type="submit">
                  <RotateCcw className="h-4 w-4" />
                  Restaurar
                </button>
              </form>,
            ])}
          />
        </section>
      ) : null}
    </div>
  );
}

function PlanEditor({ plan }: { plan: SubscriptionPlan }) {
  return (
    <form action={updatePlanAction}>
      <Card className="h-full space-y-4">
        <input name="planId" type="hidden" value={plan.id} />
        <div>
          <label className="text-xs font-black uppercase text-slate-500">Nombre</label>
          <input className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 px-4 text-sm font-bold outline-none" defaultValue={plan.name} name="name" required />
        </div>
        <div>
          <label className="text-xs font-black uppercase text-slate-500">Descripción</label>
          <textarea className="mt-1 min-h-20 w-full rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none" defaultValue={plan.description} name="description" />
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-xs font-black uppercase text-slate-500">
            Bs/mes
            <input className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm outline-none" defaultValue={plan.priceMonthly} min={0} name="priceMonthly" step="0.01" type="number" />
          </label>
          <label className="text-xs font-black uppercase text-slate-500">
            Restaurantes
            <input className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm outline-none" defaultValue={plan.maxRestaurants} min={1} name="maxRestaurants" type="number" />
          </label>
          <label className="text-xs font-black uppercase text-slate-500">
            Usuarios
            <input className="mt-1 min-h-11 w-full rounded-2xl border border-slate-200 px-3 text-sm outline-none" defaultValue={plan.maxUsersPerRestaurant} min={1} name="maxUsersPerRestaurant" type="number" />
          </label>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {moduleCatalog.map((module) => (
            <label className="flex min-h-10 items-center justify-between gap-3 rounded-2xl border border-slate-200 px-3 text-sm font-bold text-slate-700" key={module.key}>
              {module.label}
              <input defaultChecked={plan.modules.includes(module.key)} name={`module_${module.key}`} type="checkbox" />
            </label>
          ))}
        </div>
        <button className={buttonClasses("primary", "w-full")} type="submit">
          Guardar plan
        </button>
      </Card>
    </form>
  );
}

function RestaurantName({ restaurant }: { restaurant: Restaurant }) {
  return (
    <div>
      <p className="font-black text-slate-950">{restaurant.name}</p>
      <p className="text-xs font-semibold text-slate-500">/r/{restaurant.slug}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: RestaurantStatus }) {
  const label = status === "active" ? "Activo" : status === "suspended" ? "Suspendido" : "Inactivo";
  const className = status === "active" ? "bg-emerald-50 text-emerald-700" : status === "suspended" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700";

  return <span className={`rounded-full px-3 py-1 text-xs font-black ${className}`}>{label}</span>;
}

function RestaurantActions({ restaurant }: { restaurant: Restaurant }) {
  const nextStatus: RestaurantStatus = restaurant.status === "active" ? "suspended" : "active";

  return (
    <div className="flex flex-wrap gap-2">
      <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}/dashboard`}>
        Gestionar
      </Link>
      <form action={setRestaurantStatusAction}>
        <input name="restaurantId" type="hidden" value={restaurant.id} />
        <input name="status" type="hidden" value={nextStatus} />
        <button className={buttonClasses(nextStatus === "active" ? "primary" : "secondary")} type="submit">
          {nextStatus === "active" ? "Activar" : "Suspender"}
        </button>
      </form>
      <form action={archiveRestaurantAction}>
        <input name="restaurantId" type="hidden" value={restaurant.id} />
        <button className={buttonClasses("danger")} type="submit">
          <Archive className="h-4 w-4" />
          Archivar
        </button>
      </form>
    </div>
  );
}
