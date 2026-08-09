"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { announcementService } from "@/lib/services/announcement.service";
import { uploadPrivateFile, uploadPublicImage } from "@/lib/supabase/storage";
import { businessTypeSupportsTableQr, normalizeRestaurantBusinessType } from "@/lib/restaurant-directory-options";
import { resolveDeliveryPolicy } from "@/lib/delivery-policy";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { DEFAULT_RESTAURANT_TIME_ZONE, formatLocalDateTimeInput, isLocalDateTimeWithinBusinessHours, localDateTimeInputToIso } from "@/lib/utils/business-hours";
import { publicRestaurantOrderPath, publicRestaurantPath } from "@/lib/utils/public-routes";
import { normalizeQrPaymentUrl } from "@/lib/utils/qr-payment";
import type { Database } from "@/types/database.types";
import type { BusinessHour, BusinessType, RestaurantDeliveryZone } from "@/types/restaurant.types";

type SupabaseDatabaseClient = SupabaseClient<Database>;
const GROUP_UPLOAD_MAX_BYTES = 5 * 1024 * 1024;
const GROUP_PUBLIC_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/avif"]);
const GROUP_PRIVATE_RECEIPT_TYPES = new Set([...GROUP_PUBLIC_IMAGE_TYPES, "application/pdf"]);

function isNonEmptyFile(file: File | null): file is File {
  return Boolean(file && file.size > 0);
}

function isAllowedFileType(file: File, allowedTypes: Set<string>) {
  return allowedTypes.has(file.type);
}

const cartItemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  optionIds: z.array(z.string().uuid()).optional().default([]),
  name: z.string().optional(),
  price: z.coerce.number().nonnegative().optional(),
  quantity: z.coerce.number().int().positive(),
  notes: z.string().optional(),
});

const orderSchema = z.object({
  requestId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  restaurantSlug: z.string().min(1),
  tableId: z.string().uuid().optional(),
  tableCode: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerAddress: z.string().optional(),
  deliveryAddressDetail: z.string().optional(),
  deliveryLatitude: z.coerce.number().min(-90).max(90).optional(),
  deliveryLongitude: z.coerce.number().min(-180).max(180).optional(),
  deliveryMapsUrl: z.string().optional(),
  deliveryCity: z.string().optional(),
  requestedFulfillmentAt: z.string().optional(),
  invoiceRequired: z.boolean().default(false),
  invoiceDocumentType: z.enum(["nit", "ci", "cex", "passport", "other"]).optional(),
  invoiceDocumentNumber: z.string().optional(),
  invoiceName: z.string().optional(),
  orderType: z.enum(["table", "delivery", "pickup"]),
  paymentMethod: z.enum(["cash", "qr", "bank_transfer", "card"]),
  notes: z.string().optional(),
  cart: z.array(cartItemSchema).min(1),
});

const trackingLookupSchema = z.object({
  restaurantId: z.string().uuid(),
  restaurantSlug: z.string().min(1),
  orderNumber: z.string().min(3),
  customerPhone: z.string().min(4),
});

const groupCollectModeSchema = z.enum(["host_collects", "restaurant_collects", "internal_cash"]);

const createGroupOrderSessionSchema = z.object({
  restaurantSlug: z.string().min(1),
  hostName: z.string().trim().min(2).max(120),
  hostPhone: z.string().trim().max(40).optional(),
  collectMode: groupCollectModeSchema.default("host_collects"),
  multisiteEnabled: z.coerce.boolean().default(false),
});

const joinGroupOrderSessionSchema = z.object({
  restaurantSlug: z.string().min(1),
  sessionToken: z.string().min(8),
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
});

const groupOrderItemInputSchema = z.object({
  sessionToken: z.string().min(8),
  participantToken: z.string().min(12),
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  optionIds: z.array(z.string().uuid()).optional().default([]),
  notes: z.string().trim().max(240).optional(),
});

const removeGroupOrderItemInputSchema = z.object({
  sessionToken: z.string().min(8),
  participantToken: z.string().min(12).optional(),
  hostAccessToken: z.string().min(12).optional(),
  itemId: z.string().uuid(),
});

const updateGroupParticipantPaymentInputSchema = z.object({
  sessionToken: z.string().min(8),
  participantToken: z.string().min(12),
  paymentStatus: z.enum(["pending", "paid_qr", "cash_pending", "covered_by_host", "excluded"]),
  paymentNote: z.string().trim().max(240).optional(),
});

const updateGroupParticipantPaymentFormSchema = z.object({
  restaurantSlug: z.string().min(1),
  sessionToken: z.string().min(8),
  participantToken: z.string().min(12),
  paymentStatus: z.enum(["pending", "paid_qr", "cash_pending", "covered_by_host", "excluded"]),
  paymentNote: z.string().trim().max(240).optional(),
});

const updateGroupSessionSettingsSchema = z.object({
  restaurantSlug: z.string().min(1),
  sessionToken: z.string().min(8),
  hostAccessToken: z.string().min(12),
  collectMode: groupCollectModeSchema,
  multisiteEnabled: z.coerce.boolean().default(false),
});

const updateGroupSessionStatusInputSchema = z.object({
  restaurantSlug: z.string().min(1),
  sessionToken: z.string().min(8),
  hostAccessToken: z.string().min(12),
  status: z.enum(["open", "locked", "cancelled"]),
});

const updateGroupParticipantByHostInputSchema = z.object({
  sessionToken: z.string().min(8),
  hostAccessToken: z.string().min(12),
  participantId: z.string().uuid(),
  paymentStatus: z.enum(["pending", "paid_qr", "cash_pending", "covered_by_host", "excluded"]),
});

const submitGroupOrderSessionSchema = z.object({
  restaurantSlug: z.string().min(1),
  sessionToken: z.string().min(8),
  hostAccessToken: z.string().min(12),
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
});

type TrackingLookupPayload = {
  id?: string;
  tracking_token?: string;
};

type PublicOrderSettings = {
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  table_orders_enabled: boolean;
  delivery_fee: number;
  delivery_qr_prepayment_enabled?: boolean | null;
  far_delivery_distance_km: number;
  free_delivery_from: number | null;
  min_order_amount: number;
  invoice_enabled: boolean;
  qr_payment_url: string | null;
};

type ParsedCartItem = z.infer<typeof cartItemSchema>;

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

function boliviaScheduleParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/La_Paz",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const weekday = parts.find((part) => part.type === "weekday")?.value ?? "Sun";
  const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
  const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);
  const weekdayIndex: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };

  return { dayOfWeek: weekdayIndex[weekday] ?? 0, minutes: hour * 60 + minute };
}

function timeToMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function isProductCurrentlyOrderable(product: ProductPriceRow, date = new Date()) {
  if (!product.is_available) {
    return false;
  }

  const nowTime = date.getTime();
  if (product.available_from && new Date(product.available_from).getTime() > nowTime) {
    return false;
  }

  if (product.available_until && new Date(product.available_until).getTime() < nowTime) {
    return false;
  }

  const { dayOfWeek, minutes } = boliviaScheduleParts(date);
  if (product.available_days?.length && !product.available_days.includes(dayOfWeek)) {
    return false;
  }

  const start = timeToMinutes(product.available_start_time);
  const end = timeToMinutes(product.available_end_time);
  if (start != null && minutes < start) {
    return false;
  }

  if (end != null && minutes > end) {
    return false;
  }

  return true;
}

