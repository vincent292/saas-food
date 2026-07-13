import type { ReactNode } from "react";
import { redirect } from "next/navigation";
import { AdminShellClient } from "@/components/layout/AdminShellClient";
import { authService } from "@/lib/services/auth.service";
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

  return (
    <AdminShellClient
      active={active}
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
