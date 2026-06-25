"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { uploadPublicImage } from "@/lib/supabase/storage";
import { toSlug } from "@/lib/utils/slug";
import type { ModuleKey, PlanKey } from "@/types/restaurant.types";
import type { OrderStatus } from "@/types/order.types";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

const createRestaurantSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  whatsapp: z.string().optional(),
  address: z.string().optional(),
  city: z.string().optional(),
  primaryColor: z.string().default("#1d8844"),
  secondaryColor: z.string().default("#f59e0b"),
  planKey: z.enum(["basic", "pro", "premium"]).default("basic"),
});

const createCategorySchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2),
  description: z.string().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

const createProductSchema = z.object({
  restaurantId: z.string().uuid(),
  categoryId: z.string().uuid().optional(),
  name: z.string().min(2),
  description: z.string().optional(),
  price: z.coerce.number().nonnegative(),
  imageUrl: z.string().url().optional().or(z.literal("")),
  isFeatured: z.coerce.boolean().default(false),
  trackStock: z.coerce.boolean().default(false),
  sortOrder: z.coerce.number().int().default(0),
});

const createTableSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(1),
  code: z.string().min(1),
  capacity: z.coerce.number().int().positive().default(2),
});

const updateOrderStatusSchema = z.object({
  restaurantId: z.string().min(1),
  restaurantSlug: z.string().optional(),
  orderId: z.string().uuid(),
  status: z.enum(["pending", "accepted", "preparing", "ready", "delivered", "cancelled"]),
  source: z.enum(["admin", "kitchen"]).default("admin"),
});

const paymentMethodSchema = z.enum(["cash", "qr", "bank_transfer", "card", "other"]);

const openCashSessionSchema = z.object({
  restaurantId: z.string().uuid(),
  openingAmount: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

const closeCashSessionSchema = z.object({
  restaurantId: z.string().uuid(),
  countedAmount: z.coerce.number().nonnegative(),
  notes: z.string().optional(),
});

const registerCashExpenseSchema = z.object({
  restaurantId: z.string().uuid(),
  amount: z.coerce.number().positive(),
  paymentMethod: paymentMethodSchema.default("cash"),
  description: z.string().min(2),
});

const chargeOrderSchema = z.object({
  restaurantId: z.string().uuid(),
  orderId: z.string().uuid(),
  paymentMethod: paymentMethodSchema.default("cash"),
});

const createPosSaleSchema = z.object({
  restaurantId: z.string().uuid(),
  productId: z.string().uuid(),
  quantity: z.coerce.number().int().positive().default(1),
  paymentMethod: paymentMethodSchema.default("cash"),
  customerName: z.string().optional(),
});

const createInventoryItemSchema = z.object({
  restaurantId: z.string().uuid(),
  name: z.string().min(2),
  unit: z.enum(["unidad", "kg", "g", "litro", "ml", "caja", "paquete"]),
  currentStock: z.coerce.number().nonnegative().default(0),
  minStock: z.coerce.number().nonnegative().default(0),
  unitCost: z.coerce.number().nonnegative().default(0),
});

const registerInventoryMovementSchema = z.object({
  restaurantId: z.string().uuid(),
  inventoryItemId: z.string().uuid(),
  type: z.enum(["in", "out", "adjustment", "waste", "sale_usage"]),
  quantity: z.coerce.number().nonnegative(),
  reason: z.string().min(2),
});

async function modulesForPlan(planKey: PlanKey): Promise<ModuleKey[]> {
  const supabase = await createClient();
  const { data: plan } = await supabase.from("subscription_plans").select("id").eq("key", planKey).maybeSingle();

  if (!plan) {
    return [];
  }

  const { data: modules } = await supabase.from("plan_modules").select("module_key").eq("plan_id", plan.id).eq("is_enabled", true);
  return (modules ?? []).map((module) => module.module_key as ModuleKey);
}

async function requireUser() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    redirect("/admin/login?error=session");
  }

  return { supabase, user: data.user };
}