async function getPublicOrderSettings(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string) {
  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("delivery_enabled,pickup_enabled,table_orders_enabled,delivery_fee,delivery_qr_prepayment_enabled,far_delivery_distance_km,free_delivery_from,min_order_amount,invoice_enabled,qr_payment_url")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (settings) {
    return settings as PublicOrderSettings;
  }

  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data: serverSettings } = await admin
    .from("restaurant_settings")
    .select("delivery_enabled,pickup_enabled,table_orders_enabled,delivery_fee,delivery_qr_prepayment_enabled,far_delivery_distance_km,free_delivery_from,min_order_amount,invoice_enabled,qr_payment_url")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  return (serverSettings as PublicOrderSettings | null) ?? null;
}

async function validatePublicRestaurant(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string, restaurantSlug: string) {
  const { data } = await supabase
    .from("restaurants")
    .select("id,slug,city,latitude,longitude")
    .eq("id", restaurantId)
    .eq("slug", restaurantSlug)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  return data;
}

async function listPublicDeliveryZones(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string): Promise<RestaurantDeliveryZone[]> {
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

async function validatePublicTable(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string, tableId?: string, tableCode?: string) {
  if (!tableId || !tableCode) {
    return false;
  }

  const { data } = await supabase
    .from("tables")
    .select("id")
    .eq("id", tableId)
    .eq("restaurant_id", restaurantId)
    .eq("code", tableCode.trim().toUpperCase())
    .eq("is_active", true)
    .maybeSingle();

  return Boolean(data);
}

async function getPublicRestaurantBusinessType(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string): Promise<BusinessType> {
  const { data } = await supabase.from("restaurants").select("business_type").eq("id", restaurantId).maybeSingle();
  return normalizeRestaurantBusinessType(data?.business_type);
}

async function listPublicBusinessHours(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string) {
  const { data } = await supabase
    .from("business_hours")
    .select("day_of_week,opens_at,closes_at,is_closed")
    .eq("restaurant_id", restaurantId)
    .order("day_of_week");

  return (data ?? []).map((hour) => ({
    dayOfWeek: hour.day_of_week,
    opensAt: hour.opens_at ?? "",
    closesAt: hour.closes_at ?? "",
    isClosed: hour.is_closed,
  })) satisfies BusinessHour[];
}

async function hasOpenCashSession(supabase: SupabaseDatabaseClient, restaurantId: string) {
  const { data } = await supabase
    .from("cash_sessions")
    .select("id")
    .eq("restaurant_id", restaurantId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  return Boolean(data);
}

async function resolvePublicCartItems(supabase: SupabaseDatabaseClient, restaurantId: string, cart: ParsedCartItem[]) {
  const productIds = Array.from(new Set(cart.map((item) => item.productId)));
  const optionIds = Array.from(new Set(cart.flatMap((item) => item.optionIds ?? [])));

  const [{ data: productRows, error: productsError }, { data: variantRows }, { data: groupRows }, { data: optionRows }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,price,is_available,available_from,available_until,available_days,available_start_time,available_end_time")
      .eq("restaurant_id", restaurantId)
      .in("id", productIds),
    supabase
      .from("product_variants")
      .select("id,product_id,name,price_delta,is_active")
      .eq("restaurant_id", restaurantId)
      .in("product_id", productIds),
    supabase
      .from("product_option_groups")
      .select("id,product_id,min_choices,max_choices,is_required,is_active")
      .eq("restaurant_id", restaurantId)
      .in("product_id", productIds),
    optionIds.length
      ? supabase
          .from("product_options")
          .select("id,product_id,option_group_id,name,price_delta,is_active")
          .eq("restaurant_id", restaurantId)
          .in("id", optionIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (productsError || !productRows?.length) {
    throw new Error("product-not-found");
  }

  const products = new Map((productRows as ProductPriceRow[]).map((product) => [product.id, product]));
  const variants = new Map(((variantRows ?? []) as VariantPriceRow[]).map((variant) => [variant.id, variant]));
  const activeVariantsByProduct = new Map<string, VariantPriceRow[]>();
  for (const variant of (variantRows ?? []) as VariantPriceRow[]) {
    if (!variant.is_active) {
      continue;
    }
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

    if (!product || !isProductCurrentlyOrderable(product)) {
      throw new Error("product-not-found");
    }

    if (!item.variantId && (activeVariantsByProduct.get(item.productId)?.length ?? 0) > 0) {
      throw new Error("product-configuration");
    }

    const variant = item.variantId ? variants.get(item.variantId) : null;
    if (item.variantId && (!variant?.is_active || variant.product_id !== item.productId)) {
      throw new Error("product-configuration");
    }

    const selectedOptions = (item.optionIds ?? []).map((optionId) => options.get(optionId));
    if (selectedOptions.some((option) => !option?.is_active || option.product_id !== item.productId)) {
      throw new Error("product-configuration");
    }

    const selectedOptionRows = selectedOptions.filter((option): option is OptionPriceRow => Boolean(option));
    const optionIdsByGroup = new Map<string, string[]>();
    for (const option of selectedOptionRows) {
      const groupOptions = optionIdsByGroup.get(option.option_group_id) ?? [];
      groupOptions.push(option.id);
      optionIdsByGroup.set(option.option_group_id, groupOptions);
    }

    for (const group of groupsByProduct.get(item.productId) ?? []) {
      if (!group.is_active) {
        continue;
      }

      const selectedCount = optionIdsByGroup.get(group.id)?.length ?? 0;
      if (selectedCount < group.min_choices || selectedCount > group.max_choices || (group.is_required && selectedCount === 0)) {
        throw new Error("product-configuration");
      }
    }

    const detailParts = [variant?.name, ...selectedOptionRows.map((option) => option.name)].filter(Boolean);
    const unitPrice = Number(product.price) + Number(variant?.price_delta ?? 0) + selectedOptionRows.reduce((sum, option) => sum + Number(option.price_delta), 0);
    const name = variant ? `${product.name} - ${variant.name}` : product.name;
    const detailNotes = detailParts.length ? detailParts.join(" | ") : "";
    const notes = [detailNotes, item.notes?.trim()].filter(Boolean).join(" | ") || undefined;

    return {
      productId: item.productId,
      variantId: variant?.id,
      optionIds: selectedOptionRows.map((option) => option.id),
      name,
      price: unitPrice,
      quantity: item.quantity,
      subtotal: unitPrice * item.quantity,
      notes,
    };
  });
}

export async function createPublicOrderAction(formData: FormData) {
  const rawCart = String(formData.get("cartJson") ?? "[]");
  let cart: unknown;
  try {
    cart = JSON.parse(rawCart);
  } catch {
    redirect(publicRestaurantOrderPath(String(formData.get("restaurantSlug") || ""), "invalid"));
  }
  const parsed = orderSchema.safeParse({
    requestId: formData.get("requestId") || crypto.randomUUID(),
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug"),
    tableId: formData.get("tableId") || undefined,
    tableCode: formData.get("tableCode") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone") || undefined,
    customerEmail: formData.get("customerEmail") || undefined,
    customerAddress: formData.get("customerAddress") || undefined,
    deliveryAddressDetail: formData.get("deliveryAddressDetail") || undefined,
    deliveryLatitude: formData.get("deliveryLatitude") || undefined,
    deliveryLongitude: formData.get("deliveryLongitude") || undefined,
    deliveryMapsUrl: formData.get("deliveryMapsUrl") || undefined,
    deliveryCity: formData.get("deliveryCity") || undefined,
    requestedFulfillmentAt: formData.get("requestedFulfillmentAt") || undefined,
    invoiceRequired: formData.get("invoiceRequired") === "on",
    invoiceDocumentType: formData.get("invoiceDocumentType") || undefined,
    invoiceDocumentNumber: formData.get("invoiceDocumentNumber") || undefined,
    invoiceName: formData.get("invoiceName") || undefined,
    orderType: formData.get("orderType"),
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes") || undefined,
    cart,
  });

  if (!parsed.success) {
    redirect(publicRestaurantOrderPath(String(formData.get("restaurantSlug") || ""), "invalid"));
  }

  const failPath = parsed.data.tableCode ? publicRestaurantPath(parsed.data.restaurantSlug, `mesa/${parsed.data.tableCode}`) : publicRestaurantPath(parsed.data.restaurantSlug);
  const orderRateLimit = await consumeRateLimit({
    scope: "public-order",
    identity: `${parsed.data.restaurantId}:${parsed.data.customerPhone || parsed.data.customerEmail || parsed.data.customerName}`,
    maxAttempts: 8,
    windowSeconds: 10 * 60,
    blockSeconds: 15 * 60,
  });

  if (!orderRateLimit.allowed) {
    redirect(`${failPath}?error=rate-limit`);
  }

  const supabase = await createClient();
  const writeClient = createAdminClient();
  if (!writeClient) {
    redirect(`${failPath}?error=service-role-required`);
  }

  const publicRestaurant = await validatePublicRestaurant(supabase, parsed.data.restaurantId, parsed.data.restaurantSlug);
  if (!publicRestaurant) {
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug)}?pedido=1&error=invalid-restaurant`);
  }

  if (parsed.data.orderType === "table") {
    const validTable = await validatePublicTable(supabase, parsed.data.restaurantId, parsed.data.tableId, parsed.data.tableCode);
    if (!validTable) {
      redirect(`${failPath}?error=invalid-table`);
    }
  }

  const [settings, businessType, deliveryZones] = await Promise.all([
    getPublicOrderSettings(supabase, parsed.data.restaurantId),
    getPublicRestaurantBusinessType(supabase, parsed.data.restaurantId),
    listPublicDeliveryZones(supabase, parsed.data.restaurantId),
  ]);

  if (!settings) {
    redirect(publicRestaurantOrderPath(parsed.data.restaurantSlug, "settings"));
  }

  if (await announcementService.hasActiveClosure(parsed.data.restaurantId)) {
    redirect(`${failPath}?error=temporarily-closed`);
  }

  let resolvedCart: ResolvedCartItem[];
  try {
    resolvedCart = await resolvePublicCartItems(writeClient, parsed.data.restaurantId, parsed.data.cart);
  } catch (error) {
    const key = error instanceof Error ? error.message : "invalid-cart";
    redirect(`${failPath}?error=${encodeURIComponent(key)}`);
  }

  const subtotal = resolvedCart.reduce((sum, item) => sum + item.subtotal, 0);

  const businessHours = await listPublicBusinessHours(supabase, parsed.data.restaurantId);
  const requestedFulfillmentAt = parsed.data.requestedFulfillmentAt?.trim();
  const isPublicFulfillmentOrder = parsed.data.orderType === "delivery" || parsed.data.orderType === "pickup";
  const nowInput = formatLocalDateTimeInput(new Date(), DEFAULT_RESTAURANT_TIME_ZONE);
  const nowWithinBusinessHours = isLocalDateTimeWithinBusinessHours(nowInput, businessHours);

  const orderTypeEnabled =
    (parsed.data.orderType === "delivery" && settings.delivery_enabled) ||
    (parsed.data.orderType === "pickup" && settings.pickup_enabled) ||
    (parsed.data.orderType === "table" && settings.table_orders_enabled && businessTypeSupportsTableQr(businessType));

  if (!orderTypeEnabled) {
    redirect(publicRestaurantOrderPath(parsed.data.restaurantSlug, "disabled"));
  }

  if (parsed.data.orderType === "delivery" && !parsed.data.customerAddress?.trim()) {
    redirect(`${failPath}?error=delivery-address`);
  }

  if (
    parsed.data.orderType === "delivery" &&
    (parsed.data.deliveryLatitude == null ||
      parsed.data.deliveryLongitude == null ||
      publicRestaurant.latitude == null ||
      publicRestaurant.longitude == null)
  ) {
    redirect(`${failPath}?error=delivery-location`);
  }

  if (parsed.data.orderType === "table" && (parsed.data.customerPhone ?? "").replace(/\D/g, "").length < 4) {
    redirect(`${failPath}?error=phone-required`);
  }

  if (parsed.data.invoiceRequired && (!parsed.data.invoiceDocumentType || !parsed.data.invoiceDocumentNumber?.trim() || !parsed.data.invoiceName?.trim())) {
    redirect(`${failPath}?error=invoice`);
  }

  if (parsed.data.invoiceRequired && !settings.invoice_enabled) {
    redirect(`${failPath}?error=invoice-disabled`);
  }

  const deliveryPolicy =
    parsed.data.orderType === "delivery"
      ? resolveDeliveryPolicy({
          restaurantLocation: {
            latitude: Number(publicRestaurant.latitude),
            longitude: Number(publicRestaurant.longitude),
          },
          deliveryLocation: {
            latitude: Number(parsed.data.deliveryLatitude),
            longitude: Number(parsed.data.deliveryLongitude),
          },
          restaurantCity: publicRestaurant.city ?? "",
          deliveryCity: parsed.data.deliveryCity,
          zones: deliveryZones,
          subtotal,
          baseDeliveryFee: Number(settings.delivery_fee),
          baseMinOrderAmount: Number(settings.min_order_amount),
          qrPrepaymentEnabled: settings.delivery_qr_prepayment_enabled ?? true,
          freeDeliveryFrom: Number(settings.free_delivery_from ?? 0),
          farDeliveryDistanceKm: Number(settings.far_delivery_distance_km ?? 5),
        })
      : null;

  if (deliveryPolicy && !deliveryPolicy.sameCity) {
    redirect(`${failPath}?error=different-city`);
  }

  const effectiveMinOrderAmount = deliveryPolicy?.minOrderAmount ?? Number(settings.min_order_amount);
  if (subtotal < effectiveMinOrderAmount) {
    redirect(publicRestaurantOrderPath(parsed.data.restaurantSlug, "minimum"));
  }

  const paymentReceiptFile = formData.get("paymentReceiptFile") as File | null;
  if (deliveryPolicy?.requiresQrPrepayment && parsed.data.paymentMethod !== "qr") {
    redirect(`${failPath}?error=qr-required-distance`);
  }
  if (parsed.data.paymentMethod === "qr" && !normalizeQrPaymentUrl(settings.qr_payment_url)) {
    redirect(`${failPath}?error=qr-unavailable`);
  }

  if (parsed.data.orderType !== "table" && parsed.data.paymentMethod === "qr" && (!paymentReceiptFile || paymentReceiptFile.size === 0)) {
    redirect(`${failPath}?error=receipt-required`);
  }

  if (requestedFulfillmentAt && !isPublicFulfillmentOrder) {
    redirect(`${failPath}?error=scheduled-not-available`);
  }

  if (!requestedFulfillmentAt && !nowWithinBusinessHours) {
    redirect(`${failPath}?error=outside-hours`);
  }

  if (requestedFulfillmentAt) {
    if (requestedFulfillmentAt < nowInput) {
      redirect(`${failPath}?error=schedule-past`);
    }

    if (!isLocalDateTimeWithinBusinessHours(requestedFulfillmentAt, businessHours)) {
      redirect(`${failPath}?error=outside-hours`);
    }
  }

  const requiresOpenCash = parsed.data.orderType === "table" || !requestedFulfillmentAt;
  if (requiresOpenCash && !(await hasOpenCashSession(writeClient, parsed.data.restaurantId))) {
    redirect(`${failPath}?error=no-open-cash`);
  }

  const paymentReceiptUrl =
    parsed.data.paymentMethod === "qr"
      ? await uploadPrivateFile(paymentReceiptFile, `restaurants/${parsed.data.restaurantId}/payment-receipts`)
      : null;

  const deliveryFee = deliveryPolicy?.deliveryFee ?? 0;
  const total = subtotal + deliveryFee;
  const orderNumber = `P-${Date.now().toString().slice(-6)}`;

  const paymentReceiptUploadedAt = paymentReceiptUrl ? new Date().toISOString() : null;
  const { data: createdOrders, error } = await writeClient.rpc("create_public_order_transaction", {
    p_request_id: parsed.data.requestId,
    p_order: {
      restaurant_id: parsed.data.restaurantId,
      table_id: parsed.data.tableId ?? null,
      order_number: orderNumber,
      customer_name: parsed.data.customerName,
      customer_phone: parsed.data.customerPhone ?? null,
      customer_email: parsed.data.customerEmail || null,
      customer_address: parsed.data.customerAddress ?? null,
      delivery_address_detail: parsed.data.deliveryAddressDetail ?? null,
      delivery_latitude: parsed.data.deliveryLatitude ?? null,
      delivery_longitude: parsed.data.deliveryLongitude ?? null,
      delivery_maps_url: parsed.data.deliveryMapsUrl ?? null,
      delivery_distance_km: deliveryPolicy?.distanceKm == null ? null : Number(deliveryPolicy.distanceKm.toFixed(2)),
      requires_prepayment: deliveryPolicy?.requiresQrPrepayment ?? false,
      requested_fulfillment_at: requestedFulfillmentAt ? localDateTimeInputToIso(requestedFulfillmentAt, DEFAULT_RESTAURANT_TIME_ZONE) : null,
      invoice_required: parsed.data.invoiceRequired,
      invoice_document_type: parsed.data.invoiceRequired ? (parsed.data.invoiceDocumentType ?? null) : null,
      invoice_document_number: parsed.data.invoiceRequired ? (parsed.data.invoiceDocumentNumber ?? null) : null,
      invoice_name: parsed.data.invoiceRequired ? (parsed.data.invoiceName ?? null) : null,
      order_type: parsed.data.orderType,
      order_origin: parsed.data.orderType === "table" ? "table_qr" : "web_checkout",
      payment_method: parsed.data.paymentMethod,
      payment_receipt_url: paymentReceiptUrl,
      payment_receipt_uploaded_at: paymentReceiptUploadedAt,
      subtotal,
      delivery_fee: deliveryFee,
      discount_total: 0,
      total,
      notes: parsed.data.notes ?? null,
    },
    p_items: resolvedCart.map((item) => ({
      product_id: item.productId,
      product_name: item.name,
      variant_id: item.variantId ?? null,
      option_ids: item.optionIds,
      unit_price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      notes: item.notes ?? null,
    })),
  });
  let order = createdOrders?.[0];

  if (!order && error?.code === "23505") {
    const { data: existingOrder } = await writeClient
      .from("orders")
      .select("id,tracking_token")
      .eq("restaurant_id", parsed.data.restaurantId)
      .eq("public_request_id", parsed.data.requestId)
      .maybeSingle();
    order = existingOrder ?? undefined;
  }

  if (!order) {
    const errorKey = error?.message.includes("no-open-cash") ? "no-open-cash" : error?.message.includes("invalid-public-order-items") ? "product-not-found" : "create";
    redirect(publicRestaurantOrderPath(parsed.data.restaurantSlug, errorKey));
  }

  const tableNotice = parsed.data.orderType === "table" ? "&tablePending=1" : "";
  redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, `pedido/${order.id}`)}?token=${order.tracking_token}${tableNotice}`);
}

export async function trackPublicOrderAction(formData: FormData) {
  const parsed = trackingLookupSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug"),
    orderNumber: formData.get("orderNumber"),
    customerPhone: formData.get("customerPhone"),
  });

  if (!parsed.success) {
    redirect(`${publicRestaurantPath(String(formData.get("restaurantSlug") || ""), "seguimiento")}?error=invalid`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_order_lookup", {
    p_restaurant_id: parsed.data.restaurantId,
    p_order_number: parsed.data.orderNumber,
    p_customer_phone: parsed.data.customerPhone,
  });
  const payload = data as TrackingLookupPayload | null;

  if (error || !payload?.id || !payload.tracking_token) {
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, "seguimiento")}?error=not-found`);
  }

  redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, `pedido/${payload.id}`)}?token=${payload.tracking_token}`);
}

