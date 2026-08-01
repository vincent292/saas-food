import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getMobileCustomerSession } from "@/lib/services/customer-account.service";
import { subscribeOrderToMobilePush } from "@/lib/services/mobile-push.service";
import { DEFAULT_RESTAURANT_TIME_ZONE, getBusinessStatus } from "@/lib/utils/business-hours";

const itemSchema = z.object({
  productId: z.string().uuid(),
  variantId: z.string().uuid().optional(),
  optionIds: z.array(z.string().uuid()).optional().default([]),
  quantity: z.coerce.number().int().positive().max(99),
  notes: z.string().max(500).optional(),
});

const orderSchema = z.object({
  requestId: z.string().uuid(),
  restaurantId: z.string().uuid(),
  restaurantSlug: z.string().min(1),
  customerName: z.string().trim().min(1).max(120),
  customerPhone: z.string().trim().min(4).max(40),
  customerAddress: z.string().trim().max(500).optional(),
  deliveryLatitude: z.coerce.number().min(-90).max(90).optional(),
  deliveryLongitude: z.coerce.number().min(-180).max(180).optional(),
  deliveryMapsUrl: z.string().url().max(500).optional(),
  orderType: z.enum(["delivery", "pickup"]),
  paymentMethod: z.enum(["cash", "qr"]),
  push: z
    .object({
      appVersion: z.string().trim().max(40).optional(),
      deviceId: z.string().trim().max(120).optional(),
      expoPushToken: z.string().trim().min(20).max(400),
      platform: z.string().trim().max(40).optional(),
    })
    .nullable()
    .optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(itemSchema).min(1).max(100),
});

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

