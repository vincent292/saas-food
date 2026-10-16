import "server-only";
import { randomUUID } from "node:crypto";
import { after } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { cancelReservedGroupQr, emitReservedGroupQr } from "@/lib/services/bank-qr.service";
import { boliviaDate } from "@/lib/payments/baneco";
import { planMultisiteGroupOrder } from "@/lib/group-orders/multisite-planner";
import { forecastMultisiteKitchenReadyIn } from "@/lib/group-orders/kitchen-forecast";
import { announcementService } from "@/lib/services/announcement.service";
import { sendRestaurantNewOrderPush, sendOrderStatusPush } from "@/lib/services/mobile-push.service";
import { offerNextRiderForOrder } from "@/lib/services/rider-dispatch.service";
import { resolveDeliveryPolicy } from "@/lib/delivery-policy";
import { deliveryRateService } from "@/lib/services/delivery-rate.service";
import { formatLocalDateTimeInput, isLocalDateTimeWithinBusinessHours, DEFAULT_RESTAURANT_TIME_ZONE } from "@/lib/utils/business-hours";
import type { Database, Json } from "@/types/database.types";
type Bill = Database["public"]["Tables"]["bank_group_bills"]["Row"];
type Item = Database["public"]["Tables"]["group_order_items"]["Row"];
export type GroupBankAccess = { sessionToken: string; secret: string; host: boolean };
function check<T>(result: { data: T; error: { message?: string } | null }) {
  if (result.error) {
    const code = result.error.message ?? "";
    throw new Error(/^(group-[a-z-]+|bank-[a-z-]+|lock-required|already-submitting|no-open-cash)$/.test(code) ? code : "group-bank-unavailable");
  }
  return result.data;
}
async function context(access: GroupBankAccess) {
  const admin = createAdminClient();
  if (!admin) throw new Error("group-bank-unavailable");
  const session = check(await admin.from("group_order_sessions").select("*").eq("public_token", access.sessionToken).maybeSingle());
  if (!session?.bank_payments) throw new Error("group-bank-unavailable");
  const participants = check(await admin.from("group_order_participants").select("id,display_name,participant_token,payment_status").eq("session_id", session.id)) ?? [];
  const actor = access.host && access.secret === session.host_access_token
    ? participants.find(row => row.id === session.host_participant_id)
    : !access.host ? participants.find(row => row.participant_token === access.secret) : null;
  if (!actor) throw new Error("group-bank-forbidden");
  return { admin, session, participants, actor };
}
export type GroupBillView = { id?: string; participantId: string; participantName: string; restaurantId: string; restaurantName: string;
  amount: number; status: string; collectionRoute?: string; image?: string | null; orderId?: string | null; canReset: boolean };