function createShortToken(length = 12) {
  return crypto.randomUUID().replace(/-/g, "").slice(0, length).toUpperCase();
}

function createSecretToken() {
  return crypto.randomUUID().replace(/-/g, "") + crypto.randomUUID().replace(/-/g, "");
}

function groupOrderUrl(restaurantSlug: string, sessionToken: string, params?: Record<string, string | undefined>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value) {
      search.set(key, value);
    }
  }
  const query = search.toString();
  return `${publicRestaurantPath(restaurantSlug, `grupo/${sessionToken}`)}${query ? `?${query}` : ""}`;
}

function collectModeLabel(mode: z.infer<typeof groupCollectModeSchema>) {
  if (mode === "host_collects") return "Todos pagan al host";
  if (mode === "restaurant_collects") return "Cada persona paga al restaurante";
  return "Arreglo interno / efectivo";
}

function participantPaymentLabel(status: string) {
  if (status === "paid_qr") return "Pago QR marcado";
  if (status === "cash_pending") return "Efectivo pendiente";
  if (status === "covered_by_host") return "Cubierto por host";
  if (status === "excluded") return "Excluido";
  return "Pendiente";
}

export async function createGroupOrderSessionAction(formData: FormData) {
  const parsed = createGroupOrderSessionSchema.safeParse({
    restaurantSlug: formData.get("restaurantSlug"),
    hostName: formData.get("hostName"),
    hostPhone: formData.get("hostPhone") || undefined,
    collectMode: formData.get("collectMode") || "host_collects",
    multisiteEnabled: formData.get("multisiteEnabled") === "on",
  });

  const restaurantSlug = String(formData.get("restaurantSlug") || "");
  if (!parsed.success) {
    redirect(`${publicRestaurantPath(restaurantSlug, "grupo/nuevo")}?error=invalid`);
  }

  const rateLimit = await consumeRateLimit({
    scope: "group-order-create",
    identity: `${parsed.data.restaurantSlug}:${parsed.data.hostPhone || parsed.data.hostName}`,
    maxAttempts: 8,
    windowSeconds: 10 * 60,
    blockSeconds: 15 * 60,
  });

  if (!rateLimit.allowed) {
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, "grupo/nuevo")}?error=rate-limit`);
  }

  const supabase = await createClient();
  const admin = createAdminClient();
  if (!admin) {
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, "grupo/nuevo")}?error=service-role-required`);
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,slug")
    .eq("slug", parsed.data.restaurantSlug)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!restaurant) {
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug)}?pedido=1&error=invalid-restaurant`);
  }

  const hostQrFile = formData.get("hostQrFile") as File | null;
  if (isNonEmptyFile(hostQrFile) && hostQrFile.size > GROUP_UPLOAD_MAX_BYTES) {
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, "grupo/nuevo")}?error=qr-size`);
  }
  if (isNonEmptyFile(hostQrFile) && !isAllowedFileType(hostQrFile, GROUP_PUBLIC_IMAGE_TYPES)) {
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, "grupo/nuevo")}?error=qr-type`);
  }

  const hostQrUrl =
    parsed.data.collectMode === "host_collects" && isNonEmptyFile(hostQrFile)
      ? await uploadPublicImage(hostQrFile, `restaurants/${restaurant.id}/group-host-qr`)
      : null;
  const sessionToken = createShortToken(12);
  const hostAccessToken = createSecretToken();
  const hostParticipantToken = createSecretToken();

  const { data: session, error: sessionError } = await admin
    .from("group_order_sessions")
    .insert({
      restaurant_id: restaurant.id,
      public_token: sessionToken,
      host_access_token: hostAccessToken,
      host_name: parsed.data.hostName,
      host_phone: parsed.data.hostPhone || null,
      collect_mode: parsed.data.collectMode,
      host_qr_url: hostQrUrl,
      multisite_enabled: parsed.data.multisiteEnabled,
    })
    .select("id")
    .single();

  if (sessionError || !session) {
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, "grupo/nuevo")}?error=create`);
  }

  const { data: participant, error: participantError } = await admin
    .from("group_order_participants")
    .insert({
      session_id: session.id,
      participant_token: hostParticipantToken,
      display_name: parsed.data.hostName,
      phone: parsed.data.hostPhone || null,
      role: "host",
      payment_status: "covered_by_host",
      payment_method: "other",
    })
    .select("id")
    .single();

  if (participantError || !participant) {
    await admin.from("group_order_sessions").delete().eq("id", session.id);
    redirect(`${publicRestaurantPath(parsed.data.restaurantSlug, "grupo/nuevo")}?error=create`);
  }

  await admin.from("group_order_sessions").update({ host_participant_id: participant.id }).eq("id", session.id);
  redirect(groupOrderUrl(parsed.data.restaurantSlug, sessionToken, { host: hostAccessToken, participant: hostParticipantToken }));
}

