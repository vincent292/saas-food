import { createAdminClient } from "@/lib/supabase/admin";
import type { MobileRiderSession } from "@/lib/services/rider-mobile.service";
import type { Database } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient<Database>;
type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

type MultisiteOrderRow = {
  id: string;
  tracking_token: string;
  status: Database["public"]["Tables"]["multisite_orders"]["Row"]["status"];
  subtotal: number | string;
  delivery_fee: number | string;
  total: number | string;
  rider_fee_minimum: number | string;
  rider_fee_maximum: number | string;
  customer_address: string;
  delivery_address_detail: string | null;
  delivery_latitude: number | string;
  delivery_longitude: number | string;
};

type MultisiteChildRow = {
  restaurant_id: string;
  pickup_position: number;
  estimated_ready_minutes: number;
};

type RestaurantRow = {
  id: string;
  name: string;
  latitude: number | string | null;
  longitude: number | string | null;
};

type RiderRow = {
  id: string;
  restaurant_id: string;
  rider_user_id: string | null;
  full_name: string;
  status: "active" | "suspended";
  membership_valid_until: string;
};

type RiderAvailabilityRow = {
  restaurant_rider_id: string;
  rider_user_id: string;
  latitude: number | string | null;
  longitude: number | string | null;
  last_seen_at: string;
};

type MultisiteOfferRow = Database["public"]["Tables"]["multisite_rider_offers"]["Row"];

export type MultisiteRiderOfferForMobile = {
  id: string;
  multisiteOrderId: string;
  status: "pending" | "countered";
  offerRound: number;
  offeredFee: number;
  counterFee: number | null;
  expiresAt: string;
  destination: { address: string; latitude: number; longitude: number };
  pickups: Array<{ restaurantId: string; restaurantName: string; latitude: number; longitude: number; position: number; estimatedReadyMinutes: number }>;
};

const offerTtlMs = 15_000;
const activeMasterStatuses = new Set<MultisiteOrderRow["status"]>(["ready_for_dispatch", "rider_searching", "rider_countered"]);
const activeDispatchStatuses = new Set<Database["public"]["Tables"]["multisite_delivery_dispatches"]["Row"]["status"]>(["active", "arrived"]);

function getAdmin(): ServiceResult<AdminClient> {
  const admin = createAdminClient();
  return admin ? { ok: true, data: admin } : { ok: false, error: "service-role-required", status: 500 };
}

function asNumber(value: number | string | null | undefined) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function todayLaPazDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(new Date());
  const part = (type: Intl.DateTimeFormatPartTypes, fallback: string) => parts.find((item) => item.type === type)?.value ?? fallback;
  return `${part("year", String(new Date().getUTCFullYear()))}-${part("month", String(new Date().getUTCMonth() + 1).padStart(2, "0"))}-${part("day", String(new Date().getUTCDate()).padStart(2, "0"))}`;
}

