import { Bike } from "lucide-react";
import { updatePlatformDeliveryRatesAction } from "@/app/admin/actions";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import type { DeliveryRateTier } from "@/lib/delivery-rates";

export function DeliveryRateEditor({ rates }: { rates: DeliveryRateTier[] }) {
  return (
    <form action={updatePlatformDeliveryRatesAction} className="xl:col-span-2">
      <Card className="space-y-5">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            <Bike className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-black uppercase text-[var(--primary)]">Delivery de la plataforma</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--color-heading)]">Tarifario estándar por distancia</h2>
            <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              Se aplica a todos los restaurantes. Las zonas delivery de cada sucursal pueden reemplazar el precio para coberturas especiales.
            </p>
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-[var(--border)]">
          <div className="grid grid-cols-[1fr_9rem] bg-[var(--color-surface)] px-4 py-3 text-xs font-black uppercase text-[var(--color-secondary-text)]">
            <span>Distancia</span>
            <span>Precio Bs</span>
          </div>
          {rates.map((rate, index) => (
            <div className="grid grid-cols-[1fr_9rem] items-center border-t border-[var(--border)] px-4 py-3" key={`${rate.minDistanceKm}-${rate.maxDistanceKm}`}>
              <input name="minDistanceKm" type="hidden" value={rate.minDistanceKm} />
              <input name="maxDistanceKm" type="hidden" value={rate.maxDistanceKm} />
              <input name="sortOrder" type="hidden" value={(index + 1) * 10} />
              <span className="font-black text-[var(--color-heading)]">{rate.minDistanceKm.toFixed(1)} – {rate.maxDistanceKm.toFixed(1)} km</span>
              <input
                aria-label={`Precio de ${rate.minDistanceKm.toFixed(1)} a ${rate.maxDistanceKm.toFixed(1)} km`}
                className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 text-right font-black outline-none focus:border-[var(--primary)]"
                defaultValue={rate.deliveryFee}
                min="0"
                name="deliveryFee"
                required
                step="0.5"
                type="number"
              />
            </div>
          ))}
        </div>

        <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
          La distancia se redondea a un decimal. Por ejemplo, 3,0 km usa 15 Bs. Por encima de 14,9 km el cliente verá que está fuera de la cobertura estándar, salvo que el restaurante configure una zona especial.
        </div>
        <button className={buttonClasses("primary", "w-full sm:w-auto")} type="submit">Guardar tarifario delivery</button>
      </Card>
    </form>
  );
}