type OptionGroupRow = {
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

type BusinessHourRow = {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean | null;
};

export async function POST(request: Request) {
  const customerSession = await getMobileCustomerSession(request);
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = orderSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-order" }, { status: 400 });
  }

  if (parsed.data.orderType === "delivery" && !parsed.data.customerAddress?.trim()) {
    return NextResponse.json({ error: "delivery-address-required" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "service-role-required" }, { status: 500 });
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,slug,status,deleted_at")
    .eq("id", parsed.data.restaurantId)
    .eq("slug", parsed.data.restaurantSlug)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: "invalid-restaurant" }, { status: 404 });
  }

  const { data: businessHours } = await supabase
    .from("business_hours")
    .select("day_of_week,opens_at,closes_at,is_closed")
    .eq("restaurant_id", parsed.data.restaurantId)
    .order("day_of_week");
  const businessStatus = getBusinessStatus(
    ((businessHours ?? []) as BusinessHourRow[]).map((hour) => ({
      closesAt: hour.closes_at ?? "",
      dayOfWeek: hour.day_of_week,
      isClosed: Boolean(hour.is_closed),
      opensAt: hour.opens_at ?? "",
    })),
    new Date(),
    DEFAULT_RESTAURANT_TIME_ZONE,
  );

  if (businessStatus.hasSchedule && !businessStatus.isOpen) {
    return NextResponse.json({ error: "outside-hours" }, { status: 409 });
  }

  const productIds = Array.from(new Set(parsed.data.items.map((item) => item.productId)));
  const optionIds = Array.from(new Set(parsed.data.items.flatMap((item) => item.optionIds ?? [])));
  const variantIds = Array.from(new Set(parsed.data.items.map((item) => item.variantId).filter((id): id is string => Boolean(id))));
  const [{ data: products, error: productsError }, { data: variants }, { data: optionGroups }, { data: options }, { data: settings }] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,price,is_available")
      .eq("restaurant_id", parsed.data.restaurantId)
      .in("id", productIds),
    variantIds.length
      ? supabase
          .from("product_variants")
          .select("id,product_id,name,price_delta,is_active")
          .eq("restaurant_id", parsed.data.restaurantId)
          .in("id", variantIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("product_option_groups")
      .select("id,product_id,min_choices,max_choices,is_required,is_active")
      .eq("restaurant_id", parsed.data.restaurantId)
      .in("product_id", productIds),
    optionIds.length
      ? supabase
          .from("product_options")
          .select("id,product_id,option_group_id,name,price_delta,is_active")
          .eq("restaurant_id", parsed.data.restaurantId)
          .in("id", optionIds)
      : Promise.resolve({ data: [], error: null }),
    supabase
      .from("restaurant_settings")
      .select("delivery_fee")
      .eq("restaurant_id", parsed.data.restaurantId)
      .maybeSingle(),
  ]);

  if (productsError || !products || products.length !== productIds.length) {
    return NextResponse.json({ error: "invalid-public-order-items" }, { status: 400 });
  }

  const productsById = new Map((products as ProductPriceRow[]).map((product) => [product.id, product]));
  const variantsById = new Map(((variants ?? []) as VariantPriceRow[]).map((variant) => [variant.id, variant]));
  const optionsById = new Map(((options ?? []) as OptionPriceRow[]).map((option) => [option.id, option]));
  const groupsByProduct = new Map<string, OptionGroupRow[]>();
  ((optionGroups ?? []) as OptionGroupRow[]).forEach((group) => {
    const current = groupsByProduct.get(group.product_id) ?? [];
    current.push(group);
    groupsByProduct.set(group.product_id, current);
  });

  const items = [];
  for (const item of parsed.data.items) {
    const product = productsById.get(item.productId);
    if (!product?.is_available) {
      return NextResponse.json({ error: "invalid-public-order-items" }, { status: 400 });
    }

    const variant = item.variantId ? variantsById.get(item.variantId) : null;
    if (item.variantId && (!variant?.is_active || variant.product_id !== item.productId)) {
      return NextResponse.json({ error: "invalid-public-order-items" }, { status: 400 });
    }

    const selectedOptions = (item.optionIds ?? []).map((optionId) => optionsById.get(optionId));
    if (selectedOptions.some((option) => !option?.is_active || option.product_id !== item.productId)) {
      return NextResponse.json({ error: "invalid-public-order-items" }, { status: 400 });
    }

    const selectedOptionRows = selectedOptions.filter((option): option is OptionPriceRow => Boolean(option));
    for (const group of groupsByProduct.get(item.productId) ?? []) {
      if (!group.is_active) continue;
      const selectedCount = selectedOptionRows.filter((option) => option.option_group_id === group.id).length;
      if (selectedCount < group.min_choices || selectedCount > group.max_choices || (group.is_required && selectedCount === 0)) {
        return NextResponse.json({ error: "product-configuration" }, { status: 400 });
      }
    }

    const detailNotes = [variant?.name, ...selectedOptionRows.map((option) => option.name), item.notes].filter(Boolean).join(" | ") || null;
    const unitPrice = Number(product.price) + Number(variant?.price_delta ?? 0) + selectedOptionRows.reduce((sum, option) => sum + Number(option.price_delta), 0);
    items.push({
      product_id: product.id,
      product_name: variant ? `${product.name} - ${variant.name}` : product.name,
      variant_id: variant?.id ?? null,
      option_ids: selectedOptionRows.map((option) => option.id),
      unit_price: unitPrice,
      quantity: item.quantity,
      subtotal: Number((unitPrice * item.quantity).toFixed(2)),
      notes: detailNotes,
    });
  }

  const subtotal = Number(items.reduce((sum, item) => sum + item.subtotal, 0).toFixed(2));
  const deliveryFee = parsed.data.orderType === "delivery" ? Number(settings?.delivery_fee ?? 0) : 0;
  const total = Number((subtotal + deliveryFee).toFixed(2));
  const orderNumber = `P-${Date.now().toString().slice(-6)}`;

  const { data: createdOrders, error } = await supabase.rpc("create_public_order_transaction", {
    p_request_id: parsed.data.requestId,
    p_order: {
      restaurant_id: parsed.data.restaurantId,
      table_id: null,
      order_number: orderNumber,
      customer_name: parsed.data.customerName,
      customer_phone: parsed.data.customerPhone,
      customer_email: null,
      customer_address: parsed.data.customerAddress ?? null,
      delivery_address_detail: null,
      delivery_latitude: parsed.data.deliveryLatitude ?? null,
      delivery_longitude: parsed.data.deliveryLongitude ?? null,
      delivery_maps_url: parsed.data.deliveryMapsUrl ?? null,
      delivery_distance_km: null,
      requires_prepayment: false,
      requested_fulfillment_at: null,
      invoice_required: false,
      invoice_document_type: null,
      invoice_document_number: null,
      invoice_name: null,
      order_type: parsed.data.orderType,
      order_origin: "web_checkout",
      payment_method: parsed.data.paymentMethod,
      payment_receipt_url: null,
      payment_receipt_uploaded_at: null,
      subtotal,
      delivery_fee: deliveryFee,
      discount_total: 0,
      total,
      notes: parsed.data.notes?.trim() || "Pedido desde app movil",
    },
    p_items: items,
  });

  const order = createdOrders?.[0];
  if (error || !order) {
    const message = error?.message ?? "order-create-failed";
    const key = message.includes("product-configuration")
      ? "product-configuration"
      : message.includes("invalid-public-order-items")
        ? "invalid-public-order-items"
        : message.includes("invalid-restaurant")
          ? "invalid-restaurant"
          : "order-create-failed";
    return NextResponse.json({ error: key }, { status: 400 });
  }

  if (customerSession.ok) {
    await supabase
      .from("orders")
      .update({
        customer_id: customerSession.user.id,
        customer_email: customerSession.user.email?.trim().toLowerCase() ?? null,
      })
      .eq("id", order.id);
  }

  const { data: savedOrder } = await supabase
    .from("orders")
    .select("order_number")
    .eq("id", order.id)
    .maybeSingle();

  if (parsed.data.push?.expoPushToken) {
    await subscribeOrderToMobilePush(
      {
        appVersion: parsed.data.push.appVersion,
        customerPhone: parsed.data.customerPhone,
        deviceId: parsed.data.push.deviceId,
        expoPushToken: parsed.data.push.expoPushToken,
        orderId: order.id,
        platform: parsed.data.push.platform,
        restaurantId: parsed.data.restaurantId,
      },
      supabase,
    );
  }

  return NextResponse.json({
    orderId: order.id,
    orderNumber: savedOrder?.order_number ?? orderNumber,
    trackingToken: order.tracking_token,
  });
}