function haversineKm(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const radiusKm = 6371;
  const dLat = ((second.latitude - first.latitude) * Math.PI) / 180;
  const dLon = ((second.longitude - first.longitude) * Math.PI) / 180;
  const lat1 = (first.latitude * Math.PI) / 180;
  const lat2 = (second.latitude * Math.PI) / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radiusKm * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDegrees(first: { latitude: number; longitude: number }, second: { latitude: number; longitude: number }) {
  const firstLatitude = (first.latitude * Math.PI) / 180;
  const secondLatitude = (second.latitude * Math.PI) / 180;
  const dLongitude = ((second.longitude - first.longitude) * Math.PI) / 180;
  const y = Math.sin(dLongitude) * Math.cos(secondLatitude);
  const x = Math.cos(firstLatitude) * Math.sin(secondLatitude) - Math.sin(firstLatitude) * Math.cos(secondLatitude) * Math.cos(dLongitude);
  return (Math.atan2(y, x) * 180) / Math.PI + 360;
}

function roundRadarPosition(origin: { latitude: number; longitude: number }, rider: { latitude: number; longitude: number }) {
  const distanceKm = haversineKm(origin, rider);
  const angle = bearingDegrees(origin, rider) % 360;
  return {
    // Never return a rider GPS position to a customer.  The radar only shows
    // an intentionally coarse vicinity (45° direction / half-kilometre rings).
    bearingDegrees: Math.round(angle / 45) * 45,
    distanceKm: Math.max(0.25, Math.round(distanceKm * 2) / 2),
  };
}

async function loadContext(admin: AdminClient, orderId: string) {
  const { data: order } = await admin
    .from("multisite_orders")
    .select("id,tracking_token,status,subtotal,delivery_fee,total,rider_fee_minimum,rider_fee_maximum,customer_address,delivery_address_detail,delivery_latitude,delivery_longitude")
    .eq("id", orderId)
    .maybeSingle();
  if (!order) return null;

  const { data: children } = await admin
    .from("multisite_order_children")
    .select("restaurant_id,pickup_position,estimated_ready_minutes")
    .eq("multisite_order_id", orderId)
    .order("pickup_position");
  const childRows = (children ?? []) as MultisiteChildRow[];
  const restaurantIds = childRows.map((child) => child.restaurant_id);
  const { data: restaurants } = restaurantIds.length
    ? await admin.from("restaurants").select("id,name,latitude,longitude").in("id", restaurantIds)
    : { data: [] };
  const restaurantsById = new Map(((restaurants ?? []) as RestaurantRow[]).map((restaurant) => [restaurant.id, restaurant]));
  return { order: order as MultisiteOrderRow, children: childRows, restaurantsById };
}

async function expireLiveOffers(admin: AdminClient, multisiteOrderId: string) {
  await admin
    .from("multisite_rider_offers")
    .update({ responded_at: new Date().toISOString(), response_reason: "offer-expired", status: "expired" })
    .eq("multisite_order_id", multisiteOrderId)
    .in("status", ["pending", "countered"])
    .lt("expires_at", new Date().toISOString());
}

async function activeDispatch(admin: AdminClient, multisiteOrderId: string) {
  const { data } = await admin
    .from("multisite_delivery_dispatches")
    .select("id,restaurant_rider_id,rider_user_id,accepted_fee,status")
    .eq("multisite_order_id", multisiteOrderId)
    .in("status", Array.from(activeDispatchStatuses))
    .maybeSingle();
  return data;
}

async function buildCandidates(
  admin: AdminClient,
  context: NonNullable<Awaited<ReturnType<typeof loadContext>>>,
  options?: { includeTried?: boolean },
) {
  const restaurantIds = context.children.map((child) => child.restaurant_id);
  const { data: riderRows } = await admin
    .from("restaurant_riders")
    .select("id,restaurant_id,rider_user_id,full_name,status,membership_valid_until")
    .in("restaurant_id", restaurantIds)
    .eq("status", "active")
    .gte("membership_valid_until", todayLaPazDate())
    .not("rider_user_id", "is", null);
  const memberships = (riderRows ?? []) as RiderRow[];
  const riderIds = memberships.map((rider) => rider.id);
  if (!riderIds.length) return [];

  const [{ data: availabilityRows }, { data: priorOffers }, { data: activeLinks }, { data: activeMasterDispatches }] = await Promise.all([
    admin
      .from("rider_availability")
      .select("restaurant_rider_id,rider_user_id,latitude,longitude,last_seen_at")
      .in("restaurant_rider_id", riderIds)
      .eq("available_date", todayLaPazDate())
      .eq("is_available", true)
      .gte("last_seen_at", new Date(Date.now() - 8 * 60 * 1000).toISOString()),
    admin.from("multisite_rider_offers").select("restaurant_rider_id,status").eq("multisite_order_id", context.order.id),
    admin.from("order_delivery_links").select("restaurant_rider_id,status").in("restaurant_rider_id", riderIds).in("status", ["active", "arrived"]),
    admin.from("multisite_delivery_dispatches").select("restaurant_rider_id,status").in("restaurant_rider_id", riderIds).in("status", ["active", "arrived"]),
  ]);
  const availabilityByRider = new Map(((availabilityRows ?? []) as RiderAvailabilityRow[]).map((row) => [row.restaurant_rider_id, row]));
  const tried = new Set((priorOffers ?? []).map((offer) => offer.restaurant_rider_id));
  const busy = new Set([
    ...(activeLinks ?? []).map((link) => link.restaurant_rider_id).filter(Boolean),
    ...(activeMasterDispatches ?? []).map((dispatch) => dispatch.restaurant_rider_id),
  ]);
  const firstChild = context.children[0];
  const firstRestaurant = firstChild ? context.restaurantsById.get(firstChild.restaurant_id) : undefined;
  const target = firstRestaurant?.latitude != null && firstRestaurant.longitude != null
    ? { latitude: asNumber(firstRestaurant.latitude), longitude: asNumber(firstRestaurant.longitude) }
    : { latitude: asNumber(context.order.delivery_latitude), longitude: asNumber(context.order.delivery_longitude) };

  // A rider with more than one membership is represented just once, using the
  // closest eligible membership for this master route.
  const candidatesByUser = new Map<string, { rider: RiderRow; availability: RiderAvailabilityRow; distanceKm: number; score: number }>();
  for (const rider of memberships) {
    const availability = availabilityByRider.get(rider.id);
    if (!availability || (!options?.includeTried && tried.has(rider.id)) || busy.has(rider.id) || !rider.rider_user_id) continue;
    const latitude = asNumber(availability.latitude);
    const longitude = asNumber(availability.longitude);
    const hasCoordinates = availability.latitude != null && availability.longitude != null;
    const distanceKm = hasCoordinates ? haversineKm({ latitude, longitude }, target) : 99;
    const score = Math.max(0.05, 10 / (1 + distanceKm) + Math.random() * 0.15);
    const previous = candidatesByUser.get(rider.rider_user_id);
    if (!previous || score > previous.score) candidatesByUser.set(rider.rider_user_id, { rider, availability, distanceKm, score });
  }
  return [...candidatesByUser.values()].sort((first, second) => second.score - first.score);
}

async function sendOfferPush(admin: AdminClient, riderId: string, riderUserId: string | null, offerId: string, fee: number) {
  const riderTokenFilter = riderUserId
    ? `restaurant_rider_id.eq.${riderId},rider_user_id.eq.${riderUserId}`
    : `restaurant_rider_id.eq.${riderId}`;
  const { data: tokenRows } = await admin
    .from("rider_push_tokens")
    .select("expo_push_token")
    .or(riderTokenFilter)
    .eq("is_enabled", true)
    .order("last_seen_at", { ascending: false })
    .limit(3);
  const tokens = Array.from(new Set((tokenRows ?? []).map((row) => row.expo_push_token).filter((token) => /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token))));
  if (!tokens.length) return;
  await Promise.allSettled(tokens.map((to) => fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      to,
      sound: "default",
      title: "Ruta multi-local disponible",
      body: `Oferta de Bs ${fee.toFixed(2)} · responde en 15 segundos`,
      data: { offerId, type: "multisite_rider_offer" },
    }),
  })));
}

