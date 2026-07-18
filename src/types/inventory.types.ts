export type InventoryMovementType = "in" | "out" | "adjustment" | "waste" | "sale_usage";
export type InventoryCountStatus = "open" | "closed";
export type InventoryItemKind = "finished" | "ingredient" | "supply";

export type InventoryItem = {
  id: string;
  restaurantId: string;
  name: string;
  itemKind: InventoryItemKind;
  unit: "unidad" | "kg" | "g" | "lb" | "oz" | "litro" | "ml" | "caja" | "paquete";
  currentStock: number;
  minStock: number;
  unitCost: number;
  sku?: string;
  category?: string;
  categoryId?: string;
  purchaseUnit?: string;
  purchaseToStockFactor: number;
  supplierId?: string;
  isActive: boolean;
};

export type InventoryLot = {
  id: string;
  restaurantId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  supplierId?: string;
  supplierName?: string;
  lotCode?: string;
  expiresOn?: string;
  initialQuantity: number;
  remainingQuantity: number;
  notes?: string;
  receivedAt: string;
  isActive: boolean;
};

export type InventoryBranchTarget = {
  restaurantId: string;
  restaurantName: string;
  city: string;
  address?: string;
  items: InventoryItem[];
};

export type InventoryBranchTransfer = {
  id: string;
  fromRestaurantId: string;
  toRestaurantId: string;
  fromRestaurantName: string;
  toRestaurantName: string;
  fromInventoryItemId: string;
  toInventoryItemId: string;
  quantity: number;
  reason: string;
  status: "completed" | "cancelled";
  createdAt: string;
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
  fromZoneId?: string;
  toZoneId?: string;
  supplierId?: string;
  orderId?: string;
};

export type InventoryCategory = {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  isActive: boolean;
};

export type InventoryZone = {
  id: string;
  restaurantId: string;
  name: string;
  description?: string;
  isActive: boolean;
};

export type InventoryItemZone = {
  id: string;
  restaurantId: string;
  inventoryItemId: string;
  zoneId: string;
  stock: number;
};

export type InventorySupplier = {
  id: string;
  restaurantId: string;
  name: string;
  phone?: string;
  notes?: string;
  isActive: boolean;
};

export type ProductIngredient = {
  id: string;
  restaurantId: string;
  productId: string;
  productName: string;
  inventoryItemId: string;
  inventoryItemName: string;
  inventoryItemUnit: InventoryItem["unit"];
  quantity: number;
  wasteFactor: number;
  notes?: string;
};

export type ProductSupplier = {
  id: string;
  restaurantId: string;
  productId: string;
  productName: string;
  supplierId: string;
  supplierName: string;
  notes?: string;
};

export type InventoryCount = {
  id: string;
  restaurantId: string;
  status: InventoryCountStatus;
  openedBy?: string;
  openedByName?: string;
  closedBy?: string;
  closedByName?: string;
  openedAt: string;
  closedAt?: string;
  notes?: string;
};

export type InventoryCountLine = {
  id: string;
  inventoryCountId: string;
  restaurantId: string;
  inventoryItemId: string;
  inventoryItemName: string;
  expectedStock: number;
  countedStock: number;
  differenceStock: number;
  notes?: string;
  createdAt: string;
};

export type InventoryCountReport = InventoryCount & {
  lines: InventoryCountLine[];
};
