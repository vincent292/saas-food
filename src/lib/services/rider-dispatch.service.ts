import { createAdminClient } from "@/lib/supabase/admin";
import { directionsToMapsUrl, hasValidCoordinates } from "@/lib/utils/google-maps";
import type { Database, Json } from "@/types/database.types";
import type { SupabaseClient } from "@supabase/supabase-js";

type AdminClient = SupabaseClient<Database>;

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

type DispatchOrderRow = {
  id: string;
  restaurant_id: string;
  order_number: string;
  order_type: "table" | "delivery" | "pickup" | "pos";
  status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_address_detail: string | null;
  delivery_latitude: number | string | null;
  delivery_longitude: number | string | null;
  delivery_maps_url: string | null;
};

type DispatchRestaurantRow = {
  id: string;
  name: string;
  slug: string;
  latitude: number | string | null;
  longitude: number | string | null;
};

type RiderCandidateRow = {
  id: string;
  restaurant_id: string;
  rider_user_id: string | null;
  full_name: string;
  phone: string;
  plate_number: string;
  status: "active" | "suspended";
  membership_valid_until: string;
};

type RiderAvailabilityRow = {
  restaurant_rider_id: string;
  rider_user_id: string;
  is_available: boolean;
  available_date: string;
  latitude: number | string | null;
  longitude: number | string | null;
  accuracy_m: number | string | null;
  heading: number | string | null;
  speed_mps: number | string | null;
  last_seen_at: string;
};

type RiderOfferRow = {
  id: string;
  order_id: string;
  restaurant_id: string;
  restaurant_rider_id: string;
  rider_user_id: string | null;
  status: "pending" | "accepted" | "rejected" | "expired" | "cancelled";
  expires_at: string;
  created_at: string;
};

type DeliveryLinkRow = {
  id: string;
  restaurant_id: string;
  order_id: string;
  restaurant_rider_id: string | null;
  delivery_token: string;
  delivery_phone: string | null;
  delivery_name: string | null;
  status: "active" | "arrived" | "delivered" | "cancelled" | "expired";
  expires_at: string;
};

type RiderDispatchCandidate = {
  rider: RiderCandidateRow;
  availability: RiderAvailabilityRow;
  distanceKm: number | null;
  activeDispatches: number;
  recentDeliveries: number;
  acceptanceRate: number | null;
  score: number;
};

export type RiderAutoDispatchResult =
  | { ok: true; status: "offered"; offerId: string; riderId: string; riderName: string; expiresAt: string }
  | { ok: true; status: "already_assigned"; riderId?: string | null }
  | { ok: true; status: "pending_offer"; offerId: string; riderId: string; expiresAt: string }
  | { ok: true; status: "manual_fallback"; reason: string }
  | { ok: false; error: string };

const expoPushEndpoint = "https://exp.host/--/api/v2/push/send";
const riderAvailabilityWindowMs = 5 * 60 * 1000;
const riderOfferTtlSeconds = 45;
const activeDispatchStatuses = new Set<DeliveryLinkRow["status"]>(["active", "arrived"]);

function getAdmin(): ServiceResult<AdminClient> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "service-role-required", status: 500 };
  }

  return { ok: true, data: admin };
}

function todayLaPazDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(new Date());
  const year = parts.find((part) => part.type === "year")?.value ?? new Date().getUTCFullYear();
  const month = parts.find((part) => part.type === "month")?.value ?? String(new Date().getUTCMonth() + 1).padStart(2, "0");
  const day = parts.find((part) => part.type === "day")?.value ?? String(new Date().getUTCDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function endOfBusinessDayIso(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone: "America/La_Paz",
    year: "numeric",
  }).formatToParts(date);
  const year = Number(parts.find((part) => part.type === "year")?.value ?? date.getUTCFullYear());
  const month = Number(parts.find((part) => part.type === "month")?.value ?? date.getUTCMonth() + 1);
  const day = Number(parts.find((part) => part.type === "day")?.value ?? date.getUTCDate());

  return new Date(Date.UTC(year, month - 1, day + 1, 4, 0, 0, 0)).toISOString();
}

function isExpoPushToken(token: string) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]+\]$/.test(token.trim());
}