export async function joinGroupOrderSessionAction(formData: FormData) {
  const parsed = joinGroupOrderSessionSchema.safeParse({
    restaurantSlug: formData.get("restaurantSlug"),
    sessionToken: formData.get("sessionToken"),
    displayName: formData.get("displayName"),
    phone: formData.get("phone") || undefined,
  });

  const restaurantSlug = String(formData.get("restaurantSlug") || "");
  const sessionToken = String(formData.get("sessionToken") || "");
  if (!parsed.success) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { error: "invalid-join" }));
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect(groupOrderUrl(parsed.data.restaurantSlug, parsed.data.sessionToken, { error: "service-role-required" }));
  }

  const { data: session } = await admin
    .from("group_order_sessions")
    .select("id,status,expires_at,restaurant_id")
    .eq("public_token", parsed.data.sessionToken)
    .maybeSingle();

  if (!session || session.status !== "open" || new Date(session.expires_at).getTime() <= Date.now()) {
    redirect(groupOrderUrl(parsed.data.restaurantSlug, parsed.data.sessionToken, { error: "closed" }));
  }

  const participantToken = createSecretToken();
  const { error } = await admin.from("group_order_participants").insert({
    session_id: session.id,
    participant_token: participantToken,
    display_name: parsed.data.displayName,
    phone: parsed.data.phone || null,
    role: "guest",
  });

  if (error) {
    redirect(groupOrderUrl(parsed.data.restaurantSlug, parsed.data.sessionToken, { error: "join" }));
  }

  redirect(groupOrderUrl(parsed.data.restaurantSlug, parsed.data.sessionToken, { participant: participantToken }));
}

