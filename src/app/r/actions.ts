"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { uploadPublicImage } from "@/lib/supabase/storage";

const cartItemSchema = z.object({
  productId: z.string().min(1),
  name: z.string().min(1),
  price: z.coerce.number().nonnegative(),
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
  customerAddress: z.string().optional(),
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
    customerAddress: formData.get("customerAddress") || undefined,
    orderType: formData.get("orderType"),
    paymentMethod: formData.get("paymentMethod"),
    notes: formData.get("notes") || undefined,
    cart,
  });

  if (!parsed.success) {
    redirect(`/r/${formData.get("restaurantSlug")}/checkout?error=invalid`);
  }

  const failPath = parsed.data.tableCode ? `/r/${parsed.data.restaurantSlug}/mesa/${parsed.data.tableCode}` : `/r/${parsed.data.restaurantSlug}`;
  const subtotal = parsed.data.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const supabase = await createClient();
  const { data: hasOpenCashSession } = await supabase.rpc("has_open_cash_session_public", {
    p_restaurant_id: parsed.data.restaurantId,
  });

  if (!hasOpenCashSession) {
    redirect(`${failPath}?error=no-open-cash`);
  }

  const { data: settings } = await supabase
    .from("restaurant_settings")
    .select("delivery_enabled,pickup_enabled,table_orders_enabled,delivery_fee,free_delivery_from,min_order_amount")
    .eq("restaurant_id", parsed.data.restaurantId)
    .maybeSingle();

  if (!settings) {
    redirect(`/r/${parsed.data.restaurantSlug}/checkout?error=settings`);
  }

  const orderTypeEnabled =
    (parsed.data.orderType === "delivery" && settings.delivery_enabled) ||
    (parsed.data.orderType === "pickup" && settings.pickup_enabled) ||
    (parsed.data.orderType === "table" && settings.table_orders_enabled);

  if (!orderTypeEnabled) {
    redirect(`/r/${parsed.data.restaurantSlug}/checkout?error=disabled`);
  }

  if (subtotal < Number(settings.min_order_amount)) {
    redirect(`/r/${parsed.data.restaurantSlug}/checkout?error=minimum`);
  }

  const paymentReceiptFile = formData.get("paymentReceiptFile") as File | null;
  if (parsed.data.paymentMethod === "qr" && (!paymentReceiptFile || paymentReceiptFile.size === 0)) {
    redirect(`${failPath}?error=receipt-required`);
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

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      restaurant_id: parsed.data.restaurantId,
      table_id: parsed.data.tableId ?? null,
      order_number: orderNumber,
      customer_name: parsed.data.customerName,
      customer_phone: parsed.data.customerPhone,
      customer_address: parsed.data.customerAddress,
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

  await supabase.from("order_items").insert(
    parsed.data.cart.map((item) => ({
      order_id: order.id,
      product_id: /^[0-9a-f-]{36}$/i.test(item.productId) ? item.productId : null,
      product_name: item.name,
      unit_price: item.price,
      quantity: item.quantity,
      subtotal: item.price * item.quantity,
      notes: item.notes,
    })),
  );

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
