import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";

const trackingSchema = z.object({
  orderNumber: z.string().trim().min(3),
  customerPhone: z.string().trim().min(4),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = trackingSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-tracking" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "service-role-required" }, { status: 500 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id,restaurant_id,order_number,order_type,status,total,customer_phone,created_at,accepted_at,preparing_at,ready_at,delivered_at,cancelled_at,cancellation_reason,updated_at")
    .eq("order_number", parsed.data.orderNumber)
    .eq("customer_phone", parsed.data.customerPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "order-not-found" }, { status: 404 });
  }

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,name,slug")
    .eq("id", order.restaurant_id)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!restaurant) {
    return NextResponse.json({ error: "order-not-found" }, { status: 404 });
  }

  return NextResponse.json({
    restaurantName: restaurant.name,
    restaurantSlug: restaurant.slug,
    orderId: order.id,
    orderNumber: order.order_number,
    orderType: order.order_type,
    status: order.status,
    total: order.total,
    createdAt: order.created_at,
    acceptedAt: order.accepted_at,
    preparingAt: order.preparing_at,
    readyAt: order.ready_at,
    deliveredAt: order.delivered_at,
    cancelledAt: order.cancelled_at,
    cancellationReason: order.cancellation_reason,
    updatedAt: order.updated_at,
  });
}