export async function addGroupOrderItemAction(input: unknown) {
  const parsed = groupOrderItemInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "service-role-required" };
  }

  const { data: session } = await admin
    .from("group_order_sessions")
    .select("id,restaurant_id,status,expires_at")
    .eq("public_token", parsed.data.sessionToken)
    .maybeSingle();

  if (!session || session.status !== "open" || new Date(session.expires_at).getTime() <= Date.now()) {
    return { ok: false, error: "closed" };
  }

  const { data: participant } = await admin
    .from("group_order_participants")
    .select("id")
    .eq("session_id", session.id)
    .eq("participant_token", parsed.data.participantToken)
    .maybeSingle();

  if (!participant) {
    return { ok: false, error: "participant" };
  }

  let resolvedItem: ResolvedCartItem;
  try {
    [resolvedItem] = await resolvePublicCartItems(admin, session.restaurant_id, [
      {
        productId: parsed.data.productId,
        variantId: parsed.data.variantId,
        optionIds: parsed.data.optionIds,
        quantity: 1,
        notes: parsed.data.notes,
      },
    ]);
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "product-not-found" };
  }

  const { error } = await admin.from("group_order_items").insert({
    session_id: session.id,
    participant_id: participant.id,
    product_id: resolvedItem.productId,
    product_name: resolvedItem.name,
    variant_id: resolvedItem.variantId ?? null,
    option_ids: resolvedItem.optionIds,
    unit_price: resolvedItem.price,
    quantity: resolvedItem.quantity,
    subtotal: resolvedItem.subtotal,
    notes: resolvedItem.notes ?? null,
  });

  if (error) {
    return { ok: false, error: "add" };
  }

  return { ok: true };
}

