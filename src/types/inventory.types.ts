export type InventoryMovementType = "in" | "out" | "adjustment" | "waste" | "sale_usage";

export type InventoryItem = {
  id: string;
  restaurantId: string;
  name: string;
  unit: "unidad" | "kg" | "g" | "litro" | "ml" | "caja" | "paquete";
  currentStock: number;
  minStock: number;
  unitCost: number;
  isActive: boolean;
};

export type InventoryMovement = {
  id: string;
  restaurantId: string;
  inventoryItemId: string;
  type: InventoryMovementType;
  quantity: number;
  previousStock: number;
  newStock: number;
  reason: string;
  createdBy: string;
  createdAt: string;
};
