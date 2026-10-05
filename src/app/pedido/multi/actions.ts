"use server";

import { after } from "next/server";
import { redirect } from "next/navigation";
import { z } from "zod";
import { forecastMultisiteKitchenReadyIn, type MultisiteKitchenSnapshot } from "@/lib/group-orders/kitchen-forecast";
import { planMultisiteGroupOrder } from "@/lib/group-orders/multisite-planner";
import { sendRestaurantNewOrderPush } from "@/lib/services/mobile-push.service";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { createAdminClient } from "@/lib/supabase/admin";
import { DEFAULT_RESTAURANT_TIME_ZONE, formatLocalDateTimeInput, isLocalDateTimeWithinBusinessHours } from "@/lib/utils/business-hours";
import type { Json } from "@/types/database.types";

const MAX_RESTAURANTS = 3;
const MAX_CART_ITEMS = 100;

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  optionIds: z.array(z.string().uuid()).max(20).optional().default([]),
  quantity: z.coerce.number().int().positive().max(30),
  notes: z.string().trim().max(240).optional(),
});

const multiOrderSchema = z.object({
  requestId: z.string().uuid(),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(4).max(40),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerAddress: z.string().trim().min(4).max(260),
  deliveryAddressDetail: z.string().trim().max(180).optional(),
  deliveryLatitude: z.coerce.number().min(-90).max(90),
  deliveryLongitude: z.coerce.number().min(-180).max(180),
  deliveryMapsUrl: z.string().trim().max(500).optional(),
  riderFee: z.coerce.number().nonnegative().max(500).optional(),
  notes: z.string().trim().max(500).optional(),
  carts: z
    .array(
      z.object({
        restaurantId: z.string().uuid(),
        restaurantSlug: z.string().min(1).max(160),
        items: z.array(cartItemSchema).min(1).max(MAX_CART_ITEMS),
      }),
    )
    .min(2)
    .max(MAX_RESTAURANTS),
});

type CartItem = z.infer<typeof cartItemSchema>;

type PriceProduct = {
  id: string;
  name: string;
  price: number;
  prep_minutes: number;
  is_available: boolean;
};

type PriceVariant = { id: string; product_id: string; name: string; price_delta: number; is_active: boolean };
type PriceGroup = { id: string; product_id: string; min_choices: number; max_choices: number; is_required: boolean; is_active: boolean };
type PriceOption = { id: string; product_id: string; option_group_id: string; name: string; price_delta: number; is_active: boolean };

type ResolvedItem = {
  productId: string;
  variantId?: string;
  optionIds: string[];
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  notes?: string;
  prepMinutes: number;
};

function failPath(error: string) {
  return `/pedido/multi?error=${encodeURIComponent(error)}`;
}

function countByRestaurant(rows: Array<{ restaurant_id: string }>) {
  const counts = new Map<string, number>();
  for (const row of rows) counts.set(row.restaurant_id, (counts.get(row.restaurant_id) ?? 0) + 1);
  return counts;
}

