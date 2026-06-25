import { notFound } from "next/navigation";
import { KitchenOrderCard } from "@/components/kitchen/KitchenOrderCard";
import { RestaurantThemeProvider } from "@/components/restaurant/RestaurantThemeProvider";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { kitchenService } from "@/lib/services/kitchen.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function KitchenPage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    notFound();
  }

  const orders = await kitchenService.listKitchenOrders(restaurant.id);

  return (
    <RestaurantThemeProvider theme={restaurant.theme}>
      <main className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <SectionTitle title={`Cocina · ${restaurant.name}`} description="Cards grandes, estados claros y preparado para Supabase Realtime." />
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((order) => (
            <KitchenOrderCard key={order.id} order={order} restaurantSlug={restaurant.slug} />
          ))}
        </div>
      </main>
    </RestaurantThemeProvider>
  );
}
