import { NextResponse } from "next/server";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { announcementService } from "@/lib/services/announcement.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveDeliveryPolicy } from "@/lib/delivery-policy";
import { DEFAULT_RESTAURANT_TIME_ZONE, formatLocalDateTimeInput, isLocalDateTimeWithinBusinessHours } from "@/lib/utils/business-hours";
import { normalizeQrPaymentUrl } from "@/lib/utils/qr-payment";
import type { Database } from "@/types/database.types";
import type { BusinessHour, RestaurantDeliveryZone } from "@/types/restaurant.types";

type SupabaseDatabaseClient = SupabaseClient<Database>;

export const groupCollectModeSchema = z.enum(["host_collects", "restaurant_collects", "internal_cash"]);
export const groupPaymentStatusSchema = z.enum(["pending", "paid_qr", "cash_pending", "covered_by_host", "excluded"]);

export const groupItemSchema = z.object({
  participantToken: z.string().min(12),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  optionIds: z.array(z.string().uuid()).optional().default([]),
  notes: z.string().trim().max(240).optional(),
});

export const submitGroupSchema = z.object({
  hostAccessToken: z.string().min(12),
  restaurantSlug: z.string().min(1),
  orderType: z.enum(["delivery", "pickup"]),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().max(40).optional(),
  customerAddress: z.string().trim().max(260).optional(),
  deliveryAddressDetail: z.string().trim().max(180).optional(),
  deliveryLatitude: z.coerce.number().min(-90).max(90).optional(),
  deliveryLongitude: z.coerce.number().min(-180).max(180).optional(),
  deliveryMapsUrl: z.string().trim().max(500).optional(),
  deliveryCity: z.string().trim().max(120).optional(),
  paymentMethod: z.enum(["cash", "qr", "bank_transfer", "card"]).default("cash"),
  paymentReceiptUrl: z.string().trim().max(700).optional(),
});

type ParsedCartItem = {
  productId: string;
  variantId?: string;
  optionIds: string[];
  quantity: number;
  notes?: string;
};

type ResolvedCartItem = {
  productId: string;
  variantId?: string;
  optionIds: string[];
  name: string;
  price: number;
  quantity: number;
  subtotal: number;
  notes?: string;
};

type ProductPriceRow = {
  id: string;
  name: string;
  price: number;
  is_available: boolean;
  available_from: string | null;
  available_until: string | null;
  available_days: number[] | null;
  available_start_time: string | null;
  available_end_time: string | null;
};

type VariantPriceRow = {
  id: string;
  product_id: string;
  name: string;
  price_delta: number;
  is_active: boolean;
};

type OptionGroupPriceRow = {
  id: string;
  product_id: string;
  min_choices: number;
  max_choices: number;
  is_required: boolean;
  is_active: boolean;
};

type OptionPriceRow = {
  id: string;
  product_id: string;
  option_group_id: string;
  name: string;
  price_delta: number;
  is_active: boolean;
};

type PublicOrderSettings = {
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  delivery_fee: number;
  delivery_qr_prepayment_enabled?: boolean | null;
  far_delivery_distance_km: number;
  free_delivery_from: number | null;
  min_order_amount: number;
  qr_payment_url: string | null;
};

function token(length: number) {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(values, (value) => alphabet[value % alphabet.length]).join("");
}

export function createShortToken(length = 12) {
  return token(length);
}

export function createSecretToken() {
  return `${token(24)}${crypto.randomUUID().replaceAll("-", "")}`;
}

export function mobileGroupError(error: string, status = 400) {
  return NextResponse.json({ error }, { status });
}

export function paymentMethodForStatus(status: z.infer<typeof groupPaymentStatusSchema>) {
  if (status === "paid_qr") return "qr";
  if (status === "cash_pending") return "cash";
  if (status === "pending") return null;
  return "other";
}