async function resolveCart(admin: NonNullable<ReturnType<typeof createAdminClient>>, restaurantId: string, cart: CartItem[]): Promise<ResolvedItem[]> {
  const productIds = [...new Set(cart.map((item) => item.productId))];
  const optionIds = [...new Set(cart.flatMap((item) => item.optionIds))];
  const [{ data: products }, { data: variants }, { data: groups }, { data: options }] = await Promise.all([
    admin.from("products").select("id,name,price,prep_minutes,is_available").eq("restaurant_id", restaurantId).in("id", productIds),
    admin.from("product_variants").select("id,product_id,name,price_delta,is_active").eq("restaurant_id", restaurantId).in("product_id", productIds),
    admin.from("product_option_groups").select("id,product_id,min_choices,max_choices,is_required,is_active").eq("restaurant_id", restaurantId).in("product_id", productIds),
    optionIds.length
      ? admin.from("product_options").select("id,product_id,option_group_id,name,price_delta,is_active").eq("restaurant_id", restaurantId).in("id", optionIds)
      : Promise.resolve({ data: [] }),
  ]);

  const productById = new Map((products ?? []).map((row) => [row.id, row as PriceProduct]));
  const variantById = new Map((variants ?? []).map((row) => [row.id, row as PriceVariant]));
  const optionById = new Map((options ?? []).map((row) => [row.id, row as PriceOption]));
  const groupsByProduct = new Map<string, PriceGroup[]>();
  const variantsByProduct = new Map<string, PriceVariant[]>();
  for (const row of (groups ?? []) as PriceGroup[]) {
    groupsByProduct.set(row.product_id, [...(groupsByProduct.get(row.product_id) ?? []), row]);
  }
  for (const row of (variants ?? []) as PriceVariant[]) {
    if (row.is_active) variantsByProduct.set(row.product_id, [...(variantsByProduct.get(row.product_id) ?? []), row]);
  }

  return cart.map((item) => {
    const product = productById.get(item.productId);
    if (!product?.is_available) throw new Error("product-not-found");
    if (!item.variantId && (variantsByProduct.get(item.productId)?.length ?? 0) > 0) throw new Error("product-configuration");

    const variant = item.variantId ? variantById.get(item.variantId) : undefined;
    if (item.variantId && (!variant?.is_active || variant.product_id !== item.productId)) throw new Error("product-configuration");

    const selectedOptions = item.optionIds.map((id) => optionById.get(id));
    if (selectedOptions.some((option) => !option?.is_active || option.product_id !== item.productId)) throw new Error("product-configuration");
    const activeOptions = selectedOptions.filter((option): option is PriceOption => Boolean(option));
    const selectedByGroup = new Map<string, number>();
    for (const option of activeOptions) selectedByGroup.set(option.option_group_id, (selectedByGroup.get(option.option_group_id) ?? 0) + 1);
    for (const group of groupsByProduct.get(item.productId) ?? []) {
      if (!group.is_active) continue;
      const selectedCount = selectedByGroup.get(group.id) ?? 0;
      if (selectedCount < group.min_choices || selectedCount > group.max_choices || (group.is_required && selectedCount === 0)) {
        throw new Error("product-configuration");
      }
    }

    const unitPrice = Number(product.price) + Number(variant?.price_delta ?? 0) + activeOptions.reduce((sum, option) => sum + Number(option.price_delta), 0);
    const details = [variant?.name, ...activeOptions.map((option) => option.name), item.notes].filter(Boolean).join(" | ");
    return {
      productId: product.id,
      variantId: variant?.id,
      optionIds: activeOptions.map((option) => option.id),
      name: variant ? `${product.name} - ${variant.name}` : product.name,
      price: Number(unitPrice.toFixed(2)),
      quantity: item.quantity,
      subtotal: Number((unitPrice * item.quantity).toFixed(2)),
      notes: details || undefined,
      prepMinutes: Math.max(1, Number(product.prep_minutes ?? 0) || 12),
    };
  });
}

