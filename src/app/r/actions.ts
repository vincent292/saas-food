"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

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

  const subtotal = parsed.data.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const supabase = await createClient();
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