export async function removeGroupOrderItemAction(input: unknown) {
  const parsed = removeGroupOrderItemInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "service-role-required" };
  }

  const { data: session } = await admin
    .from("group_order_sessions")
    .select("id,host_access_token,status")
    .eq("public_token", parsed.data.sessionToken)
    .maybeSingle();

  if (!session || !["open", "locked"].includes(session.status)) {
    return { ok: false, error: "closed" };
  }

  const isHost = parsed.data.hostAccessToken && parsed.data.hostAccessToken === session.host_access_token;
  if (session.status === "locked" && !isHost) {
    return { ok: false, error: "closed" };
  }

  const { data: item } = await admin
    .from("group_order_items")
    .select("id,participant_id")
    .eq("session_id", session.id)
    .eq("id", parsed.data.itemId)
    .maybeSingle();

  if (!item) {
    return { ok: false, error: "item" };
  }

  if (!isHost) {
    const { data: participant } = await admin
      .from("group_order_participants")
      .select("id")
      .eq("session_id", session.id)
      .eq("participant_token", parsed.data.participantToken ?? "")
      .maybeSingle();

    if (!participant || participant.id !== item.participant_id) {
      return { ok: false, error: "forbidden" };
    }
  }

  const { error } = await admin.from("group_order_items").delete().eq("id", item.id).eq("session_id", session.id);
  if (error) {
    return { ok: false, error: "delete" };
  }

  return { ok: true };
}

export async function updateGroupParticipantPaymentAction(input: unknown) {
  const parsed = updateGroupParticipantPaymentInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "service-role-required" };
  }

  const { data: session } = await admin
    .from("group_order_sessions")
    .select("id,status")
    .eq("public_token", parsed.data.sessionToken)
    .maybeSingle();

  if (!session || !["open", "locked"].includes(session.status)) {
    return { ok: false, error: "closed" };
  }

  const paymentMethod =
    parsed.data.paymentStatus === "paid_qr"
      ? "qr"
      : parsed.data.paymentStatus === "cash_pending"
        ? "cash"
        : parsed.data.paymentStatus === "pending"
          ? null
          : "other";
  const { error } = await admin
    .from("group_order_participants")
    .update({
      payment_status: parsed.data.paymentStatus,
      payment_method: paymentMethod,
      payment_note: parsed.data.paymentNote || null,
      ...(parsed.data.paymentStatus === "pending" ? { payment_receipt_url: null, payment_receipt_uploaded_at: null } : {}),
    })
    .eq("session_id", session.id)
    .eq("participant_token", parsed.data.participantToken);

  if (error) {
    return { ok: false, error: "payment" };
  }

  return { ok: true };
}

export async function updateGroupParticipantPaymentFormAction(formData: FormData) {
  const parsed = updateGroupParticipantPaymentFormSchema.safeParse({
    restaurantSlug: formData.get("restaurantSlug"),
    sessionToken: formData.get("sessionToken"),
    participantToken: formData.get("participantToken"),
    paymentStatus: formData.get("paymentStatus"),
    paymentNote: formData.get("paymentNote") || undefined,
  });

  const restaurantSlug = String(formData.get("restaurantSlug") || "");
  const sessionToken = String(formData.get("sessionToken") || "");
  const participantToken = String(formData.get("participantToken") || "");

  if (!parsed.success) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { participant: participantToken, error: "payment" }));
  }
  const paymentData = parsed.data;

  const admin = createAdminClient();
  if (!admin) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { participant: participantToken, error: "service-role-required" }));
  }
  const writeClient = admin;

  const { data: sessionRow } = await writeClient
    .from("group_order_sessions")
    .select("id,restaurant_id,status")
    .eq("public_token", paymentData.sessionToken)
    .maybeSingle();

  if (!sessionRow || !["open", "locked"].includes(sessionRow.status)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { participant: participantToken, error: "closed" }));
  }
  const session = sessionRow;

  const paymentReceiptFile = formData.get("paymentReceiptFile") as File | null;
  if (paymentData.paymentStatus === "paid_qr" && !isNonEmptyFile(paymentReceiptFile)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { participant: participantToken, error: "receipt-required" }));
  }
  if (isNonEmptyFile(paymentReceiptFile) && paymentReceiptFile.size > GROUP_UPLOAD_MAX_BYTES) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { participant: participantToken, error: "receipt-size" }));
  }
  if (isNonEmptyFile(paymentReceiptFile) && !isAllowedFileType(paymentReceiptFile, GROUP_PUBLIC_IMAGE_TYPES)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { participant: participantToken, error: "receipt-type" }));
  }

  const receiptUrl =
    paymentData.paymentStatus === "paid_qr" && isNonEmptyFile(paymentReceiptFile)
      ? await uploadPublicImage(paymentReceiptFile, `restaurants/${session.restaurant_id}/group-payment-receipts`)
      : undefined;

  const paymentMethod: "qr" | "cash" | "other" | null =
    paymentData.paymentStatus === "paid_qr"
      ? "qr"
      : paymentData.paymentStatus === "cash_pending"
        ? "cash"
        : paymentData.paymentStatus === "pending"
          ? null
          : "other";

  const updatePayload = {
    payment_status: paymentData.paymentStatus,
    payment_method: paymentMethod,
    payment_note: paymentData.paymentNote || null,
    ...(receiptUrl ? { payment_receipt_url: receiptUrl, payment_receipt_uploaded_at: new Date().toISOString() } : {}),
    ...(paymentData.paymentStatus === "pending" ? { payment_receipt_url: null, payment_receipt_uploaded_at: null } : {}),
  };

  const { error } = await writeClient
    .from("group_order_participants")
    .update(updatePayload)
    .eq("session_id", session.id)
    .eq("participant_token", paymentData.participantToken);

  if (error) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { participant: participantToken, error: "payment" }));
  }

  redirect(groupOrderUrl(paymentData.restaurantSlug, paymentData.sessionToken, { participant: paymentData.participantToken, paid: "1" }));
}

