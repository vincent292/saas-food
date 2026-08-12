import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createAdminClient } from "@/lib/supabase/admin";
import type {
  InventoryBranchTarget,
  InventoryBranchTransfer,
  InventoryCategory,
  InventoryCount,
  InventoryCountLine,
  InventoryCountReport,
  InventoryItem,
  InventoryItemKind,
  InventoryLot,
  InventoryItemZone,
  InventoryMovement,
  InventorySupplier,
  InventoryZone,
  ProductIngredient,
  ProductSupplier,
} from "@/types/inventory.types";
import type { Restaurant } from "@/types/restaurant.types";

type InventoryItemRow = {
  id: string;
  restaurant_id: string;
  name: string;
  item_kind?: InventoryItemKind | null;
  unit: InventoryItem["unit"];
  current_stock: number;
  min_stock: number;
  unit_cost: number;
  sku: string | null;
  category: string | null;
  category_id: string | null;
  purchase_unit: string | null;
  purchase_to_stock_factor: number;
  supplier_id: string | null;
  is_active: boolean;
};

type InventoryLotRow = {
  id: string;
  restaurant_id: string;
  inventory_item_id: string;
  supplier_id: string | null;
  lot_code: string | null;
  expires_on: string | null;
  initial_quantity: number;
  remaining_quantity: number;
  notes: string | null;
  received_at: string;
  is_active: boolean;
};

type InventoryBranchTransferRow = {
  id: string;
  from_restaurant_id: string;
  to_restaurant_id: string;
  from_inventory_item_id: string;
  to_inventory_item_id: string;
  quantity: number;
  reason: string;
  status: InventoryBranchTransfer["status"];
  created_at: string;
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
  from_zone_id: string | null;
  to_zone_id: string | null;
  supplier_id: string | null;
  order_id: string | null;
};

type InventoryCategoryRow = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type InventoryZoneRow = {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  is_active: boolean;
};

type InventoryItemZoneRow = {
  id: string;
  restaurant_id: string;
  inventory_item_id: string;
  zone_id: string;
  stock: number;
};

type ProductSupplierRow = {
  id: string;
  restaurant_id: string;
  product_id: string;
  supplier_id: string;
  notes: string | null;
};

type InventorySupplierRow = {
  id: string;
  restaurant_id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
};

type ProductIngredientRow = {
  id: string;
  restaurant_id: string;
  product_id: string;
  inventory_item_id: string;
  quantity: number;
  waste_factor: number;
  notes: string | null;
};

type InventoryCountRow = {
  id: string;
  restaurant_id: string;
  status: InventoryCount["status"];
  opened_by: string | null;
  closed_by: string | null;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
};

type InventoryCountLineRow = {
  id: string;
  inventory_count_id: string;
  restaurant_id: string;
  inventory_item_id: string;
  expected_stock: number;
  counted_stock: number;
  difference_stock: number;
  notes: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type DynamicQueryResult = {
  data: unknown[] | null;
  error: { message?: string; code?: string } | null;
};

type DynamicQuery = PromiseLike<DynamicQueryResult> & {
  select: (columns: string) => DynamicQuery;
  eq: (column: string, value: unknown) => DynamicQuery;
  gt: (column: string, value: unknown) => DynamicQuery;
  or: (filter: string) => DynamicQuery;
  order: (column: string, options?: Record<string, unknown>) => DynamicQuery;
  limit: (count: number) => DynamicQuery;
};

type DynamicSupabaseClient = {
  from: (table: string) => DynamicQuery;
};

function mapItem(row: InventoryItemRow): InventoryItem {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    itemKind: row.item_kind ?? "ingredient",
    unit: row.unit,
    currentStock: Number(row.current_stock),
    minStock: Number(row.min_stock),
    unitCost: Number(row.unit_cost),
    sku: row.sku ?? undefined,
    category: row.category ?? undefined,
    categoryId: row.category_id ?? undefined,
    purchaseUnit: row.purchase_unit ?? undefined,
    purchaseToStockFactor: Number(row.purchase_to_stock_factor ?? 1),
    supplierId: row.supplier_id ?? undefined,
    isActive: row.is_active,
  };
}

