import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

const movementCommitSchema = z.object({
  action: z.literal("movement"),
  restaurantId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  type: z.enum(["in", "out", "adjustment", "waste"]),
  quantity: z.coerce.number().positive().max(999999),
  reason: z.string().trim().min(2).max(120),
});

const createItemCommitSchema = z.object({
  action: z.literal("create_item"),
  restaurantId: z.string().uuid(),
  name: z.string().trim().min(2).max(100),
  itemKind: z.enum(["finished", "ingredient", "supply"]),
  unit: z.enum(["unidad", "kg", "g", "lb", "oz", "litro", "ml", "caja", "paquete"]),
  currentStock: z.coerce.number().positive().max(999999),
  minStock: z.coerce.number().nonnegative().max(999999),
  unitCost: z.coerce.number().nonnegative().max(999999),
  reason: z.string().trim().min(2).max(120),
});

const openCountCommitSchema = z.object({
  action: z.literal("open_count"),
  restaurantId: z.string().uuid(),
  reason: z.string().trim().min(2).max(120),
});

const countLineCommitSchema = z.object({
  action: z.literal("count_line"),
  restaurantId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  countedStock: z.coerce.number().nonnegative().max(999999),
  reason: z.string().trim().min(2).max(120),
});

const closeCountCommitSchema = z.object({
  action: z.literal("close_count"),
  restaurantId: z.string().uuid(),
  reason: z.string().trim().min(2).max(120),
});

const commitSchema = z.discriminatedUnion("action", [movementCommitSchema, createItemCommitSchema, openCountCommitSchema, countLineCommitSchema, closeCountCommitSchema]);

export async function POST(request: Request) {
  if (!hasSupabaseEnv()) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 500 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = commitSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-quick-add-commit" }, { status: 400 });
  }

  const access = await requireInventoryAccess(parsed.data.restaurantId);
  if (!access.ok) {
    return NextResponse.json({ error: access.error }, { status: access.status });
  }

  const { supabase } = access;

  if (parsed.data.action === "open_count") {
    const { data: countId, error } = await supabase.rpc("open_inventory_count_atomic", {
      p_restaurant_id: parsed.data.restaurantId,
      p_notes: `Agregado con IA: ${parsed.data.reason}`.slice(0, 180),
    });

    if (error) {
      return NextResponse.json({ error: normalizeInventoryError(error.message || error.code || "open-count-failed") }, { status: 400 });
    }

    revalidateInventory(parsed.data.restaurantId);
    return NextResponse.json({ ok: true, countId });
  }

  if (parsed.data.action === "count_line") {
    const { data: lineId, error } = await supabase.rpc("record_inventory_count_line_atomic", {
      p_restaurant_id: parsed.data.restaurantId,
      p_inventory_item_id: parsed.data.inventoryItemId,
      p_counted_stock: parsed.data.countedStock,
      p_notes: `Agregado con IA: ${parsed.data.reason}`.slice(0, 180),
    });

    if (error) {
      return NextResponse.json({ error: normalizeInventoryError(error.message || error.code || "count-line-failed") }, { status: 400 });
    }

    revalidateInventory(parsed.data.restaurantId);
    return NextResponse.json({ ok: true, lineId });
  }

  if (parsed.data.action === "close_count") {
    const { data: countId, error } = await supabase.rpc("close_inventory_count_atomic", {
      p_restaurant_id: parsed.data.restaurantId,
      p_notes: `Agregado con IA: ${parsed.data.reason}`.slice(0, 180),
    });

    if (error) {
      return NextResponse.json({ error: normalizeInventoryError(error.message || error.code || "close-count-failed") }, { status: 400 });
    }

    revalidateInventory(parsed.data.restaurantId);
    return NextResponse.json({ ok: true, countId });
  }

  if (parsed.data.action === "create_item") {
    if (access.role !== "superadmin" && access.role !== "restaurant_admin") {
      return NextResponse.json({ error: "inventory-create-admin-required" }, { status: 403 });
    }

    const { data: existing } = await supabase
      .from("inventory_items")
      .select("id,name")
      .eq("restaurant_id", parsed.data.restaurantId)
      .eq("is_active", true)
      .ilike("name", parsed.data.name)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ error: "inventory-item-already-exists" }, { status: 409 });
    }

    const { data: item, error: itemError } = await supabase
      .from("inventory_items")
      .insert({
        restaurant_id: parsed.data.restaurantId,
        name: parsed.data.name,
        item_kind: parsed.data.itemKind,
        unit: parsed.data.unit,
        current_stock: parsed.data.currentStock,
        min_stock: parsed.data.minStock,
        unit_cost: parsed.data.unitCost,
        is_active: true,
      })
      .select("id")
      .single();

    if (itemError || !item) {
      return NextResponse.json({ error: itemError?.code ?? "inventory-item-create-failed" }, { status: 400 });
    }

    await supabase.from("inventory_movements").insert({
      restaurant_id: parsed.data.restaurantId,
      inventory_item_id: item.id,
      type: "adjustment",
      quantity: parsed.data.currentStock,
      previous_stock: 0,
      new_stock: parsed.data.currentStock,
      reason: `Agregado con IA: ${parsed.data.reason}`.slice(0, 140),
      created_by: access.userId,
    });

    revalidateInventory(parsed.data.restaurantId);
    return NextResponse.json({ ok: true, itemId: item.id });
  }

  const { data: item } = await supabase
    .from("inventory_items")
    .select("id")
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.inventoryItemId)
    .eq("is_active", true)
    .maybeSingle();

  if (!item) {
    return NextResponse.json({ error: "inventory-item-not-found" }, { status: 404 });
  }

  const { data: movementId, error } = await supabase.rpc("register_inventory_movement_atomic", {
    p_restaurant_id: parsed.data.restaurantId,
    p_inventory_item_id: parsed.data.inventoryItemId,
    p_type: parsed.data.type,
    p_quantity: parsed.data.quantity,
    p_reason: `Agregado con IA: ${parsed.data.reason}`.slice(0, 140),
    p_from_zone_id: null,
    p_to_zone_id: null,
    p_supplier_id: null,
    p_lot_code: null,
    p_expires_on: null,
  });

  if (error) {
    return NextResponse.json({ error: normalizeInventoryError(error.message || error.code || "inventory-movement-failed") }, { status: 400 });
  }

  revalidateInventory(parsed.data.restaurantId);

  return NextResponse.json({ ok: true, movementId });
}