export async function updateGroupOrderSessionSettingsAction(formData: FormData) {
  const parsed = updateGroupSessionSettingsSchema.safeParse({
    restaurantSlug: formData.get("restaurantSlug"),
    sessionToken: formData.get("sessionToken"),
    hostAccessToken: formData.get("hostAccessToken"),
    collectMode: formData.get("collectMode"),
    multisiteEnabled: formData.get("multisiteEnabled") === "on",
  });

  const restaurantSlug = String(formData.get("restaurantSlug") || "");
  const sessionToken = String(formData.get("sessionToken") || "");
  const hostAccessToken = String(formData.get("hostAccessToken") || "");

  if (!parsed.success) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "settings" }));
  }
  const settingsData = parsed.data;

  const admin = createAdminClient();
  if (!admin) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "service-role-required" }));
  }
  const writeClient = admin;

  const { data: sessionRow } = await writeClient
    .from("group_order_sessions")
    .select("id,restaurant_id,status")
    .eq("public_token", settingsData.sessionToken)
    .eq("host_access_token", settingsData.hostAccessToken)
    .maybeSingle();

  if (!sessionRow || !["open", "locked"].includes(sessionRow.status)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "closed" }));
  }
  const session = sessionRow;

  const hostQrFile = formData.get("hostQrFile") as File | null;
  if (isNonEmptyFile(hostQrFile) && hostQrFile.size > GROUP_UPLOAD_MAX_BYTES) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "qr-size" }));
  }
  if (isNonEmptyFile(hostQrFile) && !isAllowedFileType(hostQrFile, GROUP_PUBLIC_IMAGE_TYPES)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "qr-type" }));
  }

  const hostQrUrl =
    settingsData.collectMode === "host_collects" && isNonEmptyFile(hostQrFile)
      ? await uploadPublicImage(hostQrFile, `restaurants/${session.restaurant_id}/group-host-qr`)
      : undefined;

  const { error } = await writeClient
    .from("group_order_sessions")
    .update({
      collect_mode: settingsData.collectMode,
      multisite_enabled: settingsData.multisiteEnabled,
      ...(hostQrUrl ? { host_qr_url: hostQrUrl } : {}),
    })
    .eq("id", session.id);

  if (error) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "settings" }));
  }

  redirect(groupOrderUrl(settingsData.restaurantSlug, settingsData.sessionToken, { host: settingsData.hostAccessToken, settings: "1" }));
}

export async function updateGroupOrderSessionStatusAction(input: unknown) {
  const parsed = updateGroupSessionStatusInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "service-role-required" };
  }

  const { data: session } = await admin
    .from("group_order_sessions")
    .select("id,status")
    .eq("public_token", parsed.data.sessionToken)
    .eq("host_access_token", parsed.data.hostAccessToken)
    .maybeSingle();

  if (!session || session.status === "submitted") {
    return { ok: false, error: "closed" };
  }

  const { error } = await admin.from("group_order_sessions").update({ status: parsed.data.status }).eq("id", session.id);
  if (error) {
    return { ok: false, error: "status" };
  }

  return { ok: true };
}

export async function updateGroupParticipantByHostAction(input: unknown) {
  const parsed = updateGroupParticipantByHostInputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "invalid" };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "service-role-required" };
  }

  const { data: session } = await admin
    .from("group_order_sessions")
    .select("id,status")
    .eq("public_token", parsed.data.sessionToken)
    .eq("host_access_token", parsed.data.hostAccessToken)
    .maybeSingle();

  if (!session || !["open", "locked"].includes(session.status)) {
    return { ok: false, error: "closed" };
  }

  const paymentMethod =
    parsed.data.paymentStatus === "paid_qr"
      ? "qr"
      : parsed.data.paymentStatus === "cash_pending"
        ? "cash"
        : parsed.data.paymentStatus === "pending"
          ? null
          : "other";
  const { error } = await admin
    .from("group_order_participants")
    .update({
      payment_status: parsed.data.paymentStatus,
      payment_method: paymentMethod,
    })
    .eq("session_id", session.id)
    .eq("id", parsed.data.participantId);

  if (error) {
    return { ok: false, error: "participant" };
  }

  return { ok: true };
}

