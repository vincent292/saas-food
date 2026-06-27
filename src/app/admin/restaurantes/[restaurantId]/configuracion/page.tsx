import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { RestaurantSettingsFormClient } from "@/components/settings/RestaurantSettingsFormClient";
import { modulesForAdminLayout } from "@/lib/modules";
import { planService } from "@/lib/services/plan.service";
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

  const [settings, businessHours, plans] = await Promise.all([
    restaurantService.getSettings(restaurant.id),
    settingsService.listBusinessHours(restaurant.id),
    planService.listPlans(),
  ]);

  return (
    <AdminLayout
      active="configuracion"
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
      title="Configuración"
    >
      <RestaurantSettingsFormClient businessHours={businessHours} error={error} initialTab={tab} plans={plans} restaurant={restaurant} saved={saved} settings={settings} />
    </AdminLayout>
  );
}
