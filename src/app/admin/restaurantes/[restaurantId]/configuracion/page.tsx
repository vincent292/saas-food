import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { RestaurantSettingsFormClient } from "@/components/settings/RestaurantSettingsFormClient";
import { modulesForAdminLayout } from "@/lib/modules";
import { authService } from "@/lib/services/auth.service";
import { planService } from "@/lib/services/plan.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
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

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/configuracion`);

  const [settings, businessHours, plans, profile] = await Promise.all([
    restaurantService.getSettings(restaurant.id),
    settingsService.listBusinessHours(restaurant.id),
    planService.listPlans(),
    authService.getCurrentProfile(),
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
      <RestaurantSettingsFormClient
        businessHours={businessHours}
        canManagePlan={profile?.globalRole === "superadmin"}
        error={error}
        initialTab={tab}
        plans={plans}
        restaurant={restaurant}
        saved={saved}
        settings={settings}
      />
    </AdminLayout>
  );
}