export async function submitGroupOrderSessionAction(formData: FormData) {
  const parsed = submitGroupOrderSessionSchema.safeParse({
    restaurantSlug: formData.get("restaurantSlug"),
    sessionToken: formData.get("sessionToken"),
    hostAccessToken: formData.get("hostAccessToken"),
    orderType: formData.get("orderType"),
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone") || undefined,
    customerAddress: formData.get("customerAddress") || undefined,
    deliveryAddressDetail: formData.get("deliveryAddressDetail") || undefined,
    deliveryLatitude: formData.get("deliveryLatitude") || undefined,
    deliveryLongitude: formData.get("deliveryLongitude") || undefined,
    deliveryMapsUrl: formData.get("deliveryMapsUrl") || undefined,
    deliveryCity: formData.get("deliveryCity") || undefined,
    paymentMethod: formData.get("paymentMethod") || "cash",
  });

  const restaurantSlug = String(formData.get("restaurantSlug") || "");
  const sessionToken = String(formData.get("sessionToken") || "");
  const hostAccessToken = String(formData.get("hostAccessToken") || "");

  if (!parsed.success) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "invalid-submit" }));
  }
  const submitData = parsed.data;

  if (submitData.orderType === "delivery" && !submitData.customerAddress?.trim()) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "delivery-address" }));
  }

  if (submitData.orderType === "delivery" && (submitData.customerPhone ?? "").replace(/\D/g, "").length < 4) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "phone-required" }));
  }

  const admin = createAdminClient();
  if (!admin) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "service-role-required" }));
  }
  const writeClient = admin;

  const { data: sessionRow } = await writeClient
    .from("group_order_sessions")
    .select("*")
    .eq("public_token", submitData.sessionToken)
    .eq("host_access_token", submitData.hostAccessToken)
    .maybeSingle();

  if (!sessionRow || !["open", "locked"].includes(sessionRow.status) || new Date(sessionRow.expires_at).getTime() <= Date.now()) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "closed" }));
  }
  const session = sessionRow;
  const publicClient = await createClient();

  const [{ data: participants }, { data: items }, settings, businessHours, publicRestaurant, deliveryZones] = await Promise.all([
    writeClient.from("group_order_participants").select("*").eq("session_id", session.id).order("created_at", { ascending: true }),
    writeClient.from("group_order_items").select("*").eq("session_id", session.id).order("created_at", { ascending: true }),
    getPublicOrderSettings(publicClient, session.restaurant_id),
    listPublicBusinessHours(publicClient, session.restaurant_id),
    validatePublicRestaurant(publicClient, session.restaurant_id, submitData.restaurantSlug),
    listPublicDeliveryZones(publicClient, session.restaurant_id),
  ]);

  if (!settings || !publicRestaurant) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "settings" }));
  }

  const orderTypeEnabled =
    (submitData.orderType === "delivery" && settings.delivery_enabled) ||
    (submitData.orderType === "pickup" && settings.pickup_enabled);
  if (!orderTypeEnabled) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "disabled" }));
  }

  if (await announcementService.hasActiveClosure(session.restaurant_id)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "temporarily-closed" }));
  }

  if (
    submitData.orderType === "delivery" &&
    (submitData.deliveryLatitude == null ||
      submitData.deliveryLongitude == null ||
      publicRestaurant.latitude == null ||
      publicRestaurant.longitude == null)
  ) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "delivery-location" }));
  }

  const nowInput = formatLocalDateTimeInput(new Date(), DEFAULT_RESTAURANT_TIME_ZONE);
  if (!isLocalDateTimeWithinBusinessHours(nowInput, businessHours)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "outside-hours" }));
  }

  if (!(await hasOpenCashSession(writeClient, session.restaurant_id))) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "no-open-cash" }));
  }

  const participantRows = participants ?? [];
  const participantById = new Map(participantRows.map((participant) => [participant.id, participant]));
  const includedParticipantIds = new Set(participantRows.filter((participant) => participant.payment_status !== "excluded").map((participant) => participant.id));
  const sourceItems = (items ?? []).filter((item) => includedParticipantIds.has(item.participant_id));

  if (!sourceItems.length) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "empty" }));
  }

  let resolvedItems: ResolvedCartItem[] = [];
  try {
    resolvedItems = await resolvePublicCartItems(
      writeClient,
      session.restaurant_id,
      sourceItems.map((item) => ({
        productId: item.product_id,
        variantId: item.variant_id ?? undefined,
        optionIds: item.option_ids,
        quantity: item.quantity,
        notes: item.notes ?? undefined,
      })),
    );
  } catch (error) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: error instanceof Error ? error.message : "product-not-found" }));
  }

  const subtotal = resolvedItems.reduce((sum, item) => sum + item.subtotal, 0);

  const deliveryPolicy =
    submitData.orderType === "delivery"
      ? resolveDeliveryPolicy({
          restaurantLocation: {
            latitude: Number(publicRestaurant.latitude),
            longitude: Number(publicRestaurant.longitude),
          },
          deliveryLocation: {
            latitude: Number(submitData.deliveryLatitude),
            longitude: Number(submitData.deliveryLongitude),
          },
          restaurantCity: publicRestaurant.city ?? "",
          deliveryCity: submitData.deliveryCity,
          zones: deliveryZones,
          subtotal,
          baseDeliveryFee: Number(settings.delivery_fee),
          baseMinOrderAmount: Number(settings.min_order_amount),
          qrPrepaymentEnabled: settings.delivery_qr_prepayment_enabled ?? true,
          freeDeliveryFrom: Number(settings.free_delivery_from ?? 0),
          farDeliveryDistanceKm: Number(settings.far_delivery_distance_km ?? 5),
        })
      : null;

  if (deliveryPolicy && !deliveryPolicy.sameCity) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "different-city" }));
  }

  const effectiveMinOrderAmount = deliveryPolicy?.minOrderAmount ?? Number(settings.min_order_amount);
  if (subtotal < effectiveMinOrderAmount) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "minimum" }));
  }

  if (deliveryPolicy?.requiresQrPrepayment && submitData.paymentMethod !== "qr") {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "qr-required-distance" }));
  }
  if (submitData.paymentMethod === "qr" && !normalizeQrPaymentUrl(settings.qr_payment_url)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "qr-unavailable" }));
  }

  const deliveryFee = deliveryPolicy?.deliveryFee ?? 0;
  const total = subtotal + deliveryFee;
  const paymentReceiptFile = formData.get("paymentReceiptFile") as File | null;

  if (submitData.paymentMethod === "qr" && (!paymentReceiptFile || paymentReceiptFile.size === 0)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "receipt-required" }));
  }
  if (isNonEmptyFile(paymentReceiptFile) && paymentReceiptFile.size > GROUP_UPLOAD_MAX_BYTES) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "receipt-size" }));
  }
  if (isNonEmptyFile(paymentReceiptFile) && !isAllowedFileType(paymentReceiptFile, GROUP_PRIVATE_RECEIPT_TYPES)) {
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: "receipt-type" }));
  }

  const paymentReceiptUrl =
    submitData.paymentMethod === "qr"
      ? await uploadPrivateFile(paymentReceiptFile, `restaurants/${session.restaurant_id}/payment-receipts`)
      : null;

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
  const notes = [
    "Yopido Grupal",
    `Host: ${session.host_name}${session.host_phone ? ` (${session.host_phone})` : ""}`,
    `Cobro: ${collectModeLabel(session.collect_mode)}`,
    participantSummary ? `Participantes:\n${participantSummary}` : "",
  ]
    .filter(Boolean)
    .join("\n\n");

  const { data: createdOrders, error } = await writeClient.rpc("create_public_order_transaction", {
    p_request_id: crypto.randomUUID(),
    p_order: {
      restaurant_id: session.restaurant_id,
      table_id: null,
      order_number: `PG-${Date.now().toString().slice(-7)}`,
      customer_name: submitData.customerName,
      customer_phone: submitData.customerPhone ?? session.host_phone,
      customer_email: null,
      customer_address: submitData.orderType === "delivery" ? submitData.customerAddress : null,
      delivery_address_detail: submitData.orderType === "delivery" ? (submitData.deliveryAddressDetail ?? null) : null,
      delivery_latitude: submitData.orderType === "delivery" ? (submitData.deliveryLatitude ?? null) : null,
      delivery_longitude: submitData.orderType === "delivery" ? (submitData.deliveryLongitude ?? null) : null,
      delivery_maps_url: submitData.orderType === "delivery" ? (submitData.deliveryMapsUrl ?? null) : null,
      delivery_distance_km: deliveryPolicy?.distanceKm == null ? null : Number(deliveryPolicy.distanceKm.toFixed(2)),
      requires_prepayment: deliveryPolicy?.requiresQrPrepayment ?? false,
      requested_fulfillment_at: null,
      invoice_required: false,
      invoice_document_type: null,
      invoice_document_number: null,
      invoice_name: null,
      order_type: submitData.orderType,
      order_origin: "web_checkout",
      payment_method: submitData.paymentMethod,
      payment_receipt_url: paymentReceiptUrl,
      payment_receipt_uploaded_at: paymentReceiptUrl ? new Date().toISOString() : null,
      subtotal,
      delivery_fee: deliveryFee,
      discount_total: 0,
      total,
      notes,
    },
    p_items: resolvedItems.map((item, index) => {
      const participant = participantById.get(sourceItems[index].participant_id);
      const participantNote = participant ? `Participante: ${participant.display_name}` : "Participante del grupo";
      return {
        product_id: item.productId,
        product_name: item.name,
        variant_id: item.variantId ?? null,
        option_ids: item.optionIds,
        unit_price: item.price,
        quantity: item.quantity,
        subtotal: item.subtotal,
        notes: [participantNote, item.notes].filter(Boolean).join(" | "),
      };
    }),
  });
  const order = createdOrders?.[0];

  if (error || !order) {
    const message = error?.message ?? "";
    redirect(groupOrderUrl(restaurantSlug, sessionToken, { host: hostAccessToken, error: message.includes("no-open-cash") ? "no-open-cash" : message.includes("invalid-public-order-items") ? "product-not-found" : "create-order" }));
  }
  const createdOrder = order;

  await writeClient
    .from("group_order_sessions")
    .update({
      status: "submitted",
      submitted_order_id: createdOrder.id,
      submitted_at: new Date().toISOString(),
      subtotal,
      delivery_fee: deliveryFee,
      total,
    })
    .eq("id", session.id);

  redirect(`${publicRestaurantPath(submitData.restaurantSlug, `pedido/${createdOrder.id}`)}?token=${createdOrder.tracking_token}&group=1`);
}
