import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShellClient } from "@/components/layout/AdminShellClient";
import { authService } from "@/lib/services/auth.service";
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
  if (!restaurantId) {
    const profile = await authService.getCurrentProfile();

    if (!profile) {
      redirect("/admin/login?error=session");
    }

    if (profile.globalRole !== "superadmin") {
      redirect("/admin/login?error=superadmin-required");
    }
  }

  const billingAlert = restaurantId && restaurantStatus ? (await platformBillingService.getBillingSnapshot(restaurantId, restaurantStatus)).alert : null;

  return (
    <AdminShellClient
      active={active}
      billingAlert={billingAlert}
      enabledModules={enabledModules}
      restaurantId={restaurantId}
      restaurantName={restaurantName}
      restaurantStatus={restaurantStatus}
      title={title}
    >
      {children}
    </AdminShellClient>
  );
}