export async function createPublicMultisiteOrderAction(formData: FormData) {
  let carts: unknown;
  try {
    carts = JSON.parse(String(formData.get("cartsJson") ?? "[]"));
  } catch {
    redirect(failPath("invalid-cart"));
  }

  const parsed = multiOrderSchema.safeParse({
    requestId: formData.get("requestId") || crypto.randomUUID(),
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone"),
    customerEmail: formData.get("customerEmail") || undefined,
    customerAddress: formData.get("customerAddress"),
    deliveryAddressDetail: formData.get("deliveryAddressDetail") || undefined,
    deliveryLatitude: formData.get("deliveryLatitude"),
    deliveryLongitude: formData.get("deliveryLongitude"),
    deliveryMapsUrl: formData.get("deliveryMapsUrl") || undefined,
    riderFee: formData.get("riderFee") || undefined,
    notes: formData.get("notes") || undefined,
    carts,
  });
  if (!parsed.success) redirect(failPath("invalid"));

  const duplicateRestaurant = new Set(parsed.data.carts.map((cart) => cart.restaurantId)).size !== parsed.data.carts.length;
  const itemCount = parsed.data.carts.reduce((sum, cart) => sum + cart.items.length, 0);
  if (duplicateRestaurant || itemCount > MAX_CART_ITEMS) redirect(failPath("invalid-cart"));

  const rateLimit = await consumeRateLimit({
    scope: "public-multisite-order",
    identity: `${parsed.data.customerPhone}:${parsed.data.carts.map((cart) => cart.restaurantId).sort().join(",")}`,
    maxAttempts: 5,
    windowSeconds: 10 * 60,
    blockSeconds: 15 * 60,
  });
  if (!rateLimit.allowed) redirect(failPath("rate-limit"));

  const admin = createAdminClient();
  if (!admin) redirect(failPath("service-role-required"));

  const restaurantIds = parsed.data.carts.map((cart) => cart.restaurantId);
  const recentThreshold = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const [restaurantsResult, settingsResult, businessHoursResult, cashResult, queueResult, activeResult, recentResult] = await Promise.all([
    admin.from("restaurants").select("id,slug,name,city,latitude,longitude,status,deleted_at").in("id", restaurantIds),
    admin.from("restaurant_settings").select("restaurant_id,delivery_enabled,min_order_amount").in("restaurant_id", restaurantIds),
    admin.from("business_hours").select("restaurant_id,day_of_week,opens_at,closes_at,is_closed").in("restaurant_id", restaurantIds),
    admin.from("cash_sessions").select("restaurant_id").in("restaurant_id", restaurantIds).eq("status", "open"),
    admin.from("restaurant_queue_settings").select("restaurant_id,queue_enabled,base_prep_minutes,kitchen_capacity,rush_multiplier").in("restaurant_id", restaurantIds),
    admin.from("orders").select("restaurant_id,status").in("restaurant_id", restaurantIds).in("status", ["pending", "accepted", "preparing"]),
    admin.from("orders").select("restaurant_id").in("restaurant_id", restaurantIds).neq("status", "cancelled").gte("created_at", recentThreshold),
  ]);
  const restaurantById = new Map((restaurantsResult.data ?? []).map((row) => [row.id, row]));
  const settingByRestaurant = new Map((settingsResult.data ?? []).map((row) => [row.restaurant_id, row]));
  const hoursByRestaurant = new Map<string, Array<{ dayOfWeek: number; opensAt: string; closesAt: string; isClosed: boolean }>>();
  for (const row of businessHoursResult.data ?? []) {
    hoursByRestaurant.set(row.restaurant_id, [...(hoursByRestaurant.get(row.restaurant_id) ?? []), {
      dayOfWeek: row.day_of_week,
      opensAt: row.opens_at ?? "",
      closesAt: row.closes_at ?? "",
      isClosed: row.is_closed,
    }]);
  }
  const cashRestaurantIds = new Set((cashResult.data ?? []).map((row) => row.restaurant_id));
  const queueByRestaurant = new Map((queueResult.data ?? []).map((row) => [row.restaurant_id, row]));
  const activeByRestaurant = countByRestaurant(activeResult.data ?? []);
  const preparingByRestaurant = countByRestaurant((activeResult.data ?? []).filter((row) => row.status === "preparing"));
  const recentByRestaurant = countByRestaurant(recentResult.data ?? []);
  const nowLocalInput = formatLocalDateTimeInput(new Date(), DEFAULT_RESTAURANT_TIME_ZONE);

  const resolvedCarts: Array<{ cart: (typeof parsed.data.carts)[number]; restaurant: NonNullable<typeof restaurantsResult.data>[number]; items: ResolvedItem[]; snapshot: MultisiteKitchenSnapshot }> = [];
  try {
    for (const cart of parsed.data.carts) {
      const restaurant = restaurantById.get(cart.restaurantId);
      const settings = settingByRestaurant.get(cart.restaurantId);
      if (!restaurant || restaurant.slug !== cart.restaurantSlug || restaurant.status !== "active" || restaurant.deleted_at || !settings?.delivery_enabled) {
        throw new Error("restaurant-unavailable");
      }
      if (restaurant.latitude == null || restaurant.longitude == null) throw new Error("restaurant-location");
      if (!cashRestaurantIds.has(cart.restaurantId)) throw new Error("no-open-cash");
      if (!isLocalDateTimeWithinBusinessHours(nowLocalInput, hoursByRestaurant.get(cart.restaurantId) ?? [])) throw new Error("outside-hours");
      const items = await resolveCart(admin, cart.restaurantId, cart.items);
      const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
      if (subtotal < Number(settings.min_order_amount ?? 0)) throw new Error("minimum");
      const queue = queueByRestaurant.get(cart.restaurantId);
      resolvedCarts.push({
        cart,
        restaurant,
        items,
        snapshot: {
          queueEnabled: queue?.queue_enabled ?? true,
          basePrepMinutes: Number(queue?.base_prep_minutes ?? 16),
          kitchenCapacity: Number(queue?.kitchen_capacity ?? 3),
          rushMultiplier: Number(queue?.rush_multiplier ?? 1.25),
          activeOrders: activeByRestaurant.get(cart.restaurantId) ?? 0,
          preparingOrders: preparingByRestaurant.get(cart.restaurantId) ?? 0,
          recentOrders: recentByRestaurant.get(cart.restaurantId) ?? 0,
        },
      });
    }
  } catch (error) {
    redirect(failPath(error instanceof Error ? error.message : "invalid-cart"));
  }

  const plan = planMultisiteGroupOrder({
    destination: { latitude: parsed.data.deliveryLatitude, longitude: parsed.data.deliveryLongitude },
    candidates: resolvedCarts.map(({ restaurant, items, snapshot }) => {
      const prepTimeMinutes = Math.max(...items.map((item) => item.prepMinutes));
      const forecast = forecastMultisiteKitchenReadyIn(snapshot, prepTimeMinutes);
      return {
        id: restaurant.id,
        restaurantId: restaurant.id,
        name: restaurant.name,
        location: { latitude: Number(restaurant.latitude), longitude: Number(restaurant.longitude) },
        prepTimeMinutes,
        queueDelayMinutes: forecast.queueDelayMinutes,
        queueConfidence: forecast.confidence,
        kitchenSnapshot: snapshot,
      };
    }),
    radiusKm: 3,
    maxPickups: MAX_RESTAURANTS,
  });
  if (!plan.feasible) redirect(failPath("route-unavailable"));

  const requestedRiderFee = parsed.data.riderFee ?? plan.riderPricing.suggestedRiderFee;
  if (requestedRiderFee < plan.riderPricing.customerMinimumFee || requestedRiderFee > plan.riderPricing.customerMaximumFee) {
    redirect(failPath("rider-fee"));
  }
  const subtotal = resolvedCarts.reduce((sum, entry) => sum + entry.items.reduce((itemSum, item) => itemSum + item.subtotal, 0), 0);
  const total = Number((subtotal + requestedRiderFee).toFixed(2));
  const stopByRestaurant = new Map(plan.stops.map((stop, index) => [stop.restaurantId ?? stop.id, { stop, position: index + 1 }]));
  const orderPrefix = `M-${parsed.data.requestId.replaceAll("-", "").slice(0, 8).toUpperCase()}`;

  const { data, error } = await admin.rpc("create_public_multisite_order_transaction", {
    p_request_id: parsed.data.requestId,
    p_order: {
      customer_name: parsed.data.customerName,
      customer_phone: parsed.data.customerPhone,
      customer_email: parsed.data.customerEmail || null,
      customer_address: parsed.data.customerAddress,
      delivery_address_detail: parsed.data.deliveryAddressDetail || null,
      delivery_latitude: parsed.data.deliveryLatitude,
      delivery_longitude: parsed.data.deliveryLongitude,
      delivery_maps_url: parsed.data.deliveryMapsUrl || null,
      payment_method: "cash",
      subtotal: Number(subtotal.toFixed(2)),
      delivery_fee: Number(requestedRiderFee.toFixed(2)),
      total,
      rider_fee_suggested: plan.riderPricing.suggestedRiderFee,
      rider_fee_minimum: plan.riderPricing.customerMinimumFee,
      rider_fee_maximum: plan.riderPricing.customerMaximumFee,
      route_plan: plan,
      notes: parsed.data.notes || null,
    } as Json,
    p_children: resolvedCarts.map(({ cart, restaurant, items }) => {
      const route = stopByRestaurant.get(restaurant.id);
      if (!route) throw new Error("route-unavailable");
      return {
        restaurant_id: restaurant.id,
        order_number: `${orderPrefix}-${route.position}`,
        pickup_position: route.position,
        release_delay_minutes: route.stop.orderReleaseDelayMinutes,
        estimated_ready_minutes: route.stop.estimatedReadyInMinutes,
        distance_to_destination_km: route.stop.distanceToDestinationKm,
        subtotal: Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2)),
        items: items.map((item) => ({
          product_id: item.productId,
          product_name: item.name,
          variant_id: item.variantId ?? null,
          option_ids: item.optionIds,
          unit_price: item.price,
          quantity: item.quantity,
          subtotal: item.subtotal,
          notes: item.notes ?? null,
        })),
        notes: `Carrito de ${cart.restaurantSlug}`,
      };
    }) as Json,
  });

  const created = data?.[0];
  if (!created) {
    const errorKey = error?.message.includes("no-open-cash") ? "no-open-cash" : error?.message.includes("invalid-multisite") ? "create" : "create";
    redirect(failPath(errorKey));
  }

  after(async () => {
    const { data: children } = await admin.from("multisite_order_children").select("order_id").eq("multisite_order_id", created.id);
    await Promise.all((children ?? []).map((child) => sendRestaurantNewOrderPush(child.order_id).catch(() => null)));
  });
  redirect(`/pedido/multi/${created.id}?token=${encodeURIComponent(created.tracking_token)}`);
}