async function getOpenCashSession(restaurantId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("cash_sessions")
    .select("*")
    .eq("restaurant_id", restaurantId)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data;
}

async function expectedAmountForSession(sessionId: string, openingAmount: number) {
  const supabase = await createClient();
  const { data: movements } = await supabase.from("cash_movements").select("type,amount").eq("cash_session_id", sessionId);

  return (movements ?? []).reduce((total, movement) => {
    const amount = Number(movement.amount);

    if (movement.type === "expense") {
      return total - amount;
    }

    if (movement.type === "opening" || movement.type === "closing") {
      return total;
    }

    return total + amount;
  }, openingAmount);
}

export async function signInAction(formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    redirect("/admin/login?error=invalid");
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    redirect("/admin/login?error=auth");
  }

  revalidatePath("/admin", "layout");
  redirect("/admin");
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/admin", "layout");
  redirect("/admin/login");
}

export async function createRestaurantAction(formData: FormData) {
  const parsed = createRestaurantSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug") || undefined,
    description: formData.get("description") || undefined,
    whatsapp: formData.get("whatsapp") || undefined,
    address: formData.get("address") || undefined,
    city: formData.get("city") || undefined,
    primaryColor: formData.get("primaryColor") || "#1d8844",
    secondaryColor: formData.get("secondaryColor") || "#f59e0b",
    planKey: formData.get("planKey") || "basic",
  });

  if (!parsed.success) {
    redirect("/admin/restaurantes/nuevo?error=invalid");
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();

  if (!userData.user) {
    redirect("/admin/login?error=session");
  }

  const slug = toSlug(parsed.data.slug || parsed.data.name);
  const logoUrl = await uploadPublicImage(formData.get("logoFile") as File | null, `restaurants/${slug}/identity`);
  const bannerUrl = await uploadPublicImage(formData.get("bannerFile") as File | null, `restaurants/${slug}/identity`);
  const { data: restaurant, error: restaurantError } = await supabase
    .from("restaurants")
    .insert({
      name: parsed.data.name,
      slug,
      description: parsed.data.description,
      status: "active",
      primary_color: parsed.data.primaryColor,
      secondary_color: parsed.data.secondaryColor,
      logo_url: logoUrl,
      banner_url: bannerUrl,
      whatsapp: parsed.data.whatsapp,
      address: parsed.data.address,
      city: parsed.data.city,
    })
    .select("id")
    .single();

  if (restaurantError || !restaurant) {
    redirect(`/admin/restaurantes/nuevo?error=${restaurantError?.code ?? "create"}`);
  }

  await supabase.from("restaurant_settings").insert({
    restaurant_id: restaurant.id,
    delivery_enabled: true,
    pickup_enabled: true,
    table_orders_enabled: true,
    inventory_enabled: parsed.data.planKey === "premium",
    cash_enabled: parsed.data.planKey !== "basic",
    kitchen_enabled: parsed.data.planKey !== "basic",
    delivery_fee: 0,
    min_order_amount: 0,
    currency: "BOB",
  });

  const { data: plan } = await supabase.from("subscription_plans").select("id").eq("key", parsed.data.planKey).maybeSingle();

  if (plan) {
    await supabase.from("restaurant_subscriptions").insert({
      restaurant_id: restaurant.id,
      plan_id: plan.id,
      status: "trialing",
    });
  }

  await supabase.from("restaurant_memberships").insert({
    restaurant_id: restaurant.id,
    user_id: userData.user.id,
    role: "restaurant_admin",
    is_active: true,
  });

  const moduleRows = (await modulesForPlan(parsed.data.planKey)).map((moduleKey) => ({
    restaurant_id: restaurant.id,
    module_key: moduleKey,
    is_enabled: true,
  }));

  if (moduleRows.length) {
    await supabase.from("module_settings").insert(moduleRows);
  }

  revalidatePath("/admin");
  revalidatePath("/admin/restaurantes");
  redirect(`/admin/restaurantes/${restaurant.id}/dashboard`);
}

