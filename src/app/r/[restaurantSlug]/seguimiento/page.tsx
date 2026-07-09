import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { trackPublicOrderAction } from "@/app/r/actions";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { IllustrationAsset } from "@/components/ui/IllustrationAsset";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function PublicTrackingLookupPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ restaurantSlug }, { error }] = await Promise.all([params, searchParams]);
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  return (
    <RestaurantLayout restaurant={restaurant} showCart={false} showMobileNav={false}>
      <main className="mx-auto max-w-5xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <div className="grid gap-6 lg:grid-cols-[1fr_320px] lg:items-start">
          <div>
            <SectionTitle title="Rastrear pedido" description="Ingresa tu número de pedido y WhatsApp para ver el avance por estados." />

        {error ? (
          <div className="mt-5 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]">
            {error === "not-found" ? "No encontramos un pedido con esos datos." : "Revisa el número de pedido y WhatsApp."}
          </div>
        ) : null}

        <Card className="mt-6">
          <form action={trackPublicOrderAction} className="grid gap-4">
            <input name="restaurantId" type="hidden" value={restaurant.id} />
            <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
            <label className="text-sm font-black">
              Número de pedido
              <Input className="mt-2" name="orderNumber" placeholder="Ej. P-601022" required />
            </label>
            <label className="text-sm font-black">
              WhatsApp
              <Input className="mt-2" name="customerPhone" placeholder="El mismo número usado en el pedido" required type="tel" />
            </label>
            <Button className="min-h-12" type="submit">
              <Search className="h-4 w-4" />
              Ver seguimiento
            </Button>
          </form>
        </Card>
          </div>
          <Card className="overflow-hidden bg-[linear-gradient(180deg,var(--surface)_0%,var(--primary-light)_100%)] text-center">
            <IllustrationAsset className="mx-auto max-w-[260px]" name="orderStatus" priority sizes="260px" />
            <h2 className="mt-3 text-xl font-black text-[var(--text)]">Seguimiento simple</h2>
            <p className="mt-2 text-sm font-semibold text-[var(--muted)]">Te mostramos si el pedido fue confirmado, está en preparación, listo, en camino o entregado.</p>
          </Card>
        </div>
      </main>
    </RestaurantLayout>
  );
}
