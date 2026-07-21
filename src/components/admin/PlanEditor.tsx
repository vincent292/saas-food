import { CheckCircle2 } from "lucide-react";
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
        <input name="maxRestaurants" type="hidden" value={plan.maxRestaurants} />
        <div>
          <p className="text-xs font-black uppercase text-[var(--primary)]">Modelo comercial</p>
          <h2 className="mt-1 text-2xl font-black text-[var(--color-heading)]">Tarifa {plan.name}</h2>
          <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
            Todo habilitado. La tarifa cambia por sucursal activa, no por modulos.
          </p>
        </div>

        <div>
          <label className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Nombre comercial</label>
          <input className="mt-1 min-h-11 w-full rounded-2xl border border-[var(--border)] px-4 text-sm font-bold outline-none" defaultValue={plan.name} name="name" required />
        </div>

        <div>
          <label className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Descripcion</label>
          <textarea className="mt-1 min-h-20 w-full rounded-2xl border border-[var(--border)] px-4 py-3 text-sm outline-none" defaultValue={plan.description} name="description" />
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-black uppercase text-[var(--color-secondary-text)]">
            Primera sucursal Bs/mes
            <input className="mt-1 min-h-11 w-full rounded-2xl border border-[var(--border)] px-3 text-sm outline-none" defaultValue={plan.priceMonthly} min={0} name="priceMonthly" step="0.01" type="number" />
          </label>
          <label className="text-xs font-black uppercase text-[var(--color-secondary-text)]">
            Sucursal adicional Bs/mes
            <input className="mt-1 min-h-11 w-full rounded-2xl border border-[var(--border)] px-3 text-sm outline-none" defaultValue={plan.additionalRestaurantPriceMonthly} min={0} name="additionalRestaurantPriceMonthly" step="0.01" type="number" />
          </label>
          <label className="text-xs font-black uppercase text-[var(--color-secondary-text)]">
            Usuarios por sucursal
            <input className="mt-1 min-h-11 w-full rounded-2xl border border-[var(--border)] px-3 text-sm outline-none" defaultValue={plan.maxUsersPerRestaurant} min={1} name="maxUsersPerRestaurant" type="number" />
          </label>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
          <p className="text-sm font-black text-[var(--color-heading)]">Incluye todos los modulos</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {moduleCatalog.map((module) => (
              <span className="inline-flex min-h-9 items-center gap-2 rounded-full bg-[var(--surface)] px-3 text-xs font-black text-[var(--color-body)] ring-1 ring-[var(--border)]" key={module.key}>
                <CheckCircle2 className="h-4 w-4 text-[var(--color-success-strong)]" />
                {module.label}
              </span>
            ))}
          </div>
        </div>

        <button className={buttonClasses("primary", "w-full")} type="submit">
          Guardar tarifa
        </button>
      </Card>
    </form>
  );
}
