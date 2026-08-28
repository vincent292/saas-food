import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { modulesForAdminLayout } from "@/lib/modules";
import { restaurantService } from "@/lib/services/restaurant.service";

export default async function RestaurantAdminLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ restaurantId: string }>;
}) {
  const { restaurantId } = await params;
  const restaurant = await restaurantService.getById(restaurantId);

  if (!restaurant) {
    notFound();
  }

  return (
    <AdminLayout
      enabledModules={modulesForAdminLayout(restaurant)}
      restaurantId={restaurant.id}
      restaurantName={restaurant.name}
      restaurantStatus={restaurant.status}
    >
      {children}
    </AdminLayout>
  );
}
