import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { InventoryItem, InventoryMovement } from "@/types/inventory.types";

type InventoryItemRow = {
  id: string;
  restaurant_id: string;
  name: string;
  unit: InventoryItem["unit"];
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  is_active: boolean;
};

type InventoryMovementRow = {
  id: string;
  restaurant_id: string;
  inventory_item_id: string;
  type: InventoryMovement["type"];
  quantity: number;
  previous_stock: number;
  new_stock: number;
  reason: string | null;
  created_by: string | null;
  created_at: string;
};

function mapItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    unit: row.unit,
    currentStock: Number(row.current_stock),
    minStock: Number(row.min_stock),
    unitCost: Number(row.unit_cost),
    isActive: row.is_active,
  };
}

function mapMovement(row: InventoryMovementRow): InventoryMovement {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    inventoryItemId: row.inventory_item_id,
    type: row.type,
    quantity: Number(row.quantity),
    previousStock: Number(row.previous_stock),
    newStock: Number(row.new_stock),
    reason: row.reason ?? "",
    createdBy: row.created_by ?? "",
    createdAt: row.created_at,
  };
}

export const inventoryService = {
  async listItems(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error || !data?.length) {
      return [];
    }

    return data.map((row) => mapItem(row as InventoryItemRow));
  },

  async listLowStock(restaurantId: string) {
    return (await this.listItems(restaurantId)).filter((item) => item.currentStock <= item.minStock);
  },

  async listMovements(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("inventory_movements")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("created_at", { ascending: false })
      .limit(80);

    if (error || !data?.length) {
      return [];
    }

    return data.map((row) => mapMovement(row as InventoryMovementRow));
  },
};