function funded(bill: Bill) { return !bill.voided_at && (bill.paid_request_id || bill.mode === "cash"); }
export const bankGroupPaymentService = {
  async view(access: GroupBankAccess, selectedId?: string) {
    const { admin, session, participants, actor } = await context(access);
    const [billsResult, itemsResult] = await Promise.all([
      admin.from("bank_group_bills").select("*").eq("session_id", session.id).is("voided_at", null),
      admin.from("group_order_items").select("*").eq("session_id", session.id),
    ]);
    const bills = check(billsResult) ?? [], items = check(itemsResult) ?? [];
    const restaurantIds = [...new Set(items.map(item => item.restaurant_id))];
    const restaurants = restaurantIds.length ? check(await admin.from("restaurants").select("id,name").in("id", restaurantIds)) ?? [] : [];
    const requests = bills.length ? check(await admin.from("bank_qr_test_requests").select("id,group_bill_id,status,due_date,collection_route").in("group_bill_id", bills.map(bill => bill.id))
      .not("status", "in", "(failed,cancelled)").order("created_at", { ascending: false })) ?? [] : [];
    // One selected image only, never dozens of QR blobs in the group refresh.
    const selected = requests.find(row => row.group_bill_id === selectedId && row.status === "pending" && row.due_date >= boliviaDate());
    const image = selected ? check(await admin.from("bank_qr_test_requests").select("qr_image").eq("id", selected.id).maybeSingle())?.qr_image : null;
    const pairs = new Map<string, { participantId: string; restaurantId: string; amount: number }>();
    for (const item of items) {
      const key = item.participant_id + ":" + item.restaurant_id;
      const pair = pairs.get(key) ?? { participantId: item.participant_id, restaurantId: item.restaurant_id, amount: 0 };
      pair.amount += Number(item.subtotal); pairs.set(key, pair);
    }
    const rows: GroupBillView[] = [...pairs.values()].map(pair => {
      const bill = bills.find(row => row.participant_id === pair.participantId && row.restaurant_id === pair.restaurantId);
      const request = requests.find(row => row.group_bill_id === bill?.id);
      return { ...pair, id: bill?.id, amount: bill ? Number(bill.amount) : Number(pair.amount.toFixed(2)),
        participantName: participants.find(row => row.id === pair.participantId)?.display_name ?? "Participante",
        restaurantName: restaurants.find(row => row.id === pair.restaurantId)?.name ?? "Local",
        collectionRoute: request?.collection_route,
        status: bill?.paid_request_id ? "paid" : bill?.mode === "cash" ? "cash" : request?.status ?? "not_created",
        image: selected?.group_bill_id === bill?.id ? image : null, orderId: bill?.order_id,
        canReset: !bill?.paid_request_id && (access.host || actor.id === pair.participantId || bill?.cash_assumed_by === actor.id) };
    });
    return { actorId: actor.id, status: session.status, rows, eligibleAmount: rows.filter(row => ["paid", "cash"].includes(row.status)).reduce((sum, row) => sum + row.amount, 0),
      eligibleItemIds: bills.filter(funded).flatMap(bill => (bill.items as unknown as Item[]).map(item => item.id)) };
  },
  async operate(access: GroupBankAccess, input: { participantId: string; restaurantId: string; mode: "qr" | "cash" | "reset"; payingOther: boolean }) {
    const { admin, session } = await context(access);
    const reserved = check(await admin.rpc("reserve_baneco_group_bill", { p_session: session.id, p_secret: access.secret, p_host: access.host,
      p_participant: input.participantId, p_restaurant: input.restaurantId, p_mode: input.mode, p_paying_other: input.payingOther })) as
      { claimed?: boolean; billId?: string; request?: { id: string } };
    if (reserved.claimed && reserved.billId && reserved.request) await emitReservedGroupQr(reserved.request.id, reserved.billId);
    return this.view(access, reserved.billId);
  },
  async cancel(access: GroupBankAccess, billId: string) {
    const { admin, session, actor } = await context(access);
    const bill = check(await admin.from("bank_group_bills").select("*").eq("id", billId).eq("session_id", session.id).maybeSingle());
    if (!bill || (!access.host && bill.participant_id !== actor.id && bill.requested_by !== actor.id)) throw new Error("group-bank-forbidden");
    if (bill.order_id) throw new Error("group-closed");
    const request = check(await admin.from("bank_qr_test_requests").select("id").eq("group_bill_id", bill.id).not("status", "in", "(failed,cancelled,paid)").maybeSingle());
    if (request) await cancelReservedGroupQr(request.id, bill.id);
    return this.view(access, bill.id);
  },
};

export type BankGroupSubmit = { restaurantSlug: string; hostAccessToken: string; orderType: "delivery" | "pickup"; customerName: string;
  customerPhone?: string; customerAddress?: string; deliveryAddressDetail?: string; deliveryLatitude?: number; deliveryLongitude?: number;
  deliveryMapsUrl?: string; deliveryCity?: string; riderFee?: number; cancelUnpaidQrs?: boolean };