function mapLot(row: InventoryLotRow, items: Map<string, InventoryItem>, suppliers: Map<string, InventorySupplier>): InventoryLot {
  const supplier = row.supplier_id ? suppliers.get(row.supplier_id) : undefined;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    inventoryItemId: row.inventory_item_id,
    inventoryItemName: items.get(row.inventory_item_id)?.name ?? "Item",
    supplierId: row.supplier_id ?? undefined,
    supplierName: supplier?.name,
    lotCode: row.lot_code ?? undefined,
    expiresOn: row.expires_on ?? undefined,
    initialQuantity: Number(row.initial_quantity),
    remainingQuantity: Number(row.remaining_quantity),
    notes: row.notes ?? undefined,
    receivedAt: row.received_at,
    isActive: row.is_active,
  };
}

function mapMovement(row: InventoryMovementRow, profiles?: Map<string, ProfileRow>): InventoryMovement {
  const profile = row.created_by ? profiles?.get(row.created_by) : undefined;
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
    createdByName: profile?.full_name ?? profile?.email ?? undefined,
    createdAt: row.created_at,
    fromZoneId: row.from_zone_id ?? undefined,
    toZoneId: row.to_zone_id ?? undefined,
    supplierId: row.supplier_id ?? undefined,
    orderId: row.order_id ?? undefined,
  };
}

function mapSupplier(row: InventorySupplierRow): InventorySupplier {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    phone: row.phone ?? undefined,
    notes: row.notes ?? undefined,
    isActive: row.is_active,
  };
}

function mapCategory(row: InventoryCategoryRow): InventoryCategory {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.is_active,
  };
}

function mapZone(row: InventoryZoneRow): InventoryZone {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    description: row.description ?? undefined,
    isActive: row.is_active,
  };
}

function mapItemZone(row: InventoryItemZoneRow): InventoryItemZone {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    inventoryItemId: row.inventory_item_id,
    zoneId: row.zone_id,
    stock: Number(row.stock),
  };
}

function mapCount(row: InventoryCountRow, profiles: Map<string, ProfileRow>): InventoryCount {
  const openedProfile = row.opened_by ? profiles.get(row.opened_by) : undefined;
  const closedProfile = row.closed_by ? profiles.get(row.closed_by) : undefined;
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    status: row.status,
    openedBy: row.opened_by ?? undefined,
    openedByName: openedProfile?.full_name ?? openedProfile?.email ?? undefined,
    closedBy: row.closed_by ?? undefined,
    closedByName: closedProfile?.full_name ?? closedProfile?.email ?? undefined,
    openedAt: row.opened_at,
    closedAt: row.closed_at ?? undefined,
    notes: row.notes ?? undefined,
  };
}

function mapCountLine(row: InventoryCountLineRow, items: Map<string, InventoryItem>): InventoryCountLine {
  const item = items.get(row.inventory_item_id);
  return {
    id: row.id,
    inventoryCountId: row.inventory_count_id,
    restaurantId: row.restaurant_id,
    inventoryItemId: row.inventory_item_id,
    inventoryItemName: item?.name ?? "Insumo",
    expectedStock: Number(row.expected_stock),
    countedStock: Number(row.counted_stock),
    differenceStock: Number(row.difference_stock),
    notes: row.notes ?? undefined,
    createdAt: row.created_at,
  };
}

