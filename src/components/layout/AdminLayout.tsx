import type { ReactNode } from "react";
import { AdminShellClient } from "@/components/layout/AdminShellClient";
import type { ModuleKey, RestaurantStatus } from "@/types/restaurant.types";

export function AdminLayout({
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