export async function createCategoryAction(formData: FormData) {
  const parsed = createCategorySchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/categorias?error=invalid`);
  }

  const supabase = await createClient();
  const imageUrl = await uploadPublicImage(formData.get("imageFile") as File | null, `restaurants/${parsed.data.restaurantId}/categories`);
  const { error } = await supabase.from("categories").insert({
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    description: parsed.data.description,
    image_url: imageUrl,
    sort_order: parsed.data.sortOrder,
    is_active: true,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/categorias?error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/categorias`);
  revalidatePath(`/r`, "layout");
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/categorias?created=1`);
}

export async function createProductAction(formData: FormData) {
  const parsed = createProductSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    categoryId: formData.get("categoryId") || undefined,
    name: formData.get("name"),
    description: formData.get("description") || undefined,
    price: formData.get("price"),
    imageUrl: "",
    isFeatured: formData.get("isFeatured") === "on",
    trackStock: formData.get("trackStock") === "on",
    sortOrder: formData.get("sortOrder") || 0,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/productos?error=invalid`);
  }

  const supabase = await createClient();
  const imageUrl = await uploadPublicImage(formData.get("imageFile") as File | null, `restaurants/${parsed.data.restaurantId}/products`);
  const { error } = await supabase.from("products").insert({
    restaurant_id: parsed.data.restaurantId,
    category_id: parsed.data.categoryId,
    name: parsed.data.name,
    description: parsed.data.description,
    price: parsed.data.price,
    image_url: imageUrl,
    is_available: true,
    is_featured: parsed.data.isFeatured,
    track_stock: parsed.data.trackStock,
    sort_order: parsed.data.sortOrder,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/productos`);
  revalidatePath(`/r`, "layout");
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/productos?created=1`);
}

