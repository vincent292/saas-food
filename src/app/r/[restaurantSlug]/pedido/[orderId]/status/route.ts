import { NextResponse } from "next/server";
import { orderService } from "@/lib/services/order.service";
import { restaurantService } from "@/lib/services/restaurant.service";

export async function GET(
  request: Request,
  {
    params,
  }: {
    params: Promise<{ restaurantSlug: string; orderId: string }>;
  },
) {
  const { restaurantSlug, orderId } = await params;
  const token = new URL(request.url).searchParams.get("token")?.trim();
  const restaurant = await restaurantService.getBySlug(restaurantSlug);

  if (!restaurant) {
    return NextResponse.json({ error: "restaurant-not-found" }, { status: 404 });
  }

  const status = token
    ? await orderService.getPublicStatusByTracking(restaurant.id, orderId, token)
    : await orderService.getStatusById(restaurant.id, orderId);

  if (!status) {
    return NextResponse.json({ error: "order-not-found" }, { status: 404 });
  }

  return NextResponse.json(status, {
    headers: {
      "Cache-Control": "no-store",
    },
  });
}
