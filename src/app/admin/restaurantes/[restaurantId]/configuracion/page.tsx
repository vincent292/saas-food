import { notFound } from "next/navigation";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { RestaurantSettingsFormClient } from "@/components/settings/RestaurantSettingsFormClient";
import { modulesForAdminLayout } from "@/lib/modules";
import { authService } from "@/lib/services/auth.service";
import { announcementService } from "@/lib/services/announcement.service";
import { orderService } from "@/lib/services/order.service";
import { restaurantAccessService } from "@/lib/services/restaurant-access.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { settingsService } from "@/lib/services/settings.service";

const invoiceDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function normalizeInvoiceDateFilter(value?: string) {
  return value && invoiceDatePattern.test(value) ? value : undefined;
}

function normalizeInvoiceStatusFilter(value?: string): "all" | "pending" | "issued" {
  return value === "pending" || value === "issued" ? value : "all";
}

export default async function SettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{
    saved?: string;
    error?: string;
    tab?: string;
    announcement?: string;
    closed?: string;
    disabled?: string;
    zone?: string;
    invoiceMarked?: string;
    invoiceFrom?: string;
    invoiceTo?: string;
    invoiceStatus?: string;
  }>;
}) {
  const { restaurantId } = await params;
  const { saved, error, tab, announcement, closed, disabled, zone, invoiceMarked, invoiceFrom, invoiceTo, invoiceStatus } = await searchParams;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  await restaurantAccessService.claimOrRedirect(restaurant.id, `/admin/restaurantes/${restaurant.id}/configuracion`);

  const invoiceFilters = {
    dateFrom: normalizeInvoiceDateFilter(invoiceFrom),
    dateTo: normalizeInvoiceDateFilter(invoiceTo),
    status: normalizeInvoiceStatusFilter(invoiceStatus),
  };
  const [settings, businessHours, profile, announcements, deliveryZones, invoiceRequests] = await Promise.all([
    restaurantService.getSettings(restaurant.id),
    settingsService.listBusinessHours(restaurant.id),
    authService.getCurrentProfile(),
    announcementService.listForAdmin(restaurant.id),
    restaurantService.listDeliveryZones(restaurant.id),
    orderService.listInvoiceRequests(restaurant.id, invoiceFilters),
  ]);

  const canManageOwnerSettings = profile?.globalRole === "superadmin" || profile?.id === restaurant.ownerUserId;

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
        key={`${restaurant.id}-${invoiceFilters.dateFrom ?? ""}-${invoiceFilters.dateTo ?? ""}-${invoiceFilters.status}`}
        businessHours={businessHours}
        announcements={announcements}
        canManagePlan={profile?.globalRole === "superadmin"}
        canManageDeliverySettings={canManageOwnerSettings}
        canManageOperationSettings={canManageOwnerSettings}
        canManagePayments={canManageOwnerSettings}
        announcementCreated={announcement}
        closureCreated={closed}
        announcementDisabled={disabled}
        error={error}
        initialTab={tab}
        invoiceFilters={{
          dateFrom: invoiceFilters.dateFrom ?? "",
          dateTo: invoiceFilters.dateTo ?? "",
          status: invoiceFilters.status,
        }}
        invoiceRequests={invoiceRequests}
        invoiceMarked={invoiceMarked}
        restaurant={restaurant}
        saved={saved}
        settings={settings}
        zoneSaved={zone}
        deliveryZones={deliveryZones}
      />
    </AdminLayout>
  );
}
