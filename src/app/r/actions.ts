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
  const deliveryFee = parsed.data.orderType === "delivery" ? 0 : 0;
  const total = subtotal + deliveryFee;
  const orderNumber = `P-${Date.now().toString().slice(-6)}`;
  const supabase = await createClient();

  const { data: order, error } = await supabase
    .from("orders")
    .insert({
      restaurant_id: parsed.data.restaurantId,
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
