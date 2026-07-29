import { NextResponse } from "next/server";
import { z } from "zod";
import { buildMobileOrderTrackingPayload } from "../_shared";
import { createAdminClient } from "@/lib/supabase/admin";

const statusSchema = z.object({
  orderId: z.string().uuid(),
  trackingToken: z.string().trim().min(8),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-tracking" }, { status: 400 });
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json({ error: "service-role-required" }, { status: 500 });
  }

  const { data: order } = await supabase
    .from("orders")
    .select("id,restaurant_id")
    .eq("id", parsed.data.orderId)
    .eq("tracking_token", parsed.data.trackingToken)
    .maybeSingle();

  if (!order) {
    return NextResponse.json({ error: "order-not-found" }, { status: 404 });
  }

  const payload = await buildMobileOrderTrackingPayload({
    orderId: order.id,
    restaurantId: order.restaurant_id,
    supabase,
    trackingToken: parsed.data.trackingToken,
  });

  if (!payload) {
    return NextResponse.json({ error: "order-not-found" }, { status: 404 });
  }

  return NextResponse.json(payload);
}