export async function createTableAction(formData: FormData) {
  const parsed = createTableSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    code: formData.get("code"),
    capacity: formData.get("capacity") || 2,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/mesas?error=invalid`);
  }

  const supabase = await createClient();
  const { error } = await supabase.from("tables").insert({
    restaurant_id: parsed.data.restaurantId,
    name: parsed.data.name,
    code: parsed.data.code.trim().toUpperCase(),
    status: "available",
    capacity: parsed.data.capacity,
    is_active: true,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/mesas?error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/mesas`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/mesas?created=1`);
}

export async function updateOrderStatusAction(formData: FormData) {
  const parsed = updateOrderStatusSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug") || undefined,
    orderId: formData.get("orderId"),
    status: formData.get("status"),
    source: formData.get("source") || "admin",
  });

  if (!parsed.success) {
    redirect("/admin?error=invalid-order-status");
  }

  const nextStatus = parsed.data.status as OrderStatus;
  const supabase = await createClient();
  await supabase.from("orders").update({ status: nextStatus }).eq("id", parsed.data.orderId).eq("restaurant_id", parsed.data.restaurantId);

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);
  if (parsed.data.restaurantSlug) {
    revalidatePath(`/cocina/${parsed.data.restaurantSlug}`);
  }

  if (parsed.data.source === "kitchen" && parsed.data.restaurantSlug) {
    redirect(`/cocina/${parsed.data.restaurantSlug}`);
  }

  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);
}

export async function openCashSessionAction(formData: FormData) {
  const parsed = openCashSessionSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    openingAmount: formData.get("openingAmount") || 0,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?error=invalid`);
  }

  const { supabase, user } = await requireUser();
  const currentSession = await getOpenCashSession(parsed.data.restaurantId);

  if (currentSession) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=session-open`);
  }

  const { data: session, error } = await supabase
    .from("cash_sessions")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      opened_by: user.id,
      opening_amount: parsed.data.openingAmount,
      expected_amount: parsed.data.openingAmount,
      notes: parsed.data.notes,
    })
    .select("id")
    .single();

  if (error || !session) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=${error?.code ?? "open-cash"}`);
  }

  await supabase.from("cash_movements").insert({
    restaurant_id: parsed.data.restaurantId,
    cash_session_id: session.id,
    type: "opening",
    payment_method: "cash",
    amount: parsed.data.openingAmount,
    description: "Apertura de caja",
    created_by: user.id,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?opened=1`);
}

export async function closeCashSessionAction(formData: FormData) {
  const parsed = closeCashSessionSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    countedAmount: formData.get("countedAmount") || 0,
    notes: formData.get("notes") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?error=invalid`);
  }

  const { supabase, user } = await requireUser();
  const session = await getOpenCashSession(parsed.data.restaurantId);

  if (!session) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=no-open-session`);
  }

  const expectedAmount = await expectedAmountForSession(session.id, Number(session.opening_amount));
  const differenceAmount = parsed.data.countedAmount - expectedAmount;
  const { error } = await supabase
    .from("cash_sessions")
    .update({
      closed_by: user.id,
      status: "closed",
      expected_amount: expectedAmount,
      counted_amount: parsed.data.countedAmount,
      difference_amount: differenceAmount,
      closed_at: new Date().toISOString(),
      notes: parsed.data.notes ?? session.notes,
    })
    .eq("id", session.id)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=${error.code}`);
  }

  await supabase.from("cash_movements").insert({
    restaurant_id: parsed.data.restaurantId,
    cash_session_id: session.id,
    type: "closing",
    payment_method: "cash",
    amount: parsed.data.countedAmount,
    description: "Cierre de caja",
    created_by: user.id,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?closed=1`);
}

export async function registerCashExpenseAction(formData: FormData) {
  const parsed = registerCashExpenseSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    amount: formData.get("amount"),
    paymentMethod: formData.get("paymentMethod") || "cash",
    description: formData.get("description"),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?error=invalid-expense`);
  }

  const { supabase, user } = await requireUser();
  const session = await getOpenCashSession(parsed.data.restaurantId);

  if (!session) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=no-open-session`);
  }

  const { error } = await supabase.from("cash_movements").insert({
    restaurant_id: parsed.data.restaurantId,
    cash_session_id: session.id,
    type: "expense",
    payment_method: parsed.data.paymentMethod,
    amount: parsed.data.amount,
    description: parsed.data.description,
    created_by: user.id,
  });

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=${error.code}`);
  }

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?expense=1`);
}

export async function chargeOrderAction(formData: FormData) {
  const parsed = chargeOrderSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    orderId: formData.get("orderId"),
    paymentMethod: formData.get("paymentMethod") || "cash",
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?error=invalid-charge`);
  }

  const { supabase, user } = await requireUser();
  const session = await getOpenCashSession(parsed.data.restaurantId);

  if (!session) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=no-open-session`);
  }

  const { data: order, error: orderError } = await supabase
    .from("orders")
    .select("id,total,payment_status,order_number")
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.orderId)
    .maybeSingle();

  if (orderError || !order) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=order-not-found`);
  }

  if (order.payment_status === "paid") {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=already-paid`);
  }

  const { error } = await supabase
    .from("orders")
    .update({
      payment_status: "paid",
      payment_method: parsed.data.paymentMethod,
    })
    .eq("id", order.id)
    .eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=${error.code}`);
  }

  await supabase.from("cash_movements").insert({
    restaurant_id: parsed.data.restaurantId,
    cash_session_id: session.id,
    order_id: order.id,
    type: "sale",
    payment_method: parsed.data.paymentMethod,
    amount: Number(order.total),
    description: `Cobro de pedido ${order.order_number}`,
    created_by: user.id,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?charged=1`);
}

export async function createPosSaleAction(formData: FormData) {
  const parsed = createPosSaleSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    productId: formData.get("productId"),
    quantity: formData.get("quantity") || 1,
    paymentMethod: formData.get("paymentMethod") || "cash",
    customerName: formData.get("customerName") || undefined,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/caja?error=invalid-pos-sale`);
  }

  const { supabase, user } = await requireUser();
  const session = await getOpenCashSession(parsed.data.restaurantId);

  if (!session) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=no-open-session`);
  }

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id,name,price,is_available")
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.productId)
    .maybeSingle();

  if (productError || !product || !product.is_available) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=product-not-found`);
  }

  const subtotal = Number(product.price) * parsed.data.quantity;
  const orderNumber = `POS-${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const { data: order, error: orderError } = await supabase
    .from("orders")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      order_number: orderNumber,
      customer_name: parsed.data.customerName,
      order_type: "pos",
      status: "delivered",
      payment_status: "paid",
      payment_method: parsed.data.paymentMethod,
      subtotal,
      total: subtotal,
    })
    .select("id")
    .single();

  if (orderError || !order) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?error=${orderError?.code ?? "pos-order"}`);
  }

  await supabase.from("order_items").insert({
    order_id: order.id,
    product_id: product.id,
    product_name: product.name,
    unit_price: Number(product.price),
    quantity: parsed.data.quantity,
    subtotal,
  });

  await supabase.from("cash_movements").insert({
    restaurant_id: parsed.data.restaurantId,
    cash_session_id: session.id,
    order_id: order.id,
    type: "sale",
    payment_method: parsed.data.paymentMethod,
    amount: subtotal,
    description: `Venta POS ${product.name}`,
    created_by: user.id,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/caja`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/pedidos`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/caja?pos=1`);
}

export async function createInventoryItemAction(formData: FormData) {
  const parsed = createInventoryItemSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    name: formData.get("name"),
    unit: formData.get("unit") || "unidad",
    currentStock: formData.get("currentStock") || 0,
    minStock: formData.get("minStock") || 0,
    unitCost: formData.get("unitCost") || 0,
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?error=invalid-item`);
  }

  const { supabase, user } = await requireUser();
  const { data: item, error } = await supabase
    .from("inventory_items")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      name: parsed.data.name,
      unit: parsed.data.unit,
      current_stock: parsed.data.currentStock,
      min_stock: parsed.data.minStock,
      unit_cost: parsed.data.unitCost,
      is_active: true,
    })
    .select("id")
    .single();

  if (error || !item) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?error=${error?.code ?? "create-item"}`);
  }

  await supabase.from("inventory_movements").insert({
    restaurant_id: parsed.data.restaurantId,
    inventory_item_id: item.id,
    type: "adjustment",
    quantity: parsed.data.currentStock,
    previous_stock: 0,
    new_stock: parsed.data.currentStock,
    reason: "Stock inicial",
    created_by: user.id,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?created=1`);
}

