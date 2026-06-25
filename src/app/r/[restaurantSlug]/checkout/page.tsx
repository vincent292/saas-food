import { notFound } from "next/navigation";
import { RestaurantLayout } from "@/components/layout/RestaurantLayout";
import { CheckoutClient } from "@/components/public-menu/CheckoutClient";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function CheckoutPage({
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
    <RestaurantLayout restaurant={restaurant}>
      <CheckoutClient error={error} restaurantId={restaurant.id} restaurantSlug={restaurant.slug} />
    </RestaurantLayout>
  );
}
