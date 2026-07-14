import type { ModuleKey, Restaurant } from "@/types/restaurant.types";
import { businessTypeSupportsKitchen, businessTypeSupportsTableQr } from "@/lib/restaurant-directory-options";

export const moduleCatalog: { key: ModuleKey; label: string }[] = [
  { key: "public_menu", label: "Catalogo publico" },
  { key: "orders", label: "Pedidos" },
  { key: "table_qr", label: "Pedidos en mesa" },
  { key: "kitchen", label: "Cocina / preparacion" },
  { key: "cash", label: "Caja / POS" },
  { key: "inventory", label: "Inventario" },
  { key: "reports", label: "Reportes" },
  { key: "multi_user", label: "Multiusuario" },
];

export function isModuleAvailableForBusinessType(moduleKey: ModuleKey, businessType: Restaurant["businessType"]) {
  if (moduleKey === "table_qr") {
    return businessTypeSupportsTableQr(businessType);
  }

  if (moduleKey === "kitchen") {
    return businessTypeSupportsKitchen(businessType);
  }

  return true;
}

export function hasRestaurantModule(restaurant: Restaurant, moduleKey: ModuleKey) {
  return restaurant.status === "active" && isModuleAvailableForBusinessType(moduleKey, restaurant.businessType) && Boolean(restaurant.activeModules?.includes(moduleKey));
}

export function modulesForAdminLayout(restaurant: Restaurant) {
  return restaurant.status === "active" ? (restaurant.activeModules ?? []).filter((moduleKey) => isModuleAvailableForBusinessType(moduleKey, restaurant.businessType)) : [];
}
