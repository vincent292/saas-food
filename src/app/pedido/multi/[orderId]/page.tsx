import { notFound } from "next/navigation";
import { MultisiteOrderSuccessClient } from "@/components/public-menu/MultisiteOrderSuccessClient";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PublicMultisiteOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  const [{ orderId }, { token }] = await Promise.all([params, searchParams]);
  if (!token || !/^[a-f0-9]{32}$/i.test(orderId) && !/^[0-9a-f-]{36}$/i.test(orderId)) notFound();
  const admin = createAdminClient();
  if (!admin) notFound();

  const { data: order } = await admin
    .from("multisite_orders")
    .select("id,tracking_token,status,subtotal,delivery_fee,total")
    .eq("id", orderId)
    .eq("tracking_token", token)
    .maybeSingle();
  if (!order) notFound();

  const { data: children } = await admin
    .from("multisite_order_children")
    .select("restaurant_id,order_id,pickup_position,estimated_ready_minutes,subtotal,status")
    .eq("multisite_order_id", order.id)
    .order("pickup_position");
  const restaurantIds = (children ?? []).map((child) => child.restaurant_id);
  const orderIds = (children ?? []).map((child) => child.order_id);
  const [{ data: restaurants }, { data: childOrders }] = await Promise.all([
    restaurantIds.length ? admin.from("restaurants").select("id,name,slug").in("id", restaurantIds) : Promise.resolve({ data: [] }),
    orderIds.length ? admin.from("orders").select("id,order_number,status").in("id", orderIds) : Promise.resolve({ data: [] }),
  ]);
  const restaurantById = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]));
  const orderById = new Map((childOrders ?? []).map((childOrder) => [childOrder.id, childOrder]));

  return <MultisiteOrderSuccessClient order={{
    id: order.id,
    trackingToken: order.tracking_token,
    status: order.status,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    total: Number(order.total),
    children: (children ?? []).map((child) => {
      const restaurant = restaurantById.get(child.restaurant_id);
      const childOrder = orderById.get(child.order_id);
      return {
        restaurantName: restaurant?.name ?? "Local",
        restaurantSlug: restaurant?.slug ?? "",
        orderNumber: childOrder?.order_number ?? child.order_id.slice(0, 8),
        status: childOrder?.status ?? child.status,
        pickupPosition: child.pickup_position,
        estimatedReadyMinutes: child.estimated_ready_minutes,
        subtotal: Number(child.subtotal),
      };
    }),
  }} />;
}
