import { redirect } from "next/navigation";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function AdminKitchenEntryPage({ params }: { params: Promise<{ restaurantId: string }> }) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    redirect("/admin/restaurantes");
  }

  redirect(`/cocina/${restaurant.slug}`);
}
