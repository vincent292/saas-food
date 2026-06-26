import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { trackPublicOrderAction } from "@/app/r/actions";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
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
      <main className="mx-auto max-w-2xl px-4 pb-16 pt-8 sm:px-6 lg:px-8">
        <SectionTitle title="Rastrear pedido" description="Ingresa tu número de pedido y WhatsApp para ver el avance en tiempo real." />

        {error ? (
          <div className="mt-5 rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">
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
      </main>
    </RestaurantLayout>
  );
}