async function getProfiles(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) {
    return new Map<string, ProfileRow>();
  }

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id,full_name,email").in("id", uniqueIds);
  return new Map((data ?? []).map((profile) => [profile.id, profile as ProfileRow]));
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
      .limit(120);

    if (error || !data?.length) {
      return [];
    }

    const profileIds = (data as InventoryMovementRow[]).map((row) => row.created_by).filter(Boolean) as string[];
    const profiles = await getProfiles(profileIds);
    return data.map((row) => mapMovement(row as InventoryMovementRow, profiles));
  },

  async listCategories(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("inventory_categories").select("*").eq("restaurant_id", restaurantId).eq("is_active", true).order("name");

    if (error || !data?.length) {
      return [];
    }

    return data.map((row) => mapCategory(row as InventoryCategoryRow));
  },

  async listZones(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("inventory_zones").select("*").eq("restaurant_id", restaurantId).eq("is_active", true).order("name");

    if (error || !data?.length) {
      return [];
    }

    return data.map((row) => mapZone(row as InventoryZoneRow));
  },

  async listItemZones(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("inventory_item_zones").select("*").eq("restaurant_id", restaurantId);

    if (error || !data?.length) {
      return [];
    }

    return data.map((row) => mapItemZone(row as InventoryItemZoneRow));
  },

  async listSuppliers(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("inventory_suppliers").select("*").eq("restaurant_id", restaurantId).eq("is_active", true).order("name");

    if (error || !data?.length) {
      return [];
    }

    return data.map((row) => mapSupplier(row as InventorySupplierRow));
  },

  async listLots(restaurantId: string): Promise<InventoryLot[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const client = supabase as unknown as DynamicSupabaseClient;
    const [items, suppliers, { data, error }] = await Promise.all([
      this.listItems(restaurantId),
      this.listSuppliers(restaurantId),
      client
        .from("inventory_lots")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .eq("is_active", true)
        .gt("remaining_quantity", 0)
        .order("expires_on", { ascending: true, nullsFirst: false })
        .order("received_at", { ascending: true })
        .limit(80),
    ]);

    if (error || !data?.length) {
      return [];
    }

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const suppliersById = new Map(suppliers.map((supplier) => [supplier.id, supplier]));
    return (data as InventoryLotRow[]).map((row) => mapLot(row, itemsById, suppliersById));
  },

  async listBranchTransfers(restaurantId: string): Promise<InventoryBranchTransfer[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const client = supabase as unknown as DynamicSupabaseClient;
    const { data, error } = await client
      .from("inventory_branch_transfers")
      .select("*")
      .or(`from_restaurant_id.eq.${restaurantId},to_restaurant_id.eq.${restaurantId}`)
      .order("created_at", { ascending: false })
      .limit(40);

    if (error || !data?.length) {
      return [];
    }

    const rows = data as InventoryBranchTransferRow[];
    const restaurantIds = Array.from(new Set(rows.flatMap((row) => [row.from_restaurant_id, row.to_restaurant_id])));
    const { data: restaurants } = await supabase.from("restaurants").select("id,name").in("id", restaurantIds);
    const names = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant.name]));

    return rows.map((row) => ({
      id: row.id,
      fromRestaurantId: row.from_restaurant_id,
      toRestaurantId: row.to_restaurant_id,
      fromRestaurantName: names.get(row.from_restaurant_id) ?? "Sucursal origen",
      toRestaurantName: names.get(row.to_restaurant_id) ?? "Sucursal destino",
      fromInventoryItemId: row.from_inventory_item_id,
      toInventoryItemId: row.to_inventory_item_id,
      quantity: Number(row.quantity),
      reason: row.reason,
      status: row.status,
      createdAt: row.created_at,
    }));
  },

  async listBranchTransferTargets(restaurant: Restaurant): Promise<InventoryBranchTarget[]> {
    if (!hasSupabaseEnv() || (!restaurant.ownerUserId && !restaurant.ownerEmail) || !restaurant.city) {
      return [];
    }

    const admin = createAdminClient();
    if (!admin) {
      return [];
    }

    let query = admin
      .from("restaurants")
      .select("id,name,city,address,owner_user_id,owner_email,status,deleted_at")
      .neq("id", restaurant.id)
      .eq("status", "active")
      .is("deleted_at", null)
      .eq("city", restaurant.city);

    query = restaurant.ownerUserId ? query.eq("owner_user_id", restaurant.ownerUserId) : query.eq("owner_email", restaurant.ownerEmail ?? "");

    const { data: restaurants, error } = await query.order("name", { ascending: true });
    if (error || !restaurants?.length) {
      return [];
    }

    const restaurantIds = restaurants.map((item) => item.id);
    const { data: items } = await admin
      .from("inventory_items")
      .select("*")
      .in("restaurant_id", restaurantIds)
      .eq("is_active", true)
      .order("name", { ascending: true });

    const itemsByRestaurant = new Map<string, InventoryItem[]>();
    for (const item of (items ?? []) as InventoryItemRow[]) {
      const list = itemsByRestaurant.get(item.restaurant_id) ?? [];
      list.push(mapItem(item));
      itemsByRestaurant.set(item.restaurant_id, list);
    }

    return restaurants.map((branch) => ({
      restaurantId: branch.id,
      restaurantName: branch.name,
      city: branch.city ?? "",
      address: branch.address ?? undefined,
      items: itemsByRestaurant.get(branch.id) ?? [],
    }));
  },

  async listProductIngredients(restaurantId: string): Promise<ProductIngredient[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const [{ data: ingredients, error }, items, { data: products }] = await Promise.all([
      supabase.from("product_ingredients").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }),
      this.listItems(restaurantId),
      supabase.from("products").select("id,name").eq("restaurant_id", restaurantId),
    ]);

    if (error || !ingredients?.length) {
      return [];
    }

    const itemsById = new Map(items.map((item) => [item.id, item]));
    const productsById = new Map((products ?? []).map((product) => [product.id, product.name]));

    return (ingredients as ProductIngredientRow[]).map((row) => {
      const item = itemsById.get(row.inventory_item_id);
      return {
        id: row.id,
        restaurantId: row.restaurant_id,
        productId: row.product_id,
        productName: productsById.get(row.product_id) ?? "Producto",
        inventoryItemId: row.inventory_item_id,
        inventoryItemName: item?.name ?? "Insumo",
        inventoryItemUnit: item?.unit ?? "unidad",
        quantity: Number(row.quantity),
        wasteFactor: Number(row.waste_factor),
        notes: row.notes ?? undefined,
      };
    });
  },

  async listProductSuppliers(restaurantId: string): Promise<ProductSupplier[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const [{ data: links, error }, { data: products }, suppliers] = await Promise.all([
      supabase.from("product_suppliers").select("*").eq("restaurant_id", restaurantId).order("created_at", { ascending: false }),
      supabase.from("products").select("id,name").eq("restaurant_id", restaurantId),
      this.listSuppliers(restaurantId),
    ]);

    if (error || !links?.length) {
      return [];
    }

    const productNames = new Map((products ?? []).map((product) => [product.id, product.name]));
    const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));

    return (links as ProductSupplierRow[]).map((link) => ({
      id: link.id,
      restaurantId: link.restaurant_id,
      productId: link.product_id,
      productName: productNames.get(link.product_id) ?? "Producto",
      supplierId: link.supplier_id,
      supplierName: supplierNames.get(link.supplier_id) ?? "Proveedor",
      notes: link.notes ?? undefined,
    }));
  },

  async getOpenCount(restaurantId: string): Promise<InventoryCountReport | null> {
    const reports = await this.listCountReports(restaurantId, { status: "open", limit: 1 });
    return reports[0] ?? null;
  },

  async listCountReports(restaurantId: string, options: { status?: InventoryCount["status"]; limit?: number } = {}): Promise<InventoryCountReport[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    let query = supabase.from("inventory_counts").select("*").eq("restaurant_id", restaurantId).order("opened_at", { ascending: false }).limit(options.limit ?? 8);
    if (options.status) {
      query = query.eq("status", options.status);
    }

    const { data: counts, error } = await query;

    if (error || !counts?.length) {
      return [];
    }

    const countRows = counts as InventoryCountRow[];
    const countIds = countRows.map((count) => count.id);
    const profileIds = countRows.flatMap((count) => [count.opened_by, count.closed_by]).filter(Boolean) as string[];
    const [items, { data: lines }, profiles] = await Promise.all([
      this.listItems(restaurantId),
      supabase.from("inventory_count_lines").select("*").eq("restaurant_id", restaurantId).in("inventory_count_id", countIds).order("created_at", { ascending: false }),
      getProfiles(profileIds),
    ]);
    const itemsById = new Map(items.map((item) => [item.id, item]));
    const linesByCount = new Map<string, InventoryCountLine[]>();

    for (const line of ((lines ?? []) as InventoryCountLineRow[]).map((row) => mapCountLine(row, itemsById))) {
      const list = linesByCount.get(line.inventoryCountId) ?? [];
      list.push(line);
      linesByCount.set(line.inventoryCountId, list);
    }

    return countRows.map((row) => ({ ...mapCount(row, profiles), lines: linesByCount.get(row.id) ?? [] }));
  },
};
