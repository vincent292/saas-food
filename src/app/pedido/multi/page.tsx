import type { Metadata } from "next";
import { MultisiteCheckoutClient } from "@/components/public-menu/MultisiteCheckoutClient";
import { restaurantService } from "@/lib/services/restaurant.service";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "Pedido multi-comercio | yopido.shop",
  description: "Une hasta tres locales cercanos en un solo pedido y una sola entrega.",
};

export default async function PublicMultisiteCheckoutPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const [{ error }, restaurants] = await Promise.all([searchParams, restaurantService.listPublicDirectoryRestaurants()]);
  return <MultisiteCheckoutClient error={error} restaurants={restaurants.map((restaurant) => ({ id: restaurant.id, slug: restaurant.slug, name: restaurant.name, latitude: restaurant.latitude, longitude: restaurant.longitude }))} />;
}