export async function offerNextMultisiteRider(multisiteOrderId: string): Promise<ServiceResult<{ status: "offered" | "pending" | "countered" | "assigned" | "waiting" | "not-ready"; expiresAt?: string; offerId?: string }>> {
  const adminResult = getAdmin();
  if (!adminResult.ok) return adminResult;
  const admin = adminResult.data;
  await expireLiveOffers(admin, multisiteOrderId);
  const context = await loadContext(admin, multisiteOrderId);
  if (!context) return { ok: false, error: "multisite-order-not-found", status: 404 };
  if (!activeMasterStatuses.has(context.order.status)) {
    return { ok: true, data: { status: context.order.status === "rider_assigned" || context.order.status === "in_delivery" ? "assigned" : "not-ready" } };
  }
  if (await activeDispatch(admin, multisiteOrderId)) return { ok: true, data: { status: "assigned" } };

  const { data: liveOffer } = await admin
    .from("multisite_rider_offers")
    .select("id,status,expires_at")
    .eq("multisite_order_id", multisiteOrderId)
    .in("status", ["pending", "countered"])
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (liveOffer) {
    return { ok: true, data: { status: liveOffer.status === "countered" ? "countered" : "pending", offerId: liveOffer.id, expiresAt: liveOffer.expires_at } };
  }

  const candidates = await buildCandidates(admin, context);
  if (!candidates.length) {
    await admin.from("multisite_orders").update({ status: "rider_searching" }).eq("id", multisiteOrderId);
    return { ok: true, data: { status: "waiting" } };
  }
  const candidate = candidates[0];
  const offerRound = ((await admin.from("multisite_rider_offers").select("id", { count: "exact", head: true }).eq("multisite_order_id", multisiteOrderId)).count ?? 0) + 1;
  const expiresAt = new Date(Date.now() + offerTtlMs).toISOString();
  const { data: created, error } = await admin
    .from("multisite_rider_offers")
    .insert({
      multisite_order_id: multisiteOrderId,
      restaurant_rider_id: candidate.rider.id,
      rider_user_id: candidate.rider.rider_user_id,
      status: "pending",
      offer_round: offerRound,
      offered_fee: asNumber(context.order.delivery_fee),
      distance_km: Number(candidate.distanceKm.toFixed(3)),
      score: Number(candidate.score.toFixed(4)),
      expires_at: expiresAt,
    })
    .select("id,expires_at")
    .maybeSingle();
  if (error || !created) {
    // A concurrent refresh can create the unique live offer first. It is safe
    // to report it instead of surfacing a transient database conflict.
    const { data: concurrentOffer } = await admin
      .from("multisite_rider_offers")
      .select("id,status,expires_at")
      .eq("multisite_order_id", multisiteOrderId)
      .in("status", ["pending", "countered"])
      .gt("expires_at", new Date().toISOString())
      .maybeSingle();
    if (concurrentOffer) return { ok: true, data: { status: concurrentOffer.status === "countered" ? "countered" : "pending", offerId: concurrentOffer.id, expiresAt: concurrentOffer.expires_at } };
    return { ok: false, error: "multisite-rider-offer-create-failed", status: 400 };
  }
  await admin.from("multisite_orders").update({ status: "rider_searching" }).eq("id", multisiteOrderId);
  void sendOfferPush(admin, candidate.rider.id, candidate.rider.rider_user_id, created.id, asNumber(context.order.delivery_fee));
  return { ok: true, data: { status: "offered", offerId: created.id, expiresAt: created.expires_at } };
}