function toNumber(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
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

function targetCoordinates(order: DispatchOrderRow, restaurant?: DispatchRestaurantRow | null) {
  const restaurantLatitude = toNumber(restaurant?.latitude);
  const restaurantLongitude = toNumber(restaurant?.longitude);
  if (restaurantLatitude !== null && restaurantLongitude !== null) {
    return { latitude: restaurantLatitude, longitude: restaurantLongitude };
  }

  const deliveryLatitude = toNumber(order.delivery_latitude);
  const deliveryLongitude = toNumber(order.delivery_longitude);
  if (deliveryLatitude !== null && deliveryLongitude !== null) {
    return { latitude: deliveryLatitude, longitude: deliveryLongitude };
  }

  return null;
}

function weightedPick(candidates: RiderDispatchCandidate[]) {
  const total = candidates.reduce((sum, candidate) => sum + Math.max(candidate.score, 0.05), 0);
  let cursor = Math.random() * total;

  for (const candidate of candidates) {
    cursor -= Math.max(candidate.score, 0.05);
    if (cursor <= 0) {
      return candidate;
    }
  }

  return candidates[candidates.length - 1];
}

async function sendRiderOfferPush({
  admin,
  order,
  riderId,
  riderName,
  riderUserId,
  restaurant,
}: {
  admin: AdminClient;
  order: DispatchOrderRow;
  riderId: string;
  riderName: string;
  riderUserId?: string | null;
  restaurant?: DispatchRestaurantRow | null;
}) {
  const riderTokenFilter = riderUserId
    ? `restaurant_rider_id.eq.${riderId},rider_user_id.eq.${riderUserId}`
    : `restaurant_rider_id.eq.${riderId}`;
  const { data: tokens } = await admin
    .from("rider_push_tokens")
    .select("expo_push_token")
    .or(riderTokenFilter)
    .eq("is_enabled", true)
    .order("last_seen_at", { ascending: false })
    .limit(3);

  const pushTokens = Array.from(new Set((tokens ?? []).map((row) => row.expo_push_token).filter(isExpoPushToken)));
  if (!pushTokens.length) {
    return { sent: 0 };
  }

  const deliveryLatitude = toNumber(order.delivery_latitude);
  const deliveryLongitude = toNumber(order.delivery_longitude);
  const mapsUrl =
    hasValidCoordinates(deliveryLatitude, deliveryLongitude)
      ? directionsToMapsUrl({
          address: order.customer_address,
          latitude: deliveryLatitude,
          longitude: deliveryLongitude,
        })
      : order.delivery_maps_url ?? "";
  const body = [restaurant?.name ?? "Restaurante", order.customer_address ? `Destino: ${order.customer_address}` : "", riderName ? `Para: ${riderName}` : ""]
    .filter(Boolean)
    .join(" · ");
  const messages = pushTokens.map((token) => ({
    body: body || "Tienes un pedido listo para recoger.",
    channelId: "rider-dispatch",
    data: {
      mapsUrl,
      orderId: order.id,
      orderNumber: order.order_number,
      restaurantId: order.restaurant_id,
      restaurantSlug: restaurant?.slug ?? "",
      type: "rider_delivery_offer",
    },
    priority: "high",
    sound: "default",
    title: `Pedido listo ${order.order_number}`,
    to: token,
  }));

  try {
    const response = await fetch(expoPushEndpoint, {
      body: JSON.stringify(messages),
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      method: "POST",
    });
    const responsePayload = (await response.json().catch(() => null)) as Json;
    await Promise.all(
      pushTokens.map((token) =>
        admin.from("mobile_push_notification_logs").insert({
          body: body || "Tienes un pedido listo para recoger.",
          error_message: response.ok ? null : "rider-push-failed",
          event_type: "rider_delivery_offer",
          expo_push_token: token,
          order_id: order.id,
          restaurant_id: order.restaurant_id,
          response_payload: responsePayload,
          response_status: `http_${response.status}`,
          status: "ready",
          title: `Pedido listo ${order.order_number}`,
        }),
      ),
    );
    return { sent: response.ok ? pushTokens.length : 0 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "rider-push-failed";
    await Promise.all(
      pushTokens.map((token) =>
        admin.from("mobile_push_notification_logs").insert({
          body: body || "Tienes un pedido listo para recoger.",
          error_message: errorMessage,
          event_type: "rider_delivery_offer",
          expo_push_token: token,
          order_id: order.id,
          restaurant_id: order.restaurant_id,
          response_payload: null,
          response_status: null,
          status: "ready",
          title: `Pedido listo ${order.order_number}`,
        }),
      ),
    );
    return { sent: 0 };
  }
}

async function expirePendingOffers(admin: AdminClient, orderId?: string) {
  let query = admin.from("rider_delivery_offers").update({ status: "expired", responded_at: new Date().toISOString() }).eq("status", "pending").lt("expires_at", new Date().toISOString());

  if (orderId) {
    query = query.eq("order_id", orderId);
  }

  await query;
}

async function candidateStats(admin: AdminClient, riderIds: string[]) {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const since30 = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const [{ data: activeLinks }, { data: recentLinks }, { data: offers }] = await Promise.all([
    admin.from("order_delivery_links").select("restaurant_rider_id").in("restaurant_rider_id", riderIds).in("status", Array.from(activeDispatchStatuses)),
    admin.from("order_delivery_links").select("restaurant_rider_id").in("restaurant_rider_id", riderIds).eq("status", "delivered").gte("delivered_at", since),
    admin.from("rider_delivery_offers").select("restaurant_rider_id,status").in("restaurant_rider_id", riderIds).gte("created_at", since30),
  ]);
  const active = new Map<string, number>();
  const recent = new Map<string, number>();
  const accepted = new Map<string, number>();
  const total = new Map<string, number>();

  for (const link of activeLinks ?? []) {
    if (link.restaurant_rider_id) active.set(link.restaurant_rider_id, (active.get(link.restaurant_rider_id) ?? 0) + 1);
  }
  for (const link of recentLinks ?? []) {
    if (link.restaurant_rider_id) recent.set(link.restaurant_rider_id, (recent.get(link.restaurant_rider_id) ?? 0) + 1);
  }
  for (const offer of offers ?? []) {
    total.set(offer.restaurant_rider_id, (total.get(offer.restaurant_rider_id) ?? 0) + 1);
    if (offer.status === "accepted") {
      accepted.set(offer.restaurant_rider_id, (accepted.get(offer.restaurant_rider_id) ?? 0) + 1);
    }
  }

  return { active, accepted, recent, total };
}

async function buildCandidates(admin: AdminClient, order: DispatchOrderRow, restaurant: DispatchRestaurantRow | null) {
  const today = todayLaPazDate();
  const lastSeenFloor = new Date(Date.now() - riderAvailabilityWindowMs).toISOString();
  const { data: riders } = await admin
    .from("restaurant_riders")
    .select("id,restaurant_id,rider_user_id,full_name,phone,plate_number,status,membership_valid_until")
    .eq("restaurant_id", order.restaurant_id)
    .eq("status", "active")
    .gte("membership_valid_until", today)
    .not("rider_user_id", "is", null);

  const riderRows = (riders ?? []) as RiderCandidateRow[];
  if (!riderRows.length) {
    return [];
  }

  const riderIds = riderRows.map((rider) => rider.id);
  const { data: availability } = await admin
    .from("rider_availability")
    .select("restaurant_rider_id,rider_user_id,is_available,available_date,latitude,longitude,accuracy_m,heading,speed_mps,last_seen_at")
    .in("restaurant_rider_id", riderIds)
    .eq("available_date", today)
    .eq("is_available", true)
    .gte("last_seen_at", lastSeenFloor);
  const availabilityByRider = new Map(((availability ?? []) as RiderAvailabilityRow[]).map((row) => [row.restaurant_rider_id, row]));
  const offeredRows = await admin.from("rider_delivery_offers").select("restaurant_rider_id,status").eq("order_id", order.id);
  const alreadyTried = new Set((offeredRows.data ?? []).filter((offer) => offer.status !== "cancelled").map((offer) => offer.restaurant_rider_id));
  const availableRiders = riderRows.filter((rider) => availabilityByRider.has(rider.id) && !alreadyTried.has(rider.id));
  if (!availableRiders.length) {
    return [];
  }

  const stats = await candidateStats(admin, availableRiders.map((rider) => rider.id));
  const target = targetCoordinates(order, restaurant);

  return availableRiders.map((rider) => {
    const riderAvailability = availabilityByRider.get(rider.id) as RiderAvailabilityRow;
    const latitude = toNumber(riderAvailability.latitude);
    const longitude = toNumber(riderAvailability.longitude);
    const distanceKm = target && latitude !== null && longitude !== null ? haversineKm({ latitude, longitude }, target) : null;
    const activeDispatches = stats.active.get(rider.id) ?? 0;
    const recentDeliveries = stats.recent.get(rider.id) ?? 0;
    const totalOffers = stats.total.get(rider.id) ?? 0;
    const acceptanceRate = totalOffers ? (stats.accepted.get(rider.id) ?? 0) / totalOffers : null;
    const distanceScore = distanceKm === null ? 0.75 : Math.max(0.18, 1 / (1 + distanceKm));
    const loadScore = 1 / (1 + activeDispatches * 1.4 + recentDeliveries * 0.18);
    const reputationScore = acceptanceRate === null ? 1 : 0.72 + acceptanceRate * 0.58;
    const jitter = 0.85 + Math.random() * 0.3;
    const score = Math.max(0.05, distanceScore * 5 * loadScore * reputationScore * jitter);

    return {
      acceptanceRate,
      activeDispatches,
      availability: riderAvailability,
      distanceKm,
      recentDeliveries,
      rider,
      score,
    };
  });
}

async function getOrderForDispatch(admin: AdminClient, orderId: string) {
  const { data: order } = await admin
    .from("orders")
    .select("id,restaurant_id,order_number,order_type,status,customer_name,customer_phone,customer_address,delivery_address_detail,delivery_latitude,delivery_longitude,delivery_maps_url")
    .eq("id", orderId)
    .maybeSingle();

  if (!order) return null;
  const { data: restaurant } = await admin.from("restaurants").select("id,name,slug,latitude,longitude").eq("id", order.restaurant_id).maybeSingle();
  return { order: order as DispatchOrderRow, restaurant: (restaurant as DispatchRestaurantRow | null) ?? null };
}

export async function offerNextRiderForOrder(orderId: string): Promise<RiderAutoDispatchResult> {
  const adminResult = getAdmin();
  if (!adminResult.ok) return { ok: false, error: adminResult.error };
  const admin = adminResult.data;

  await expirePendingOffers(admin, orderId);

  const context = await getOrderForDispatch(admin, orderId);
  if (!context) {
    return { ok: false, error: "order-not-found" };
  }

  const { order, restaurant } = context;
  if (order.order_type !== "delivery" || order.status !== "ready") {
    return { ok: true, status: "manual_fallback", reason: "order-not-ready-delivery" };
  }

  const { data: link } = await admin.from("order_delivery_links").select("id,restaurant_rider_id,status").eq("order_id", order.id).maybeSingle();
  const existingLink = link as Pick<DeliveryLinkRow, "id" | "restaurant_rider_id" | "status"> | null;
  if (existingLink?.restaurant_rider_id && activeDispatchStatuses.has(existingLink.status)) {
    return { ok: true, status: "already_assigned", riderId: existingLink.restaurant_rider_id };
  }

  const { data: pendingOffer } = await admin
    .from("rider_delivery_offers")
    .select("id,restaurant_rider_id,expires_at")
    .eq("order_id", order.id)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();
  if (pendingOffer) {
    return {
      ok: true,
      status: "pending_offer",
      expiresAt: pendingOffer.expires_at,
      offerId: pendingOffer.id,
      riderId: pendingOffer.restaurant_rider_id,
    };
  }

  const candidates = await buildCandidates(admin, order, restaurant);
  if (!candidates.length) {
    return { ok: true, status: "manual_fallback", reason: "no-available-riders" };
  }

  const picked = weightedPick(candidates);
  const offerRound = ((await admin.from("rider_delivery_offers").select("id", { count: "exact", head: true }).eq("order_id", order.id)).count ?? 0) + 1;
  const expiresAt = new Date(Date.now() + riderOfferTtlSeconds * 1000).toISOString();
  const { data: offer, error } = await admin
    .from("rider_delivery_offers")
    .insert({
      acceptance_rate: picked.acceptanceRate,
      active_dispatches: picked.activeDispatches,
      distance_km: picked.distanceKm,
      expires_at: expiresAt,
      offer_round: offerRound,
      order_id: order.id,
      random_weight: Math.random(),
      recent_deliveries: picked.recentDeliveries,
      restaurant_id: order.restaurant_id,
      restaurant_rider_id: picked.rider.id,
      rider_user_id: picked.rider.rider_user_id,
      score: picked.score,
      status: "pending",
    })
    .select("id,expires_at")
    .single();

  if (error || !offer) {
    return { ok: false, error: error?.code ?? "rider-offer-create-failed" };
  }

  await sendRiderOfferPush({
    admin,
    order,
    restaurant,
    riderId: picked.rider.id,
    riderName: picked.rider.full_name,
    riderUserId: picked.rider.rider_user_id,
  });

  return {
    ok: true,
    status: "offered",
    expiresAt: offer.expires_at,
    offerId: offer.id,
    riderId: picked.rider.id,
    riderName: picked.rider.full_name,
  };
}

export async function registerRiderPushToken(
  admin: AdminClient,
  input: {
    appVersion?: string;
    deviceId?: string;
    expoPushToken: string;
    platform?: string;
    riderId?: string;
    riderUserId: string;
  },
) {
  if (!isExpoPushToken(input.expoPushToken)) {
    return { ok: false, error: "invalid-push-token", status: 400 } as const;
  }

  const { error } = await admin.from("rider_push_tokens").upsert(
    {
      app_version: input.appVersion ?? null,
      device_id: input.deviceId ?? null,
      expo_push_token: input.expoPushToken.trim(),
      is_enabled: true,
      last_seen_at: new Date().toISOString(),
      platform: input.platform ?? null,
      restaurant_rider_id: input.riderId ?? null,
      rider_user_id: input.riderUserId,
    },
    { onConflict: "expo_push_token" },
  );

  return error ? ({ ok: false, error: "rider-push-register-failed", status: 400 } as const) : ({ ok: true } as const);
}

export async function setRiderAvailability(
  admin: AdminClient,
  input: {
    accuracyMeters?: number | null;
    heading?: number | null;
    isAvailable: boolean;
    latitude?: number | null;
    longitude?: number | null;
    riderId: string;
    riderUserId: string;
    speedMetersPerSecond?: number | null;
  },
) {
  const today = todayLaPazDate();
  const now = new Date().toISOString();
  const latitude = input.latitude ?? null;
  const longitude = input.longitude ?? null;

  if ((latitude !== null && (latitude < -90 || latitude > 90)) || (longitude !== null && (longitude < -180 || longitude > 180))) {
    return { ok: false, error: "invalid-rider-location", status: 400 } as const;
  }

  const { error } = await admin.from("rider_availability").upsert(
    {
      accuracy_m: input.accuracyMeters ?? null,
      available_date: today,
      heading: input.heading ?? null,
      is_available: input.isAvailable,
      last_seen_at: now,
      latitude,
      longitude,
      restaurant_rider_id: input.riderId,
      rider_user_id: input.riderUserId,
      speed_mps: input.speedMetersPerSecond ?? null,
    },
    { onConflict: "restaurant_rider_id" },
  );

  return error ? ({ ok: false, error: "rider-availability-failed", status: 400 } as const) : ({ ok: true, data: { availableDate: today, updatedAt: now } } as const);
}

export async function assignAcceptedRiderOffer(
  admin: AdminClient,
  input: {
    offerId: string;
    riderId: string;
    riderUserId: string;
  },
) {
  await expirePendingOffers(admin);

  const { data: offer } = await admin
    .from("rider_delivery_offers")
    .select("id,order_id,restaurant_id,restaurant_rider_id,rider_user_id,status,expires_at")
    .eq("id", input.offerId)
    .eq("restaurant_rider_id", input.riderId)
    .eq("rider_user_id", input.riderUserId)
    .maybeSingle();

  const offerRow = offer as RiderOfferRow | null;
  if (!offerRow || offerRow.status !== "pending") {
    return { ok: false, error: "rider-offer-not-found", status: 404 } as const;
  }

  if (offerRow.expires_at < new Date().toISOString()) {
    await admin.from("rider_delivery_offers").update({ status: "expired", responded_at: new Date().toISOString() }).eq("id", offerRow.id);
    await offerNextRiderForOrder(offerRow.order_id);
    return { ok: false, error: "rider-offer-expired", status: 409 } as const;
  }

  const context = await getOrderForDispatch(admin, offerRow.order_id);
  if (!context || context.order.status !== "ready" || context.order.order_type !== "delivery") {
    await admin.from("rider_delivery_offers").update({ status: "cancelled", responded_at: new Date().toISOString() }).eq("id", offerRow.id);
    return { ok: false, error: "order-not-available", status: 409 } as const;
  }

  const { data: existingLink } = await admin.from("order_delivery_links").select("id,restaurant_rider_id,status,delivery_token").eq("order_id", offerRow.order_id).maybeSingle();
  const existing = existingLink as Pick<DeliveryLinkRow, "id" | "restaurant_rider_id" | "status" | "delivery_token"> | null;
  if (existing?.restaurant_rider_id && activeDispatchStatuses.has(existing.status) && existing.restaurant_rider_id !== input.riderId) {
    await admin.from("rider_delivery_offers").update({ status: "cancelled", responded_at: new Date().toISOString(), response_reason: "order-already-assigned" }).eq("id", offerRow.id);
    return { ok: false, error: "order-already-assigned", status: 409 } as const;
  }

  const token = existing?.delivery_token || `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const { data: rider } = await admin.from("restaurant_riders").select("full_name,phone").eq("id", input.riderId).maybeSingle();
  const { error: linkError } = await admin.from("order_delivery_links").upsert(
    {
      assigned_at: new Date().toISOString(),
      delivery_name: rider?.full_name ?? null,
      delivery_phone: rider?.phone ?? null,
      delivery_token: token,
      dispatch_source: "rider_auto",
      expires_at: endOfBusinessDayIso(),
      order_id: offerRow.order_id,
      restaurant_id: offerRow.restaurant_id,
      restaurant_rider_id: input.riderId,
      rider_offer_id: offerRow.id,
      status: "active",
    },
    { onConflict: "order_id" },
  );

  if (linkError) {
    return { ok: false, error: "rider-offer-accept-failed", status: 409 } as const;
  }

  await Promise.all([
    admin.from("rider_delivery_offers").update({ status: "accepted", responded_at: new Date().toISOString() }).eq("id", offerRow.id),
    admin
      .from("rider_delivery_offers")
      .update({ status: "cancelled", responded_at: new Date().toISOString(), response_reason: "accepted-by-other-offer" })
      .eq("order_id", offerRow.order_id)
      .eq("status", "pending")
      .neq("id", offerRow.id),
  ]);

  return { ok: true, data: { orderId: offerRow.order_id } } as const;
}

export async function rejectRiderOffer(
  admin: AdminClient,
  input: {
    offerId: string;
    reason?: string;
    riderId: string;
    riderUserId: string;
  },
) {
  await expirePendingOffers(admin);

  const { data: offer } = await admin
    .from("rider_delivery_offers")
    .select("id,order_id,restaurant_id,restaurant_rider_id,rider_user_id,status")
    .eq("id", input.offerId)
    .eq("restaurant_rider_id", input.riderId)
    .eq("rider_user_id", input.riderUserId)
    .maybeSingle();

  const offerRow = offer as RiderOfferRow | null;
  if (!offerRow || offerRow.status !== "pending") {
    return { ok: false, error: "rider-offer-not-found", status: 404 } as const;
  }

  const { error } = await admin
    .from("rider_delivery_offers")
    .update({
      responded_at: new Date().toISOString(),
      response_reason: input.reason?.trim() || null,
      status: "rejected",
    })
    .eq("id", offerRow.id);

  if (error) {
    return { ok: false, error: "rider-offer-reject-failed", status: 400 } as const;
  }

  const next = await offerNextRiderForOrder(offerRow.order_id);
  return { ok: true, data: { next, orderId: offerRow.order_id } } as const;
}

export async function listPendingRiderOffers(admin: AdminClient, riderIds: string[]) {
  await expirePendingOffers(admin);

  if (!riderIds.length) {
    return [];
  }

  const { data } = await admin
    .from("rider_delivery_offers")
    .select("id,order_id,restaurant_id,restaurant_rider_id,status,expires_at,created_at,distance_km,score")
    .in("restaurant_rider_id", riderIds)
    .eq("status", "pending")
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  return data ?? [];
}