export function participantPaymentLabel(status: string) {
  if (status === "paid_qr") return "Pago QR confirmado";
  if (status === "cash_pending") return "Pagara en efectivo";
  if (status === "covered_by_host") return "Cubierto por host";
  if (status === "excluded") return "Excluido";
  return "Pendiente";
}

export function collectModeLabel(mode: string) {
  if (mode === "host_collects") return "Todos pagan al host";
  if (mode === "restaurant_collects") return "Cada persona paga al restaurante";
  return "Pago interno/efectivo";
}

function boliviaScheduleParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    timeZone: "America/La_Paz",
    weekday: "short",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const weekdayIndex: Record<string, number> = { Fri: 5, Mon: 1, Sat: 6, Sun: 0, Thu: 4, Tue: 2, Wed: 3 };
  return { dayOfWeek: weekdayIndex[weekday] ?? 0, minutes: hour * 60 + minute };
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function isProductCurrentlyOrderable(product: ProductPriceRow, date = new Date()) {
  if (!product.is_available) return false;
  const nowTime = date.getTime();
  if (product.available_from && new Date(product.available_from).getTime() > nowTime) return false;
  if (product.available_until && new Date(product.available_until).getTime() < nowTime) return false;
  const { dayOfWeek, minutes } = boliviaScheduleParts(date);
  if (product.available_days?.length && !product.available_days.includes(dayOfWeek)) return false;
  const start = timeToMinutes(product.available_start_time);
  const end = timeToMinutes(product.available_end_time);
  if (start != null && minutes < start) return false;
  if (end != null && minutes > end) return false;
  return true;
}

export async function getMobileGroupAdmin() {
  const supabase = createAdminClient();
  return supabase;
}

export async function buildGroupOrderPayload({
  hostAccessToken,
  participantToken,
  sessionToken,
  supabase,
}: {
  hostAccessToken?: string;
  participantToken?: string;
  sessionToken: string;
  supabase: SupabaseDatabaseClient;
}) {
  const { data: session } = await supabase
    .from("group_order_sessions")
    .select("*")
    .eq("public_token", sessionToken)
    .maybeSingle();

  if (!session) return null;

  const [{ data: restaurant }, { data: participants }, { data: items }] = await Promise.all([
    supabase
      .from("restaurants")
      .select("id,name,slug,city,address,business_type,logo_url,banner_url,latitude,longitude")
      .eq("id", session.restaurant_id)
      .maybeSingle(),
    supabase.from("group_order_participants").select("*").eq("session_id", session.id).order("created_at", { ascending: true }),
    supabase.from("group_order_items").select("*").eq("session_id", session.id).order("created_at", { ascending: true }),
  ]);

  const currentParticipant = participantToken
    ? (participants ?? []).find((participant) => participant.participant_token === participantToken)
    : null;
  const isHost = Boolean(hostAccessToken && session.host_access_token === hostAccessToken);

  return {
    currentParticipantId: currentParticipant?.id ?? null,
    isHost,
    items: (items ?? []).map((item) => ({
      id: item.id,
      participantId: item.participant_id,
      productId: item.product_id,
      productName: item.product_name,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
      notes: item.notes ?? "",
    })),
    participants: (participants ?? []).map((participant) => ({
      id: participant.id,
      displayName: participant.display_name,
      phone: participant.phone ?? "",
      role: participant.role,
      paymentStatus: participant.payment_status,
      paymentMethod: participant.payment_method ?? "",
      paymentNote: participant.payment_note ?? "",
      paymentReceiptUrl: participant.payment_receipt_url ?? "",
    })),
    restaurant,
    session: {
      id: session.id,
      publicToken: session.public_token,
      hostName: session.host_name,
      hostPhone: session.host_phone ?? "",
      collectMode: session.collect_mode,
      hostQrUrl: session.host_qr_url ?? "",
      status: session.status,
      submittedOrderId: session.submitted_order_id ?? "",
      subtotal: Number(session.subtotal),
      deliveryFee: Number(session.delivery_fee),
      total: Number(session.total),
      expiresAt: session.expires_at,
      createdAt: session.created_at,
    },
  };
}