export async function submitBankGroupOrder(sessionToken: string, input: BankGroupSubmit) {
  const access = { sessionToken, secret: input.hostAccessToken, host: true };
  const { admin, session } = await context(access);
  if (session.status === "submitted") return existingResult();
  const token = randomUUID();
  check(await admin.rpc("begin_bank_group_submission", { p_session: session.id, p_secret: access.secret, p_token: token }));
  async function existingResult() {
    const multi = Boolean(session.submitted_multisite_order_id);
    const order = check(await admin.from(multi ? "multisite_orders" : "orders").select("id,tracking_token").eq("id", (session.submitted_multisite_order_id ?? session.submitted_order_id)!).single());
    if (!order) throw new Error("group-bank-unavailable");
    let slug = input.restaurantSlug;
    if (!multi) {
      const child = check(await admin.from("orders").select("restaurant_id").eq("id", order.id).single());
      if (!child) throw new Error("group-bank-unavailable");
      const restaurant = check(await admin.from("restaurants").select("slug").eq("id", child.restaurant_id).single());
      if (!restaurant) throw new Error("group-bank-unavailable");
      slug = restaurant.slug;
    }
    return { id: order.id, trackingToken: order.tracking_token, multisite: multi, restaurantSlug: slug };
  }
  try {
    const bills = check(await admin.from("bank_group_bills").select("*").eq("session_id", session.id).is("voided_at", null)) ?? [];
    const pending = bills.length ? check(await admin.from("bank_qr_test_requests").select("id,group_bill_id").in("group_bill_id", bills.map(bill => bill.id)).not("status", "in", "(failed,cancelled,paid)")) ?? [] : [];
    if (pending.length && !input.cancelUnpaidQrs) throw new Error("group-cancel-confirmation-required");
    // Payment may win this race: re-query all bills AFTER bank-confirmed cancels.
    const cancellations = await Promise.allSettled(pending.slice(0, 3).map(request => cancelReservedGroupQr(request.id, request.group_bill_id!)));
    if (cancellations.some(result => result.status === "rejected")) throw new Error("group-payment-in-progress");
    if (pending.length > 3) throw new Error("group-cancellations-pending");
    const eligibleBills = (check(await admin.from("bank_group_bills").select("*").eq("session_id", session.id).is("voided_at", null)) ?? []).filter(funded);
    const items = eligibleBills.flatMap(bill => bill.items as unknown as Item[]);
    if (!items.length) throw new Error("group-bank-empty");
    const ids = [...new Set(eligibleBills.map(bill => bill.restaurant_id))];
    if (ids.length > 3) throw new Error("multisite-limit");
    if (ids.length > 1 && input.orderType !== "delivery") throw new Error("multisite-delivery-only");
    const [restaurantsR, settingsR, hoursR, cashR, queuesR, activeR, productsR] = await Promise.all([
      admin.from("restaurants").select("id,name,slug,city,latitude,longitude,status,deleted_at").in("id", ids),
      admin.from("restaurant_settings").select("*").in("restaurant_id", ids),
      admin.from("business_hours").select("*").in("restaurant_id", ids),
      admin.from("cash_sessions").select("restaurant_id").in("restaurant_id", ids).eq("status", "open"),
      admin.from("restaurant_queue_settings").select("*").in("restaurant_id", ids),
      admin.from("orders").select("restaurant_id,status,created_at").eq("bank_checkout_hold", false).in("restaurant_id", ids).in("status", ["pending", "accepted", "preparing"]),
      admin.from("products").select("id,restaurant_id,prep_minutes,is_available").in("id", [...new Set(items.map(item => item.product_id))]),
    ]);
    const restaurants = check(restaurantsR) ?? [], settings = check(settingsR) ?? [], hours = check(hoursR) ?? [], cash = check(cashR) ?? [];
    const queues = check(queuesR) ?? [], active = check(activeR) ?? [], products = check(productsR) ?? [];
    const now = formatLocalDateTimeInput(new Date(), DEFAULT_RESTAURANT_TIME_ZONE);
    for (const id of ids) {
      const restaurant = restaurants.find(row => row.id === id), config = settings.find(row => row.restaurant_id === id);
      if (!restaurant || !config || restaurant.status !== "active" || restaurant.deleted_at) throw new Error("invalid-restaurant");
      if ((input.orderType === "delivery" && !config.delivery_enabled) || (input.orderType === "pickup" && !config.pickup_enabled)) throw new Error("disabled");
      if (!cash.some(row => row.restaurant_id === id)) throw new Error("no-open-cash");
      if (await announcementService.hasActiveClosure(id)) throw new Error("temporarily-closed");
      if (!isLocalDateTimeWithinBusinessHours(now, hours.filter(row => row.restaurant_id === id).map(row => ({ dayOfWeek: row.day_of_week, opensAt: row.opens_at ?? "", closesAt: row.closes_at ?? "", isClosed: row.is_closed })))) throw new Error("outside-hours");
      if (eligibleBills.filter(bill => bill.restaurant_id === id).reduce((sum, bill) => sum + Number(bill.amount), 0) < Number(config.min_order_amount)) throw new Error("minimum");
    }
    if (items.some(item => !products.some(product => product.id === item.product_id && product.restaurant_id === item.restaurant_id && product.is_available))) throw new Error("product-not-found");
    if (input.orderType === "delivery" && (input.deliveryLatitude == null || input.deliveryLongitude == null || !input.customerAddress?.trim() || !input.customerPhone?.trim())) throw new Error("delivery-location");
    let fee = 0; let plan: ReturnType<typeof planMultisiteGroupOrder> | null = null;
    if (ids.length > 1) {
      if (restaurants.some(row => row.latitude == null || row.longitude == null)) throw new Error("delivery-location");
      plan = planMultisiteGroupOrder({ destination: { latitude: input.deliveryLatitude!, longitude: input.deliveryLongitude! },
        radiusKm: Number(session.multisite_radius_km), maxPickups: Math.min(session.multisite_max_pickups, 3), candidates: restaurants.map(restaurant => {
          const queue = queues.find(row => row.restaurant_id === restaurant.id);
          const orders = active.filter(row => row.restaurant_id === restaurant.id);
          const prep = Math.max(1, ...products.filter(product => product.restaurant_id === restaurant.id).map(product => Number(product.prep_minutes ?? 12)));
          const snapshot = { queueEnabled: queue?.queue_enabled ?? true, basePrepMinutes: Number(queue?.base_prep_minutes ?? 12), kitchenCapacity: queue?.kitchen_capacity ?? 1,
            activeOrders: orders.length, preparingOrders: orders.filter(row => row.status === "preparing").length,
            recentOrders: orders.filter(row => Date.parse(row.created_at) > Date.now() - 20 * 60_000).length, rushMultiplier: Number(queue?.rush_multiplier ?? 1.25) };
          const forecast = forecastMultisiteKitchenReadyIn(snapshot, prep);
          return { id: restaurant.id, restaurantId: restaurant.id, name: restaurant.name, location: { latitude: Number(restaurant.latitude), longitude: Number(restaurant.longitude) },
            prepTimeMinutes: prep, queueDelayMinutes: forecast.queueDelayMinutes, kitchenSnapshot: snapshot };
        }) });
      if (!plan.feasible) throw new Error("route-unavailable");
      fee = input.riderFee ?? plan.riderPricing.suggestedRiderFee;
      if (fee < plan.riderPricing.customerMinimumFee || fee > plan.riderPricing.customerMaximumFee) throw new Error("rider-fee");
    } else if (input.orderType === "delivery") {
      const restaurant = restaurants[0], config = settings[0];
      if (restaurant.latitude == null || restaurant.longitude == null) throw new Error("delivery-location");
      const zones = check(await admin.from("restaurant_delivery_zones").select("*").eq("restaurant_id", restaurant.id).eq("is_active", true)) ?? [];
      const policy = resolveDeliveryPolicy({ restaurantLocation: { latitude: Number(restaurant.latitude), longitude: Number(restaurant.longitude) },
        deliveryLocation: { latitude: input.deliveryLatitude!, longitude: input.deliveryLongitude! }, restaurantCity: restaurant.city ?? "", deliveryCity: input.deliveryCity ?? restaurant.city ?? "",
        subtotal: eligibleBills.reduce((sum, bill) => sum + Number(bill.amount), 0), baseDeliveryFee: Number(config.delivery_fee), baseMinOrderAmount: Number(config.min_order_amount),
        qrPrepaymentEnabled: config.delivery_qr_prepayment_enabled ?? true, farDeliveryDistanceKm: Number(config.far_delivery_distance_km ?? 5), freeDeliveryFrom: Number(config.free_delivery_from ?? 0),
        distanceRateTiers: await deliveryRateService.list(), zones: zones.map(row => ({ id: row.id, restaurantId: row.restaurant_id, name: row.name, city: row.city ?? "",
          centerLatitude: Number(row.center_latitude), centerLongitude: Number(row.center_longitude), radiusKm: Number(row.radius_km), deliveryFee: Number(row.delivery_fee), minOrderAmount: Number(row.min_order_amount), isActive: row.is_active })) });
      if (!policy.sameCity || policy.outOfCoverage) throw new Error("delivery-out-of-coverage");
      if (policy.requiresQrPrepayment && eligibleBills.some(bill => !bill.paid_request_id)) throw new Error("qr-required-distance");
      fee = policy.deliveryFee;
    }
    const stops = ids.map((id, index) => {
      const stop = plan?.stops.find(row => row.id === id);
      return { restaurant_id: id, subtotal: eligibleBills.filter(bill => bill.restaurant_id === id).reduce((sum, bill) => sum + Number(bill.amount), 0),
        order_number: `GB-${session.id.slice(0, 8)}-${index + 1}`, pickup_position: stop ? plan!.stops.indexOf(stop) + 1 : 1,
        release_delay_minutes: stop?.orderReleaseDelayMinutes ?? 0, estimated_ready_minutes: stop?.estimatedReadyInMinutes ?? 0, distance_to_destination_km: stop?.distanceToDestinationKm ?? null };
    });
    const result = check(await admin.rpc("finalize_baneco_group", { p_session: session.id, p_secret: access.secret, p_token: token, p_stops: stops as Json,
      p_order: { order_type: input.orderType, customer_name: input.customerName, customer_phone: input.customerPhone ?? null, customer_address: input.customerAddress ?? null,
        delivery_address_detail: input.deliveryAddressDetail ?? null, delivery_latitude: input.deliveryLatitude ?? null, delivery_longitude: input.deliveryLongitude ?? null,
        delivery_maps_url: input.deliveryMapsUrl ?? null, delivery_fee: fee, rider_fee_suggested: plan?.riderPricing.suggestedRiderFee ?? fee,
        rider_fee_minimum: plan?.riderPricing.customerMinimumFee ?? fee, rider_fee_maximum: plan?.riderPricing.customerMaximumFee ?? fee, route_plan: plan as unknown as Json,
        notes: "Yopido Grupal · solo partes pagadas o efectivo asumido. Delivery separado." } })) as { id: string; trackingToken: string; multisite: boolean };
    after(async () => {
      const orders = check(await admin.from("orders").select("id,status,order_type").eq("bank_group_session_id", session.id)) ?? [];
      await Promise.allSettled(orders.flatMap(order => [sendRestaurantNewOrderPush(order.id), sendOrderStatusPush({ orderId: order.id, status: order.status }),
        ...(order.status === "ready" && order.order_type === "delivery" ? [offerNextRiderForOrder(order.id)] : [])]));
    });
    return { ...result, restaurantSlug: restaurants[0].slug };
  } catch (error) {
    // Fenced recovery: an old worker cannot unlock a newer submission or undo a
    // committed one. The UUID used by create is the session UUID, not a new retry.
    await admin.from("group_order_sessions").update({ status: "locked", bank_submission_until: null }).eq("id", session.id).eq("status", "submitting").eq("bank_submission_token", token);
    throw error;
  }
}
