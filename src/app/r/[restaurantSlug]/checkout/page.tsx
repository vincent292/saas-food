import { redirect } from "next/navigation";
import { publicRestaurantOrderPath } from "@/lib/utils/public-routes";

export default async function CheckoutPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantSlug: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const [{ restaurantSlug }, { error }] = await Promise.all([params, searchParams]);
  redirect(publicRestaurantOrderPath(restaurantSlug, error));
}