async function activateDispatch(
  admin: AdminClient,
  context: NonNullable<Awaited<ReturnType<typeof loadContext>>>,
  offer: MultisiteOfferRow,
  acceptedFee: number,
) {
  const existing = await activeDispatch(admin, context.order.id);
  if (existing) return { ok: false as const, error: "multisite-rider-already-assigned", status: 409 };
  const { data: sameRiderMemberships } = offer.rider_user_id
    ? await admin.from("restaurant_riders").select("id").eq("rider_user_id", offer.rider_user_id)
    : { data: [{ id: offer.restaurant_rider_id }] };
  const membershipIds = (sameRiderMemberships ?? []).map((membership) => membership.id);
  const [{ data: regularDispatch }, { data: masterDispatch }] = membershipIds.length
    ? await Promise.all([
      admin.from("order_delivery_links").select("id").in("restaurant_rider_id", membershipIds).in("status", ["active", "arrived"]).limit(1).maybeSingle(),
      admin.from("multisite_delivery_dispatches").select("id").in("restaurant_rider_id", membershipIds).in("status", ["active", "arrived"]).limit(1).maybeSingle(),
    ])
    : [{ data: null }, { data: null }];
  if (regularDispatch || masterDispatch) return { ok: false as const, error: "multisite-rider-busy", status: 409 };
  const { error: dispatchError } = await admin.from("multisite_delivery_dispatches").insert({
    multisite_order_id: context.order.id,
    rider_offer_id: offer.id,
    restaurant_rider_id: offer.restaurant_rider_id,
    rider_user_id: offer.rider_user_id,
    accepted_fee: Number(acceptedFee.toFixed(2)),
    status: "active",
  });
  if (dispatchError) return { ok: false as const, error: "multisite-dispatch-create-failed", status: 409 };
  const now = new Date().toISOString();
  await Promise.all([
    admin.from("multisite_orders").update({
      status: "rider_assigned",
      delivery_fee: Number(acceptedFee.toFixed(2)),
      total: Number((asNumber(context.order.subtotal) + acceptedFee).toFixed(2)),
    }).eq("id", context.order.id),
    admin.from("multisite_rider_offers").update({ status: "accepted", responded_at: now }).eq("id", offer.id),
    admin.from("multisite_rider_offers").update({ status: "cancelled", responded_at: now, response_reason: "route-assigned" })
      .eq("multisite_order_id", context.order.id).in("status", ["pending", "countered"]).neq("id", offer.id),
  ]);
  return { ok: true as const };
}

