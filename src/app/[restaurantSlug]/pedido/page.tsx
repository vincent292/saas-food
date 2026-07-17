import { redirect } from "next/navigation";
import { publicRestaurantPath } from "@/lib/utils/public-routes";

export default async function PublicOrderBasePage({ params }: { params: Promise<{ restaurantSlug: string }> }) {
  const { restaurantSlug } = await params;
  redirect(publicRestaurantPath(restaurantSlug, "seguimiento"));
}
