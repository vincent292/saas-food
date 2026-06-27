import type { ModuleKey, Restaurant } from "@/types/restaurant.types";

export const moduleCatalog: { key: ModuleKey; label: string }[] = [
  { key: "public_menu", label: "Menú público" },
  { key: "orders", label: "Pedidos" },
  { key: "table_qr", label: "Mesas QR" },
  { key: "kitchen", label: "Cocina" },
  { key: "cash", label: "Caja / POS" },
  { key: "inventory", label: "Inventario" },
  { key: "reports", label: "Reportes" },
  { key: "multi_user", label: "Multiusuario" },
];

export function hasRestaurantModule(restaurant: Restaurant, moduleKey: ModuleKey) {
  return Boolean(restaurant.activeModules?.includes(moduleKey));
}

export function modulesForAdminLayout(restaurant: Restaurant) {
  return restaurant.activeModules ?? [];
}