export async function getPublicMultisiteDispatch(input: { multisiteOrderId: string; trackingToken: string }) {
  const adminResult = getAdmin();
  if (!adminResult.ok) return adminResult;
  const admin = adminResult.data;
  const contextBefore = await loadContext(admin, input.multisiteOrderId);
  if (!contextBefore || contextBefore.order.tracking_token !== input.trackingToken) return { ok: false as const, error: "multisite-order-not-found", status: 404 };

  await offerNextMultisiteRider(input.multisiteOrderId);
  const context = await loadContext(admin, input.multisiteOrderId);
  if (!context) return { ok: false as const, error: "multisite-order-not-found", status: 404 };
  await expireLiveOffers(admin, context.order.id);
  const [dispatch, liveOffer, candidates] = await Promise.all([
    activeDispatch(admin, context.order.id),
    admin.from("multisite_rider_offers").select("id,status,offered_fee,counter_fee,expires_at,offer_round").eq("multisite_order_id", context.order.id).in("status", ["pending", "countered"]).gt("expires_at", new Date().toISOString()).maybeSingle(),
    buildCandidates(admin, context, { includeTried: true }),
  ]);
  const firstChild = context.children[0];
  const originRestaurant = firstChild ? context.restaurantsById.get(firstChild.restaurant_id) : undefined;
  const origin = originRestaurant?.latitude != null && originRestaurant.longitude != null
    ? { latitude: asNumber(originRestaurant.latitude), longitude: asNumber(originRestaurant.longitude) }
    : { latitude: asNumber(context.order.delivery_latitude), longitude: asNumber(context.order.delivery_longitude) };
  const radarRiders = candidates.slice(0, 8).flatMap((candidate) => {
    const latitude = asNumber(candidate.availability.latitude);
    const longitude = asNumber(candidate.availability.longitude);
    return Number.isFinite(latitude) && Number.isFinite(longitude) ? [roundRadarPosition(origin, { latitude, longitude })] : [];
  });
  return {
    ok: true as const,
    data: {
      status: context.order.status,
      deliveryFee: asNumber(context.order.delivery_fee),
      dispatch: dispatch ? { status: dispatch.status, acceptedFee: asNumber(dispatch.accepted_fee) } : null,
      offer: liveOffer.data ? {
        id: liveOffer.data.id,
        status: liveOffer.data.status as "pending" | "countered",
        offeredFee: asNumber(liveOffer.data.offered_fee),
        counterFee: liveOffer.data.counter_fee == null ? null : asNumber(liveOffer.data.counter_fee),
        expiresAt: liveOffer.data.expires_at,
        offerRound: liveOffer.data.offer_round,
      } : null,
      radarRiders,
      pickupName: originRestaurant?.name ?? "Primer local",
    },
  };
}