export async function resolveGroupCartItems(supabase: SupabaseDatabaseClient, restaurantId: string, cart: ParsedCartItem[]) {
  const productIds = Array.from(new Set(cart.map((item) => item.productId)));
  const optionIds = Array.from(new Set(cart.flatMap((item) => item.optionIds ?? [])));

  const [{ data: productRows, error: productsError }, { data: variantRows }, { data: groupRows }, { data: optionRows }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,price,is_available,available_from,available_until,available_days,available_start_time,available_end_time")
      .eq("restaurant_id", restaurantId)
      .in("id", productIds),
    supabase.from("product_variants").select("id,product_id,name,price_delta,is_active").eq("restaurant_id", restaurantId).in("product_id", productIds),
    supabase.from("product_option_groups").select("id,product_id,min_choices,max_choices,is_required,is_active").eq("restaurant_id", restaurantId).in("product_id", productIds),
    optionIds.length
      ? supabase.from("product_options").select("id,product_id,option_group_id,name,price_delta,is_active").eq("restaurant_id", restaurantId).in("id", optionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsError || !productRows?.length) throw new Error("product-not-found");

  const products = new Map((productRows as ProductPriceRow[]).map((product) => [product.id, product]));
  const variants = new Map(((variantRows ?? []) as VariantPriceRow[]).map((variant) => [variant.id, variant]));
  const activeVariantsByProduct = new Map<string, VariantPriceRow[]>();
  for (const variant of (variantRows ?? []) as VariantPriceRow[]) {
    if (!variant.is_active) continue;
    const current = activeVariantsByProduct.get(variant.product_id) ?? [];
    current.push(variant);
    activeVariantsByProduct.set(variant.product_id, current);
  }
  const options = new Map(((optionRows ?? []) as OptionPriceRow[]).map((option) => [option.id, option]));
  const groupsByProduct = new Map<string, OptionGroupPriceRow[]>();
  for (const group of (groupRows ?? []) as OptionGroupPriceRow[]) {
    const groups = groupsByProduct.get(group.product_id) ?? [];
    groups.push(group);
    groupsByProduct.set(group.product_id, groups);
  }

  return cart.map<ResolvedCartItem>((item) => {
    const product = products.get(item.productId);
    if (!product || !isProductCurrentlyOrderable(product)) throw new Error("product-not-found");
    if (!item.variantId && (activeVariantsByProduct.get(item.productId)?.length ?? 0) > 0) throw new Error("product-configuration");
    const variant = item.variantId ? variants.get(item.variantId) : null;
    if (item.variantId && (!variant?.is_active || variant.product_id !== item.productId)) throw new Error("product-configuration");

    const selectedOptions = (item.optionIds ?? []).map((optionId) => options.get(optionId));
    if (selectedOptions.some((option) => !option?.is_active || option.product_id !== item.productId)) throw new Error("product-configuration");
    const selectedOptionRows = selectedOptions.filter((option): option is OptionPriceRow => Boolean(option));
    const optionIdsByGroup = new Map<string, string[]>();
    for (const option of selectedOptionRows) {
      const groupOptions = optionIdsByGroup.get(option.option_group_id) ?? [];
      groupOptions.push(option.id);
      optionIdsByGroup.set(option.option_group_id, groupOptions);
    }
    for (const group of groupsByProduct.get(item.productId) ?? []) {
      if (!group.is_active) continue;
      const selectedCount = optionIdsByGroup.get(group.id)?.length ?? 0;
      if (selectedCount < group.min_choices || selectedCount > group.max_choices || (group.is_required && selectedCount === 0)) throw new Error("product-configuration");
    }

    const detailParts = [variant?.name, ...selectedOptionRows.map((option) => option.name)].filter(Boolean);
    const unitPrice = Number(product.price) + Number(variant?.price_delta ?? 0) + selectedOptionRows.reduce((sum, option) => sum + Number(option.price_delta), 0);
    const name = variant ? `${product.name} - ${variant.name}` : product.name;
    const notes = [detailParts.join(" | "), item.notes?.trim()].filter(Boolean).join(" | ") || undefined;
    return {
      productId: item.productId,
      variantId: variant?.id,
      optionIds: selectedOptionRows.map((option) => option.id),
      name,
      price: unitPrice,
      quantity: item.quantity,
      subtotal: Number((unitPrice * item.quantity).toFixed(2)),
      notes,
    };
  });
}

async function listBusinessHours(supabase: SupabaseDatabaseClient, restaurantId: string) {
  const { data } = await supabase.from("business_hours").select("day_of_week,opens_at,closes_at,is_closed").eq("restaurant_id", restaurantId).order("day_of_week");
  return (data ?? []).map((hour) => ({
    dayOfWeek: hour.day_of_week,
    opensAt: hour.opens_at ?? "",
    closesAt: hour.closes_at ?? "",
    isClosed: Boolean(hour.is_closed),
  })) satisfies BusinessHour[];
}

async function listDeliveryZones(supabase: SupabaseDatabaseClient, restaurantId: string): Promise<RestaurantDeliveryZone[]> {
  const { data } = await supabase
    .from("restaurant_delivery_zones")
    .select("id,restaurant_id,name,city,center_latitude,center_longitude,radius_km,delivery_fee,min_order_amount,is_active")
    .eq("restaurant_id", restaurantId)
    .eq("is_active", true);

  return (data ?? []).map((zone) => ({
    id: zone.id,
    restaurantId: zone.restaurant_id,
    name: zone.name,
    city: zone.city ?? "",
    centerLatitude: zone.center_latitude == null ? undefined : Number(zone.center_latitude),
    centerLongitude: zone.center_longitude == null ? undefined : Number(zone.center_longitude),
    radiusKm: Number(zone.radius_km),
    deliveryFee: Number(zone.delivery_fee),
    minOrderAmount: Number(zone.min_order_amount),
    isActive: zone.is_active,
  }));
}

async function hasOpenCashSession(supabase: SupabaseDatabaseClient, restaurantId: string) {
  const { data } = await supabase.from("cash_sessions").select("id").eq("restaurant_id", restaurantId).eq("status", "open").limit(1).maybeSingle();
  return Boolean(data);
}

export async function submitMobileGroupOrder(supabase: SupabaseDatabaseClient, sessionToken: string, payload: z.infer<typeof submitGroupSchema>) {
  const { data: session } = await supabase.from("group_order_sessions").select("*").eq("public_token", sessionToken).eq("host_access_token", payload.hostAccessToken).maybeSingle();
  if (!session || !["open", "locked"].includes(session.status) || new Date(session.expires_at).getTime() <= Date.now()) throw new Error("closed");

  const [{ data: participants }, { data: items }, { data: settings }, { data: restaurant }, businessHours, deliveryZones] = await Promise.all([
    supabase.from("group_order_participants").select("*").eq("session_id", session.id).order("created_at", { ascending: true }),
    supabase.from("group_order_items").select("*").eq("session_id", session.id).order("created_at", { ascending: true }),
    supabase
      .from("restaurant_settings")
      .select("delivery_enabled,pickup_enabled,delivery_fee,delivery_qr_prepayment_enabled,far_delivery_distance_km,free_delivery_from,min_order_amount,qr_payment_url")
      .eq("restaurant_id", session.restaurant_id)
      .maybeSingle(),
    supabase.from("restaurants").select("id,slug,city,latitude,longitude").eq("id", session.restaurant_id).eq("slug", payload.restaurantSlug).eq("status", "active").is("deleted_at", null).maybeSingle(),
    listBusinessHours(supabase, session.restaurant_id),
    listDeliveryZones(supabase, session.restaurant_id),
  ]);

  if (!settings || !restaurant) throw new Error("settings");
  const orderTypeEnabled = (payload.orderType === "delivery" && settings.delivery_enabled) || (payload.orderType === "pickup" && settings.pickup_enabled);
  if (!orderTypeEnabled) throw new Error("disabled");
  if (await announcementService.hasActiveClosure(session.restaurant_id)) throw new Error("temporarily-closed");
  if (!isLocalDateTimeWithinBusinessHours(formatLocalDateTimeInput(new Date(), DEFAULT_RESTAURANT_TIME_ZONE), businessHours)) throw new Error("outside-hours");
  if (!(await hasOpenCashSession(supabase, session.restaurant_id))) throw new Error("no-open-cash");
  if (payload.orderType === "delivery" && !payload.customerAddress?.trim()) throw new Error("delivery-address");
  if (
    payload.orderType === "delivery" &&
    (payload.deliveryLatitude == null ||
      payload.deliveryLongitude == null ||
      restaurant.latitude == null ||
      restaurant.longitude == null)
  ) {
    throw new Error("delivery-location");
  }

  const participantRows = participants ?? [];
  const participantById = new Map(participantRows.map((participant) => [participant.id, participant]));
  const includedParticipantIds = new Set(participantRows.filter((participant) => participant.payment_status !== "excluded").map((participant) => participant.id));
  const sourceItems = (items ?? []).filter((item) => includedParticipantIds.has(item.participant_id));
  if (!sourceItems.length) throw new Error("empty");

  const resolvedItems = await resolveGroupCartItems(
    supabase,
    session.restaurant_id,
    sourceItems.map((item) => ({
      productId: item.product_id,
      variantId: item.variant_id ?? undefined,
      optionIds: item.option_ids,
      quantity: item.quantity,
      notes: item.notes ?? undefined,
    })),
  );
  const subtotal = Number(resolvedItems.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const deliveryPolicy =
    payload.orderType === "delivery"
      ? resolveDeliveryPolicy({
          restaurantLocation: { latitude: Number(restaurant.latitude), longitude: Number(restaurant.longitude) },
          deliveryLocation: { latitude: Number(payload.deliveryLatitude), longitude: Number(payload.deliveryLongitude) },
          restaurantCity: restaurant.city ?? "",
          deliveryCity: payload.deliveryCity,
          zones: deliveryZones,
          subtotal,
          baseDeliveryFee: Number((settings as PublicOrderSettings).delivery_fee),
          baseMinOrderAmount: Number((settings as PublicOrderSettings).min_order_amount),
          qrPrepaymentEnabled: (settings as PublicOrderSettings).delivery_qr_prepayment_enabled ?? true,
          freeDeliveryFrom: Number((settings as PublicOrderSettings).free_delivery_from ?? 0),
          farDeliveryDistanceKm: Number((settings as PublicOrderSettings).far_delivery_distance_km ?? 5),
        })
      : null;

  if (deliveryPolicy && !deliveryPolicy.sameCity) throw new Error("different-city");
  if (subtotal < (deliveryPolicy?.minOrderAmount ?? Number((settings as PublicOrderSettings).min_order_amount))) throw new Error("minimum");
  if (deliveryPolicy?.requiresQrPrepayment && payload.paymentMethod !== "qr") throw new Error("qr-required-distance");
  if (payload.paymentMethod === "qr" && !normalizeQrPaymentUrl((settings as PublicOrderSettings).qr_payment_url)) throw new Error("qr-unavailable");
  if (payload.paymentMethod === "qr" && !payload.paymentReceiptUrl?.trim()) throw new Error("receipt-required");

  const deliveryFee = deliveryPolicy?.deliveryFee ?? 0;
  const participantTotals = new Map<string, number>();
  sourceItems.forEach((item, index) => {
    participantTotals.set(item.participant_id, (participantTotals.get(item.participant_id) ?? 0) + resolvedItems[index].subtotal);
  });
  const participantSummary = participantRows
    .filter((participant) => participantTotals.has(participant.id) || participant.payment_status === "excluded")
    .map((participant) => {
      const amount = participantTotals.get(participant.id) ?? 0;
      return `${participant.display_name}: Bs ${amount.toFixed(2)} - ${participantPaymentLabel(participant.payment_status)}${participant.payment_receipt_url ? ` - comprobante: ${participant.payment_receipt_url}` : ""}`;
    })
    .join("\n");
  const notes = ["Yopido Grupal", `Host: ${session.host_name}${session.host_phone ? ` (${session.host_phone})` : ""}`, `Cobro: ${collectModeLabel(session.collect_mode)}`, participantSummary ? `Participantes:\n${participantSummary}` : ""].filter(Boolean).join("\n\n");

  const { data: createdOrders, error } = await supabase.rpc("create_public_order_transaction", {
    p_request_id: crypto.randomUUID(),
    p_order: {
      restaurant_id: session.restaurant_id,
      table_id: null,
      order_number: `PG-${Date.now().toString().slice(-7)}`,
      customer_name: payload.customerName,
      customer_phone: payload.customerPhone ?? session.host_phone,
      customer_email: null,
      customer_address: payload.orderType === "delivery" ? payload.customerAddress : null,
      delivery_address_detail: payload.orderType === "delivery" ? (payload.deliveryAddressDetail ?? null) : null,
      delivery_latitude: payload.orderType === "delivery" ? (payload.deliveryLatitude ?? null) : null,
      delivery_longitude: payload.orderType === "delivery" ? (payload.deliveryLongitude ?? null) : null,
      delivery_maps_url: payload.orderType === "delivery" ? (payload.deliveryMapsUrl ?? null) : null,
      delivery_distance_km: deliveryPolicy?.distanceKm == null ? null : Number(deliveryPolicy.distanceKm.toFixed(2)),
      requires_prepayment: deliveryPolicy?.requiresQrPrepayment ?? false,
      requested_fulfillment_at: null,
      invoice_required: false,
      invoice_document_type: null,
      invoice_document_number: null,
      invoice_name: null,
      order_type: payload.orderType,
      order_origin: "web_checkout",
      payment_method: payload.paymentMethod,
      payment_receipt_url: payload.paymentReceiptUrl || null,
      payment_receipt_uploaded_at: payload.paymentReceiptUrl ? new Date().toISOString() : null,
      subtotal,
      delivery_fee: deliveryFee,
      discount_total: 0,
      total: Number((subtotal + deliveryFee).toFixed(2)),
      notes,
    },
    p_items: resolvedItems.map((item, index) => {
      const participant = participantById.get(sourceItems[index].participant_id);
      return {
        product_id: item.productId,
        product_name: item.name,
        variant_id: item.variantId ?? null,
        option_ids: item.optionIds,
        unit_price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal,
        notes: [participant ? `Participante: ${participant.display_name}` : "Participante del grupo", item.notes].filter(Boolean).join(" | "),
      };
    }),
  });

  const order = createdOrders?.[0];
  if (error || !order) throw new Error(error?.message?.includes("no-open-cash") ? "no-open-cash" : "create-order");

  await supabase
    .from("group_order_sessions")
    .update({
      delivery_fee: deliveryFee,
      status: "submitted",
      submitted_at: new Date().toISOString(),
      submitted_order_id: order.id,
      subtotal,
      total: Number((subtotal + deliveryFee).toFixed(2)),
    })
    .eq("id", session.id);

  const { data: savedOrder } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", order.id)
    .maybeSingle();

  return {
    orderId: order.id,
    orderNumber: savedOrder?.order_number ?? "",
    trackingToken: order.tracking_token,
  };
}
