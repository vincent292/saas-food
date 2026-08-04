import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShellClient } from "@/components/layout/AdminShellClient";
import { authService } from "@/lib/services/auth.service";
import { membershipService } from "@/lib/services/membership.service";
import { orderService } from "@/lib/services/order.service";
import { ownerBillingService } from "@/lib/services/owner-billing.service";
import { platformBillingService } from "@/lib/services/platform-billing.service";
import type { ModuleKey, RestaurantStatus } from "@/types/restaurant.types";

export async function AdminLayout({
  children,
  restaurantId = "",
  restaurantName,
  restaurantStatus,
  enabledModules,
  title,
  active = "dashboard",
}: {
  children: ReactNode;
  restaurantId?: string;
  restaurantName?: string;
  restaurantStatus?: RestaurantStatus;
  enabledModules?: ModuleKey[];
  title: string;
  active?: string;
}) {
  const profile = await authService.getCurrentProfile();

  if (!profile) {
    redirect("/admin/login?error=session");
  }

  if (profile.mustChangePassword) {
    redirect("/admin/cambiar-contrasena");
  }

  if (profile.isCustomerAccount) {
    redirect("/admin/login?error=customer-account");
  }

  if (!restaurantId) {
    if (profile.globalRole !== "superadmin") {
      redirect("/admin");
    }
  }

  const memberships = profile.globalRole !== "superadmin" && restaurantId ? await membershipService.listActiveRestaurantsForUser(profile.id) : [];

  const currentMembership = restaurantId ? memberships.find((membership) => membership.restaurantId === restaurantId) : undefined;
  const hasCurrentMembership = restaurantId ? memberships.some((membership) => membership.restaurantId === restaurantId) : false;

  if (restaurantId && profile.globalRole !== "superadmin" && !hasCurrentMembership) {
    redirect("/admin?error=restaurant-access-denied");
  }

  const ownsCurrentRestaurant =
    currentMembership?.role === "restaurant_admin" && currentMembership.restaurant.ownerUserId === profile.id;

  if (restaurantId && profile.globalRole !== "superadmin" && ownsCurrentRestaurant && !profile.ownerProfileComplete) {
    redirect("/dueno/cuenta?required=1");
  }

  if (restaurantId && profile.globalRole !== "superadmin" && currentMembership?.restaurant.ownerUserId) {
    const ownerBilling = await ownerBillingService.getSnapshot(currentMembership.restaurant.ownerUserId, { enforce: true });
    if (ownerBilling?.isOverdue) {
      redirect("/admin?error=restaurant-suspended");
    }
  }

  const [billingAlert, pendingOrderAlerts] = await Promise.all([
    restaurantId && restaurantStatus ? platformBillingService.getBillingSnapshot(restaurantId, restaurantStatus).then((snapshot) => snapshot.alert) : Promise.resolve(null),
    restaurantId ? orderService.listPendingAlerts(restaurantId) : Promise.resolve([]),
  ]);
  const canSwitchBranches = memberships.length > 1;
  const canAccessOwnerPanel = memberships.some((membership) => membership.role === "restaurant_admin" && membership.restaurant.ownerUserId === profile.id);

  return (
    <AdminShellClient
      active={active}
      billingAlert={billingAlert}
      canAccessOwnerPanel={canAccessOwnerPanel}
      canAccessSuperadmin={profile.globalRole === "superadmin"}
      canSwitchBranches={canSwitchBranches}
      enabledModules={enabledModules}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      restaurantStatus={restaurantStatus}
      pendingOrderAlerts={pendingOrderAlerts}
      title={title}
    >
      {children}
    </AdminShellClient>
  );
}