async function requireInventoryAccess(restaurantId: string) {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "unauthorized", status: 401 };
  }

  const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", userData.user.id).maybeSingle();
  if (profile?.global_role === "superadmin") {
    return { ok: true as const, supabase, userId: userData.user.id, role: "superadmin" as const };
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,status,deleted_at")
    .eq("id", restaurantId)
    .is("deleted_at", null)
    .eq("status", "active")
    .maybeSingle();

  if (!restaurant) {
    return { ok: false as const, error: "restaurant-not-found", status: 404 };
  }

  const { data: membership } = await supabase
    .from("restaurant_memberships")
    .select("role")
    .eq("restaurant_id", restaurantId)
    .eq("user_id", userData.user.id)
    .eq("is_active", true)
    .in("role", ["restaurant_admin", "cashier"])
    .maybeSingle();

  if (!membership) {
    return { ok: false as const, error: "inventory-access-denied", status: 403 };
  }

  return { ok: true as const, supabase, userId: userData.user.id, role: membership.role as "restaurant_admin" | "cashier" };
}

function normalizeInventoryError(message: string) {
  if (message.includes("negative-stock")) return "negative-stock";
  if (message.includes("negative-zone-stock")) return "negative-zone-stock";
  if (message.includes("item-not-found")) return "inventory-item-not-found";
  if (message.includes("no-open-count")) return "quick-add-open-count-required";
  if (message.includes("count-open")) return "quick-add-count-already-open";
  if (message.includes("access denied")) return "inventory-access-denied";
  return "inventory-movement-failed";
}

function revalidateInventory(restaurantId: string) {
  revalidatePath(`/admin/restaurantes/${restaurantId}/inventario`);
  revalidatePath(`/admin/restaurantes/${restaurantId}/dashboard`);
  revalidatePath("/dueno/inventario");
  revalidatePath("/dueno/sucursales");
}