export async function respondToMultisiteRiderOffer(
  session: MobileRiderSession,
  input: { offerId: string; action: "accept" | "counter" | "reject"; counterFee?: number },
): Promise<ServiceResult<{ status: "accepted" | "countered" | "rejected"; multisiteOrderId: string }>> {
  const riderIds = session.activeRiders.map((rider) => rider.id);
  const { data: offer } = await session.admin
    .from("multisite_rider_offers")
    .select("*")
    .eq("id", input.offerId)
    .in("restaurant_rider_id", riderIds)
    .eq("rider_user_id", session.user.id)
    .maybeSingle();
  const offerRow = offer as MultisiteOfferRow | null;
  if (!offerRow || !["pending", "countered"].includes(offerRow.status)) return { ok: false, error: "multisite-rider-offer-not-found", status: 404 };
  if (offerRow.expires_at <= new Date().toISOString()) {
    await session.admin.from("multisite_rider_offers").update({ status: "expired", responded_at: new Date().toISOString() }).eq("id", offerRow.id);
    await offerNextMultisiteRider(offerRow.multisite_order_id);
    return { ok: false, error: "multisite-rider-offer-expired", status: 409 };
  }
  const context = await loadContext(session.admin as AdminClient, offerRow.multisite_order_id);
  if (!context || !activeMasterStatuses.has(context.order.status)) return { ok: false, error: "multisite-order-not-available", status: 409 };

  if (input.action === "reject") {
    await session.admin.from("multisite_rider_offers").update({ status: "rejected", responded_at: new Date().toISOString(), response_reason: "rider-rejected" }).eq("id", offerRow.id);
    await offerNextMultisiteRider(offerRow.multisite_order_id);
    return { ok: true, data: { status: "rejected", multisiteOrderId: offerRow.multisite_order_id } };
  }
  if (input.action === "counter") {
    const counterFee = Number(input.counterFee);
    if (!Number.isFinite(counterFee) || counterFee < asNumber(context.order.rider_fee_minimum) || counterFee > asNumber(context.order.rider_fee_maximum)) {
      return { ok: false, error: "multisite-counter-fee-out-of-range", status: 400 };
    }
    const expiresAt = new Date(Date.now() + offerTtlMs).toISOString();
    const { data: countered } = await session.admin
      .from("multisite_rider_offers")
      .update({ status: "countered", counter_fee: Number(counterFee.toFixed(2)), expires_at: expiresAt, responded_at: new Date().toISOString() })
      .eq("id", offerRow.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();
    if (!countered) return { ok: false, error: "multisite-rider-offer-not-pending", status: 409 };
    await session.admin.from("multisite_orders").update({ status: "rider_countered" }).eq("id", context.order.id);
    return { ok: true, data: { status: "countered", multisiteOrderId: offerRow.multisite_order_id } };
  }
  if (offerRow.status !== "pending") return { ok: false, error: "multisite-customer-decision-required", status: 409 };
  const activated = await activateDispatch(session.admin as AdminClient, context, offerRow, asNumber(offerRow.offered_fee));
  if (!activated.ok) return activated;
  return { ok: true, data: { status: "accepted", multisiteOrderId: offerRow.multisite_order_id } };
}

export async function acceptMultisiteCustomerCounterOffer(input: { multisiteOrderId: string; trackingToken: string; offerId: string }) {
  const adminResult = getAdmin();
  if (!adminResult.ok) return adminResult;
  const admin = adminResult.data;
  const context = await loadContext(admin, input.multisiteOrderId);
  if (!context || context.order.tracking_token !== input.trackingToken) return { ok: false as const, error: "multisite-order-not-found", status: 404 };
  await expireLiveOffers(admin, input.multisiteOrderId);
  const { data: offer } = await admin
    .from("multisite_rider_offers")
    .select("*")
    .eq("id", input.offerId)
    .eq("multisite_order_id", input.multisiteOrderId)
    .eq("status", "countered")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  const offerRow = offer as MultisiteOfferRow | null;
  if (!offerRow || offerRow.counter_fee == null) return { ok: false as const, error: "multisite-counter-offer-not-found", status: 409 };
  const counterFee = asNumber(offerRow.counter_fee);
  if (counterFee < asNumber(context.order.rider_fee_minimum) || counterFee > asNumber(context.order.rider_fee_maximum)) return { ok: false as const, error: "multisite-counter-fee-out-of-range", status: 409 };
  const activated = await activateDispatch(admin, context, offerRow, counterFee);
  return activated.ok ? { ok: true as const, data: { acceptedFee: counterFee, multisiteOrderId: context.order.id } } : activated;
}

export async function rejectMultisiteCustomerCounterOffer(input: { multisiteOrderId: string; trackingToken: string; offerId: string }) {
  const adminResult = getAdmin();
  if (!adminResult.ok) return adminResult;
  const admin = adminResult.data;
  const context = await loadContext(admin, input.multisiteOrderId);
  if (!context || context.order.tracking_token !== input.trackingToken) return { ok: false as const, error: "multisite-order-not-found", status: 404 };
  const { data: offer } = await admin
    .from("multisite_rider_offers")
    .update({ status: "rejected", responded_at: new Date().toISOString(), response_reason: "customer-declined-counter" })
    .eq("id", input.offerId)
    .eq("multisite_order_id", input.multisiteOrderId)
    .eq("status", "countered")
    .gt("expires_at", new Date().toISOString())
    .select("id")
    .maybeSingle();
  if (!offer) return { ok: false as const, error: "multisite-counter-offer-not-found", status: 409 };
  await admin.from("multisite_orders").update({ status: "rider_searching" }).eq("id", input.multisiteOrderId);
  await offerNextMultisiteRider(input.multisiteOrderId);
  return { ok: true as const, data: { multisiteOrderId: input.multisiteOrderId } };
}

export async function listMobileMultisiteRiderOffers(session: MobileRiderSession): Promise<ServiceResult<{ offers: MultisiteRiderOfferForMobile[]; updatedAt: string }>> {
  const riderIds = session.activeRiders.map((rider) => rider.id);
  if (!riderIds.length) return { ok: false, error: "rider-membership-inactive", status: 403 };
  const { data: offers } = await session.admin
    .from("multisite_rider_offers")
    .select("id,multisite_order_id,restaurant_rider_id,status,offer_round,offered_fee,counter_fee,expires_at")
    .in("restaurant_rider_id", riderIds)
    .in("status", ["pending", "countered"])
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  const visibleOffers = (offers ?? []).filter((offer) => offer.status === "pending" || offer.status === "countered");
  const orderIds = Array.from(new Set(visibleOffers.map((offer) => offer.multisite_order_id)));
  const [ordersResult, childrenResult] = await Promise.all([
    orderIds.length ? session.admin.from("multisite_orders").select("id,customer_address,delivery_latitude,delivery_longitude").in("id", orderIds) : Promise.resolve({ data: [] }),
    orderIds.length ? session.admin.from("multisite_order_children").select("multisite_order_id,restaurant_id,pickup_position,estimated_ready_minutes").in("multisite_order_id", orderIds).order("pickup_position") : Promise.resolve({ data: [] }),
  ]);
  const orderById = new Map((ordersResult.data ?? []).map((order) => [order.id, order]));
  const childRows = childrenResult.data ?? [];
  const restaurantIds = Array.from(new Set(childRows.map((child) => child.restaurant_id)));
  const { data: restaurants } = restaurantIds.length ? await session.admin.from("restaurants").select("id,name,latitude,longitude").in("id", restaurantIds) : { data: [] };
  const restaurantById = new Map((restaurants ?? []).map((restaurant) => [restaurant.id, restaurant]));
  return {
    ok: true,
    data: {
      offers: visibleOffers.flatMap((offer) => {
        const order = orderById.get(offer.multisite_order_id);
        if (!order) return [];
        return [{
          id: offer.id,
          multisiteOrderId: offer.multisite_order_id,
          status: offer.status as "pending" | "countered",
          offerRound: offer.offer_round,
          offeredFee: asNumber(offer.offered_fee),
          counterFee: offer.counter_fee == null ? null : asNumber(offer.counter_fee),
          expiresAt: offer.expires_at,
          destination: { address: order.customer_address, latitude: asNumber(order.delivery_latitude), longitude: asNumber(order.delivery_longitude) },
          pickups: childRows.filter((child) => child.multisite_order_id === offer.multisite_order_id).flatMap((child) => {
            const restaurant = restaurantById.get(child.restaurant_id);
            return restaurant?.latitude != null && restaurant.longitude != null ? [{
              restaurantId: child.restaurant_id,
              restaurantName: restaurant.name,
              latitude: asNumber(restaurant.latitude),
              longitude: asNumber(restaurant.longitude),
              position: child.pickup_position,
              estimatedReadyMinutes: child.estimated_ready_minutes,
            }] : [];
          }),
        }];
      }),
      updatedAt: new Date().toISOString(),
    },
  };
}
