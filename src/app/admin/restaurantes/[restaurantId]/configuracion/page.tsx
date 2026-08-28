import { notFound } from "next/navigation";
import { headers } from "next/headers";
import { RestaurantSettingsFormClient } from "@/components/settings/RestaurantSettingsFormClient";
import { authService } from "@/lib/services/auth.service";
import { announcementService } from "@/lib/services/announcement.service";
import { orderService } from "@/lib/services/order.service";
import { printConnectorService } from "@/lib/services/print-connector.service";
import { riderService } from "@/lib/services/rider.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { settingsService } from "@/lib/services/settings.service";

const invoiceDatePattern = /^\d{4}-\d{2}-\d{2}$/;

function normalizeInvoiceDateFilter(value?: string) {
  return value && invoiceDatePattern.test(value) ? value : undefined;
}

function normalizeInvoiceStatusFilter(value?: string): "all" | "pending" | "issued" {
  return value === "pending" || value === "issued" ? value : "all";
}

async function currentOrigin() {
  const headerStore = await headers();
  const fallbackPort = process.env.PORT?.trim() || "3000";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? `localhost:${fallbackPort}`;
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
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
    printConnector?: string;
    invoiceMarked?: string;
    invoiceFrom?: string;
    invoiceTo?: string;
    invoiceStatus?: string;
  }>;
}) {
  const { restaurantId } = await params;
  const { saved, error, tab, announcement, closed, disabled, zone, printConnector, invoiceMarked, invoiceFrom, invoiceTo, invoiceStatus } = await searchParams;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  const invoiceFilters = {
    dateFrom: normalizeInvoiceDateFilter(invoiceFrom),
    dateTo: normalizeInvoiceDateFilter(invoiceTo),
    status: normalizeInvoiceStatusFilter(invoiceStatus),
  };
  const [settings, businessHours, profile, announcements, deliveryZones, invoiceRequests, printConnectorLink] = await Promise.all([
    restaurantService.getSettings(restaurant.id),
    settingsService.listBusinessHours(restaurant.id),
    authService.getCurrentProfile(),
    announcementService.listForAdmin(restaurant.id),
    restaurantService.listDeliveryZones(restaurant.id),
    orderService.listInvoiceRequests(restaurant.id, invoiceFilters),
    printConnectorService.getActiveForRestaurant(restaurant.id),
  ]);

  const canManageOwnerSettings = profile?.globalRole === "superadmin" || profile?.id === restaurant.ownerUserId;
  const riderInvite = canManageOwnerSettings ? await riderService.ensureRestaurantInvite(restaurant.id, profile?.id) : null;
  const riderInviteUrl = riderInvite ? `${await currentOrigin()}/riders/${riderInvite.invite_token}` : "";

  return (
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
        printConnector={printConnector}
        printConnectorLink={printConnectorLink}
        invoiceFilters={{
          dateFrom: invoiceFilters.dateFrom ?? "",
          dateTo: invoiceFilters.dateTo ?? "",
          status: invoiceFilters.status,
        }}
        invoiceRequests={invoiceRequests}
        invoiceMarked={invoiceMarked}
        restaurant={restaurant}
        riderInviteUrl={riderInviteUrl}
        saved={saved}
        settings={settings}
        zoneSaved={zone}
        deliveryZones={deliveryZones}
    />
  );
}
