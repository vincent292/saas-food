import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { RestaurantSettingsFormClient } from "@/components/settings/RestaurantSettingsFormClient";
import { restaurantService } from "@/lib/services/restaurant.service";
import { settingsService } from "@/lib/services/settings.service";

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ saved?: string; error?: string; tab?: string }>;
}) {
  const { restaurantId } = await params;
  const { saved, error, tab } = await searchParams;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const [settings, businessHours] = await Promise.all([restaurantService.getSettings(restaurant.id), settingsService.listBusinessHours(restaurant.id)]);

  return (
    <AdminLayout active="configuracion" restaurantId={restaurant.id} title="Configuracion">
      <RestaurantSettingsFormClient businessHours={businessHours} error={error} initialTab={tab} restaurant={restaurant} saved={saved} settings={settings} />
    </AdminLayout>
  );
}
