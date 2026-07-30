import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { buildMobileOrderTrackingPayload } from "../_shared";
import { subscribeOrderToMobilePush } from "@/lib/services/mobile-push.service";

const trackingSchema = z.object({
  orderNumber: z.string().trim().min(3),
  customerPhone: z.string().trim().min(4),
  push: z
    .object({
      appVersion: z.string().trim().max(40).optional(),
      deviceId: z.string().trim().max(120).optional(),
      expoPushToken: z.string().trim().min(20).max(400),
      platform: z.string().trim().max(40).optional(),
    })
    .nullable()
    .optional(),
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
    .select("id,restaurant_id,tracking_token")
    .eq("order_number", parsed.data.orderNumber)
    .eq("customer_phone", parsed.data.customerPhone)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "order-not-found" }, { status: 404 });
  }

  const payload = await buildMobileOrderTrackingPayload({
    orderId: order.id,
    restaurantId: order.restaurant_id,
    supabase,
    trackingToken: order.tracking_token,
  });

  if (!payload) {
    return NextResponse.json({ error: "order-not-found" }, { status: 404 });
  }

  if (parsed.data.push?.expoPushToken) {
    await subscribeOrderToMobilePush(
      {
        appVersion: parsed.data.push.appVersion,
        customerPhone: parsed.data.customerPhone,
        deviceId: parsed.data.push.deviceId,
        expoPushToken: parsed.data.push.expoPushToken,
        orderId: order.id,
        platform: parsed.data.push.platform,
        restaurantId: order.restaurant_id,
      },
      supabase,
    );
  }

  return NextResponse.json(payload);
}
