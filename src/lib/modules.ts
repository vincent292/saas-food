import type { ModuleKey, Restaurant } from "@/types/restaurant.types";

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
  void moduleKey;
  void businessType;
  return true;
}

export function hasRestaurantModule(restaurant: Restaurant, moduleKey: ModuleKey) {
  void moduleKey;
  return restaurant.status === "active";
}

export function modulesForAdminLayout(restaurant: Restaurant) {
  return restaurant.status === "active" ? moduleCatalog.map((module) => module.key) : [];
}
