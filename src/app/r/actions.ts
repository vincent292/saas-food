"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { uploadPublicImage } from "@/lib/supabase/storage";
import { DEFAULT_RESTAURANT_TIME_ZONE, formatLocalDateTimeInput, isLocalDateTimeWithinBusinessHours, localDateTimeInputToIso } from "@/lib/utils/business-hours";
import type { BusinessHour } from "@/types/restaurant.types";

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
  restaurantId: z.string().min(1),
  restaurantSlug: z.string().min(1),
  tableId: z.string().uuid().optional(),
  tableCode: z.string().optional(),
  customerName: z.string().min(1),
  customerPhone: z.string().optional(),
  customerEmail: z.string().email().optional().or(z.literal("")),
  customerAddress: z.string().optional(),
  deliveryAddressDetail: z.string().optional(),
  deliveryMapsUrl: z.string().optional(),
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

type TrackingLookupPayload = {
  id?: string;
  tracking_token?: string;
};

type PublicOrderSettings = {
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  table_orders_enabled: boolean;
  delivery_fee: number;
  free_delivery_from: number | null;
  min_order_amount: number;
  invoice_enabled: boolean;
  qr_payment_url: string | null;
};

type ParsedCartItem = z.infer<typeof cartItemSchema>;

type ResolvedCartItem = {
  productId: string;
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

async function getOrCreatePublicOrderSettings(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string) {
  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("delivery_enabled,pickup_enabled,table_orders_enabled,delivery_fee,free_delivery_from,min_order_amount,invoice_enabled,qr_payment_url")
    .eq("restaurant_id", restaurantId)
    .maybeSingle();

  if (settings) {
    return settings as PublicOrderSettings;
  }

  const admin = createAdminClient();
  if (!admin) {
    return null;
  }

  const { data: createdSettings } = await admin
    .from("restaurant_settings")
    .upsert(
      {
        restaurant_id: restaurantId,
        delivery_enabled: true,
        pickup_enabled: true,
        table_orders_enabled: true,
        inventory_enabled: true,
        cash_enabled: true,
        kitchen_enabled: true,
        delivery_fee: 0,
        min_order_amount: 0,
        invoice_enabled: false,
        currency: "BOB",
      },
      { onConflict: "restaurant_id" },
    )
    .select("delivery_enabled,pickup_enabled,table_orders_enabled,delivery_fee,free_delivery_from,min_order_amount,invoice_enabled,qr_payment_url")
    .maybeSingle();

  return (createdSettings as PublicOrderSettings | null) ?? null;
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

async function resolvePublicCartItems(supabase: Awaited<ReturnType<typeof createClient>>, restaurantId: string, cart: ParsedCartItem[]) {
  const productIds = Array.from(new Set(cart.map((item) => item.productId)));
  const optionIds = Array.from(new Set(cart.flatMap((item) => item.optionIds ?? [])));

  const [{ data: productRows, error: productsError }, { data: variantRows }, { data: groupRows }, { data: optionRows }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,price,is_available")
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

    if (!product?.is_available) {
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
    redirect(`/r/${formData.get("restaurantSlug")}/checkout?error=invalid`);
  }
  const parsed = orderSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug"),
    tableId: formData.get("tableId") || undefined,
    tableCode: formData.get("tableCode") || undefined,
    customerName: formData.get("customerName"),
    customerPhone: formData.get("customerPhone") || undefined,
    customerEmail: formData.get("customerEmail") || undefined,
    customerAddress: formData.get("customerAddress") || undefined,
    deliveryAddressDetail: formData.get("deliveryAddressDetail") || undefined,
    deliveryMapsUrl: formData.get("deliveryMapsUrl") || undefined,
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
    redirect(`/r/${formData.get("restaurantSlug")}/checkout?error=invalid`);
  }

  const failPath = parsed.data.tableCode ? `/r/${parsed.data.restaurantSlug}/mesa/${parsed.data.tableCode}` : `/r/${parsed.data.restaurantSlug}`;
  const supabase = await createClient();
  const writeClient = createAdminClient();
  if (!writeClient) {
    redirect(`${failPath}?error=service-role-required`);
  }
  const { data: hasOpenCashSession } = await supabase.rpc("has_open_cash_session_public", {
    p_restaurant_id: parsed.data.restaurantId,
  });

  if (!hasOpenCashSession) {
    redirect(`${failPath}?error=no-open-cash`);
  }

  const settings = await getOrCreatePublicOrderSettings(supabase, parsed.data.restaurantId);

  if (!settings) {
    redirect(`/r/${parsed.data.restaurantSlug}/checkout?error=settings`);
  }

  let resolvedCart: ResolvedCartItem[];
  try {
    resolvedCart = await resolvePublicCartItems(supabase, parsed.data.restaurantId, parsed.data.cart);
  } catch (error) {
    const key = error instanceof Error ? error.message : "invalid-cart";
    redirect(`${failPath}?error=${encodeURIComponent(key)}`);
  }

  const subtotal = resolvedCart.reduce((sum, item) => sum + item.subtotal, 0);

  const businessHours = await listPublicBusinessHours(supabase, parsed.data.restaurantId);
  const requestedFulfillmentAt = parsed.data.requestedFulfillmentAt?.trim();
  const isPublicFulfillmentOrder = parsed.data.orderType === "delivery" || parsed.data.orderType === "pickup";
  const nowInput = formatLocalDateTimeInput(new Date(), DEFAULT_RESTAURANT_TIME_ZONE);

  const orderTypeEnabled =
    (parsed.data.orderType === "delivery" && settings.delivery_enabled) ||
    (parsed.data.orderType === "pickup" && settings.pickup_enabled) ||
    (parsed.data.orderType === "table" && settings.table_orders_enabled);

  if (!orderTypeEnabled) {
    redirect(`/r/${parsed.data.restaurantSlug}/checkout?error=disabled`);
  }

  if (parsed.data.orderType === "delivery" && !parsed.data.customerAddress?.trim()) {
    redirect(`${failPath}?error=delivery-address`);
  }

  if (parsed.data.invoiceRequired && (!parsed.data.invoiceDocumentType || !parsed.data.invoiceDocumentNumber?.trim() || !parsed.data.invoiceName?.trim())) {
    redirect(`${failPath}?error=invoice`);
  }

  if (parsed.data.invoiceRequired && !settings.invoice_enabled) {
    redirect(`${failPath}?error=invoice-disabled`);
  }

  if (subtotal < Number(settings.min_order_amount)) {
    redirect(`/r/${parsed.data.restaurantSlug}/checkout?error=minimum`);
  }

  const paymentReceiptFile = formData.get("paymentReceiptFile") as File | null;
  if (parsed.data.paymentMethod === "qr" && !settings.qr_payment_url) {
    redirect(`${failPath}?error=qr-unavailable`);
  }

  if (parsed.data.paymentMethod === "qr" && (!paymentReceiptFile || paymentReceiptFile.size === 0)) {
    redirect(`${failPath}?error=receipt-required`);
  }

  if (isPublicFulfillmentOrder) {
    if (!requestedFulfillmentAt && !isLocalDateTimeWithinBusinessHours(nowInput, businessHours)) {
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
  }

  const paymentReceiptUrl =
    parsed.data.paymentMethod === "qr"
      ? await uploadPublicImage(paymentReceiptFile, `restaurants/${parsed.data.restaurantId}/payment-receipts`)
      : null;

  const freeDeliveryFrom = Number(settings.free_delivery_from ?? 0);
  const deliveryFee =
    parsed.data.orderType === "delivery" && (!freeDeliveryFrom || subtotal < freeDeliveryFrom)
      ? Number(settings.delivery_fee)
      : 0;
  const total = subtotal + deliveryFee;
  const orderNumber = `P-${Date.now().toString().slice(-6)}`;

  const { data: order, error } = await writeClient
    .from("orders")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      table_id: parsed.data.tableId ?? null,
      order_number: orderNumber,
      customer_name: parsed.data.customerName,
      customer_phone: parsed.data.customerPhone,
      customer_email: parsed.data.customerEmail || null,
      customer_address: parsed.data.customerAddress,
      delivery_address_detail: parsed.data.deliveryAddressDetail ?? null,
      delivery_maps_url: parsed.data.deliveryMapsUrl ?? null,
      requested_fulfillment_at: requestedFulfillmentAt ? localDateTimeInputToIso(requestedFulfillmentAt, DEFAULT_RESTAURANT_TIME_ZONE) : null,
      invoice_required: parsed.data.invoiceRequired,
      invoice_document_type: parsed.data.invoiceRequired ? parsed.data.invoiceDocumentType : null,
      invoice_document_number: parsed.data.invoiceRequired ? parsed.data.invoiceDocumentNumber : null,
      invoice_name: parsed.data.invoiceRequired ? parsed.data.invoiceName : null,
      order_type: parsed.data.orderType,
      status: "pending",
      payment_status: "pending",
      payment_method: parsed.data.paymentMethod,
      payment_receipt_url: paymentReceiptUrl,
      payment_receipt_uploaded_at: paymentReceiptUrl ? new Date().toISOString() : null,
      subtotal,
      delivery_fee: deliveryFee,
      discount_total: 0,
      total,
      notes: parsed.data.notes,
    })
    .select("id, tracking_token")
    .single();

  if (error || !order) {
    redirect(`/r/${parsed.data.restaurantSlug}/checkout?error=create`);
  }

  const { error: itemsError } = await writeClient.from("order_items").insert(
    resolvedCart.map((item) => ({
      order_id: order.id,
      product_id: item.productId,
      product_name: item.name,
      unit_price: item.price,
      quantity: item.quantity,
      subtotal: item.subtotal,
      notes: item.notes,
    })),
  );

  if (itemsError) {
    await writeClient.from("orders").delete().eq("id", order.id);
    redirect(`/r/${parsed.data.restaurantSlug}/checkout?error=create-items`);
  }

  redirect(`/r/${parsed.data.restaurantSlug}/pedido/${order.id}?token=${order.tracking_token}`);
}

export async function trackPublicOrderAction(formData: FormData) {
  const parsed = trackingLookupSchema.safeParse({
    restaurantId: formData.get("restaurantId"),
    restaurantSlug: formData.get("restaurantSlug"),
    orderNumber: formData.get("orderNumber"),
    customerPhone: formData.get("customerPhone"),
  });

  if (!parsed.success) {
    redirect(`/r/${formData.get("restaurantSlug")}/seguimiento?error=invalid`);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_public_order_lookup", {
    p_restaurant_id: parsed.data.restaurantId,
    p_order_number: parsed.data.orderNumber,
    p_customer_phone: parsed.data.customerPhone,
  });
  const payload = data as TrackingLookupPayload | null;

  if (error || !payload?.id || !payload.tracking_token) {
    redirect(`/r/${parsed.data.restaurantSlug}/seguimiento?error=not-found`);
  }

  redirect(`/r/${parsed.data.restaurantSlug}/pedido/${payload.id}?token=${payload.tracking_token}`);
}
