import type { MobileRiderSession } from "./rider-mobile.service";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type Admin = SupabaseClient<Database>;
const unavailable = { ok: false as const, error: "multisite-delivery-unavailable", status: 503 };

export async function listRiderMultisiteRoutes(session: MobileRiderSession, orderId?: string) {
  const admin = session.admin as Admin;
  const ids = session.activeRiders.map((rider) => rider.id);
  if (!ids.length) return { ok: false as const, error: "rider-membership-inactive", status: 403 };
  let query = admin.from("multisite_delivery_dispatches").select("*").eq("rider_user_id", session.user.id).in("restaurant_rider_id", ids);
  query = orderId ? query.eq("multisite_order_id", orderId) : query.in("status", ["active", "arrived"]);
  const { data: dispatches, error } = await query.order("assigned_at", { ascending: false });
  if (error) return unavailable;
  if (orderId && !dispatches?.length) return { ok: false as const, error: "multisite-dispatch-not-found", status: 404 };
  const orderIds = (dispatches ?? []).map((dispatch) => dispatch.multisite_order_id);
  if (!orderIds.length) return { ok: true as const, data: { routes: [], updatedAt: new Date().toISOString() } };
  const [{ data: masters, error: masterError }, { data: children, error: childError }] = await Promise.all([
    admin.from("multisite_orders").select("id,status,customer_name,customer_phone,customer_address,delivery_latitude,delivery_longitude,total").in("id", orderIds),
    admin.from("multisite_order_children").select("*").in("multisite_order_id", orderIds).order("pickup_position"),
  ]);
  if (masterError || childError) return unavailable;
  const restaurantIds = [...new Set((children ?? []).map((child) => child.restaurant_id))];
  const childOrderIds = (children ?? []).map((child) => child.order_id);
  const [{ data: restaurants, error: restaurantError }, { data: orders, error: orderError }] = await Promise.all([
    admin.from("restaurants").select("id,name,address,latitude,longitude").in("id", restaurantIds),
    admin.from("orders").select("id,order_number,status").in("id", childOrderIds),
  ]);
  if (restaurantError || orderError) return unavailable;
  const masterById = new Map((masters ?? []).map((master) => [master.id, master]));
  const restaurantById = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]));
  const orderById = new Map((orders ?? []).map((order) => [order.id, order]));
  return { ok: true as const, data: { routes: (dispatches ?? []).flatMap((dispatch) => {
    const master = masterById.get(dispatch.multisite_order_id);
    if (!master) return [];
    return [{ id: master.id, status: master.status, dispatchStatus: dispatch.status, acceptedFee: Number(dispatch.accepted_fee), total: Number(master.total),
      lifecycleAvailable: typeof dispatch.delivery_confirmation_code === "string",
      customerName: master.customer_name, customerPhone: master.customer_phone,
      destination: { address: master.customer_address, latitude: master.delivery_latitude == null ? null : Number(master.delivery_latitude), longitude: master.delivery_longitude == null ? null : Number(master.delivery_longitude) },
      pickups: (children ?? []).filter((child) => child.multisite_order_id === master.id).map((child) => {
        const restaurant = restaurantById.get(child.restaurant_id), order = orderById.get(child.order_id);
        return { id: child.id, orderId: child.order_id, orderNumber: order?.order_number ?? "", position: child.pickup_position,
          restaurantName: restaurant?.name ?? "Local", address: restaurant?.address ?? "", latitude: restaurant?.latitude ?? null, longitude: restaurant?.longitude ?? null,
          status: order?.status ?? child.status, pickedUpAt: child.picked_up_at ?? null };
      }),
      // Never return the confirmation codes to the rider who must enter them.
    }];
  }), updatedAt: new Date().toISOString() } };
}

export async function advanceRiderMultisiteRoute(session: MobileRiderSession, orderId: string, input: { action: "pickup" | "delivered"; childId?: string; confirmationCode: string }) {
  if (!session.activeRiders.length) return { ok: false as const, error: "rider-membership-inactive", status: 403 };
  const { data, error } = await (session.admin as Admin).rpc("advance_multisite_delivery", {
    p_order_id: orderId, p_rider_user_id: session.user.id, p_action: input.action, p_child_id: input.childId ?? null, p_code: input.confirmationCode,
  });
  if (error || !data || typeof data !== "object" || Array.isArray(data)) return unavailable;
  if (!data.ok) return { ok: false as const, error: typeof data.error === "string" ? data.error : "multisite-route-not-active", status: data.error === "multisite-dispatch-not-found" ? 404 : 409 };
  return { ok: true as const, data };
}

export async function updateRiderMultisiteLocation(session: MobileRiderSession, orderId: string, point: { latitude: number; longitude: number }) {
  if (!session.activeRiders.length) return { ok: false as const, error: "rider-membership-inactive", status: 403 };
  if (!Number.isFinite(point.latitude) || !Number.isFinite(point.longitude) || Math.abs(point.latitude) > 90 || Math.abs(point.longitude) > 180) return { ok: false as const, error: "invalid-rider-location", status: 400 };
  const updatedAt = new Date().toISOString();
  const { data, error } = await (session.admin as Admin).from("multisite_delivery_dispatches")
    .update({ rider_latitude: point.latitude, rider_longitude: point.longitude, rider_location_updated_at: updatedAt })
    .eq("multisite_order_id", orderId).eq("rider_user_id", session.user.id)
    .in("restaurant_rider_id", session.activeRiders.map((rider) => rider.id)).in("status", ["active", "arrived"]).select("id").maybeSingle();
  if (error) return unavailable;
  return data ? { ok: true as const, data: { updatedAt } } : { ok: false as const, error: "multisite-dispatch-not-found", status: 404 };
}