export async function registerInventoryMovementAction(formData: FormData) {
  const parsed = registerInventoryMovementSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    inventoryItemId: formData.get("inventoryItemId"),
    type: formData.get("type"),
    quantity: formData.get("quantity"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    redirect(`/admin/restaurantes/${formData.get("restaurantId")}/inventario?error=invalid-movement`);
  }

  const { supabase, user } = await requireUser();
  const { data: item, error: itemError } = await supabase
    .from("inventory_items")
    .select("id,current_stock")
    .eq("restaurant_id", parsed.data.restaurantId)
    .eq("id", parsed.data.inventoryItemId)
    .maybeSingle();

  if (itemError || !item) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?error=item-not-found`);
  }

  const previousStock = Number(item.current_stock);
  const newStock =
    parsed.data.type === "in"
      ? previousStock + parsed.data.quantity
      : parsed.data.type === "adjustment"
        ? parsed.data.quantity
        : previousStock - parsed.data.quantity;

  if (newStock < 0) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?error=negative-stock`);
  }

  const { error } = await supabase.from("inventory_items").update({ current_stock: newStock }).eq("id", item.id).eq("restaurant_id", parsed.data.restaurantId);

  if (error) {
    redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?error=${error.code}`);
  }

  await supabase.from("inventory_movements").insert({
    restaurant_id: parsed.data.restaurantId,
    inventory_item_id: item.id,
    type: parsed.data.type,
    quantity: parsed.data.quantity,
    previous_stock: previousStock,
    new_stock: newStock,
    reason: parsed.data.reason,
    created_by: user.id,
  });

  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/inventario`);
  revalidatePath(`/admin/restaurantes/${parsed.data.restaurantId}/dashboard`);
  redirect(`/admin/restaurantes/${parsed.data.restaurantId}/inventario?movement=1`);
}
