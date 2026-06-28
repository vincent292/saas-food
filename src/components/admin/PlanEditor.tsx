import { updatePlanAction } from "@/app/admin/actions";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { moduleCatalog } from "@/lib/modules";
import type { SubscriptionPlan } from "@/types/restaurant.types";

export function PlanEditor({ plan }: { plan: SubscriptionPlan }) {
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
