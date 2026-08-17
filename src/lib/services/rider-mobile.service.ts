import { createAdminClient } from "@/lib/supabase/admin";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { sendOrderStatusPush } from "@/lib/services/mobile-push.service";
import type { SupabaseClient, User } from "@supabase/supabase-js";

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

type RiderRow = {
  id: string;
  restaurant_id: string;
  rider_user_id: string | null;
  full_name: string;
  email: string;
  phone: string;
  document_number: string;
  plate_number: string;
  status: "active" | "suspended";
  membership_amount: number | string | null;
  membership_currency: string | null;
  membership_started_at: string;
  membership_valid_until: string;
  approved_at: string;
};

type RestaurantRow = {
  id: string;
  name: string;
  slug: string;
  city: string | null;
  logo_url: string | null;
  whatsapp: string | null;
};

type OrderRow = {
  id: string;
  restaurant_id: string;
  order_number: string;
  customer_name: string | null;
  customer_phone: string | null;
  customer_address: string | null;
  delivery_address_detail: string | null;
  delivery_latitude: number | string | null;
  delivery_longitude: number | string | null;
  delivery_maps_url: string | null;
  requested_fulfillment_at: string | null;
  status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
  payment_status: "pending" | "paid" | "cancelled" | "refunded";
  payment_method: "cash" | "qr" | "bank_transfer" | "card" | "other";
  subtotal: number | string;
  delivery_fee: number | string;
  discount_total: number | string;
  total: number | string;
  notes: string | null;
  accepted_at: string | null;
  preparing_at: string | null;
  ready_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  unit_price: number | string;
  quantity: number;
  subtotal: number | string;
  notes: string | null;
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
  opened_at: string | null;
  arrived_at: string | null;
  delivered_at: string | null;
  expires_at: string;
  created_at: string;
  rider_latitude?: number | string | null;
  rider_longitude?: number | string | null;
  rider_location_accuracy_m?: number | string | null;
  rider_location_heading?: number | string | null;
  rider_location_speed_mps?: number | string | null;
  rider_location_updated_at?: string | null;
};

export type MobileRider = {
  id: string;
  restaurantId: string;
  restaurantName: string;
  restaurantSlug: string;
  restaurantCity: string;
  restaurantLogoUrl: string;
  restaurantWhatsapp: string;
  fullName: string;
  email: string;
  phone: string;
  plateNumber: string;
  status: "active" | "suspended" | "expired";
  membershipAmount: number;
  membershipCurrency: string;
  membershipStartedAt: string;
  membershipValidUntil: string;
  approvedAt: string;
};

export type MobileRiderOrder = {
  id: string;
  restaurant: {
    id: string;
    name: string;
    slug: string;
    city: string;
    logoUrl: string;
    whatsapp: string;
  };
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string;
  deliveryAddressDetail: string;
  deliveryLatitude: number | null;
  deliveryLongitude: number | null;
  deliveryMapsUrl: string;
  requestedFulfillmentAt: string | null;
  status: OrderRow["status"];
  paymentStatus: OrderRow["payment_status"];
  paymentMethod: OrderRow["payment_method"];
  subtotal: number;
  deliveryFee: number;
  discountTotal: number;
  total: number;
  notes: string;
  acceptedAt: string | null;
  preparingAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  cancellationReason: string;
  createdAt: string;
  dispatch: {
    id: string;
    riderId: string | null;
    status: DeliveryLinkRow["status"];
    deliveryPhone: string;
    deliveryName: string;
    openedAt: string | null;
    arrivedAt: string | null;
    deliveredAt: string | null;
    expiresAt: string;
    createdAt: string;
    riderLocation: {
      latitude: number;
      longitude: number;
      accuracyMeters: number | null;
      heading: number | null;
      speedMetersPerSecond: number | null;
      updatedAt: string;
    } | null;
  } | null;
  items: Array<{
    id: string;
    productId: string;
    productName: string;
    unitPrice: number;
    quantity: number;
    subtotal: number;
    notes: string;
  }>;
};

export type MobileRiderSession = {
  admin: SupabaseClient;
  user: User;
  riders: MobileRider[];
  activeRiders: MobileRider[];
};

const activeDispatchStatuses = new Set<DeliveryLinkRow["status"]>(["active", "arrived"]);
const finalDispatchStatuses = new Set<DeliveryLinkRow["status"]>(["cancelled", "expired"]);

export function normalizeRiderDocument(value: string) {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function todayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function isExpired(validUntil: string) {
  return validUntil < todayDateOnly();
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

function getAdmin(): ServiceResult<SupabaseClient> {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false, error: "service-role-required", status: 500 };
  }

  return { ok: true, data: admin };
}

function mapRiders(rows: RiderRow[], restaurants: RestaurantRow[]): MobileRider[] {
  const restaurantById = new Map(restaurants.map((restaurant) => [restaurant.id, restaurant]));

  return rows.map((row) => {
    const restaurant = restaurantById.get(row.restaurant_id);
    const expired = isExpired(row.membership_valid_until);

    return {
      id: row.id,
      restaurantId: row.restaurant_id,
      restaurantName: restaurant?.name ?? "Restaurante",
      restaurantSlug: restaurant?.slug ?? "",
      restaurantCity: restaurant?.city ?? "",
      restaurantLogoUrl: restaurant?.logo_url ?? "",
      restaurantWhatsapp: restaurant?.whatsapp ?? "",
      fullName: row.full_name,
      email: row.email,
      phone: row.phone,
      plateNumber: row.plate_number,
      status: row.status === "suspended" ? "suspended" : expired ? "expired" : "active",
      membershipAmount: Number(row.membership_amount ?? 30),
      membershipCurrency: row.membership_currency ?? "BOB",
      membershipStartedAt: row.membership_started_at,
      membershipValidUntil: row.membership_valid_until,
      approvedAt: row.approved_at,
    };
  });
}

async function hydrateRiders(admin: SupabaseClient, rows: RiderRow[]) {
  const restaurantIds = Array.from(new Set(rows.map((row) => row.restaurant_id)));
  const { data: restaurants } = restaurantIds.length
    ? await admin
        .from("restaurants")
        .select("id,name,slug,city,logo_url,whatsapp")
        .in("id", restaurantIds)
        .eq("status", "active")
        .is("deleted_at", null)
    : { data: [] };

  return mapRiders(rows, (restaurants ?? []) as RestaurantRow[]);
}

export async function getMobileRiderSession(request: Request, options?: { requireActive?: boolean }): Promise<ServiceResult<MobileRiderSession>> {
  const adminResult = getAdmin();
  if (!adminResult.ok) return adminResult;
  const admin = adminResult.data;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { ok: false, error: "unauthorized", status: 401 };
  }

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false, error: "unauthorized", status: 401 };
  }

  const { data: riderRows, error: riderError } = await admin
    .from("restaurant_riders")
    .select("id,restaurant_id,rider_user_id,full_name,email,phone,document_number,plate_number,status,membership_amount,membership_currency,membership_started_at,membership_valid_until,approved_at")
    .eq("rider_user_id", data.user.id);

  if (riderError) {
    return { ok: false, error: "rider-session-failed", status: 400 };
  }

  const riders = await hydrateRiders(admin, (riderRows ?? []) as RiderRow[]);
  if (!riders.length) {
    return { ok: false, error: "rider-account-not-linked", status: 403 };
  }

  const activeRiders = riders.filter((rider) => rider.status === "active");
  if (options?.requireActive !== false && !activeRiders.length) {
    return { ok: false, error: "rider-membership-inactive", status: 403 };
  }

  return {
    ok: true,
    data: {
      admin,
      user: data.user,
      riders,
      activeRiders,
    },
  };
}

export async function registerMobileRiderAccount(input: {
  email: string;
  password: string;
  documentNumber: string;
  plateNumber: string;
}): Promise<ServiceResult<{ accessToken: string; refreshToken: string; user: { id: string; email: string }; riders: MobileRider[] }>> {
  const adminResult = getAdmin();
  if (!adminResult.ok) return adminResult;
  const admin = adminResult.data;

  const email = input.email.trim().toLowerCase();
  const documentNumber = normalizeRiderDocument(input.documentNumber);
  const plateNumber = normalizeRiderDocument(input.plateNumber);

  const { data: candidates, error: lookupError } = await admin
    .from("restaurant_riders")
    .select("id,restaurant_id,rider_application_id,rider_user_id,full_name,email,phone,document_number,plate_number,status,membership_amount,membership_currency,membership_started_at,membership_valid_until,approved_at")
    .ilike("email", email)
    .eq("status", "active");

  if (lookupError) {
    return { ok: false, error: "rider-lookup-failed", status: 400 };
  }

  const matchedRows = ((candidates ?? []) as Array<RiderRow & { rider_application_id: string }>).filter(
    (rider) => normalizeRiderDocument(rider.document_number) === documentNumber && normalizeRiderDocument(rider.plate_number) === plateNumber,
  );

  if (!matchedRows.length) {
    return { ok: false, error: "approved-rider-not-found", status: 404 };
  }

  if (matchedRows.every((rider) => isExpired(rider.membership_valid_until))) {
    return { ok: false, error: "rider-membership-expired", status: 403 };
  }

  const linkedToAnotherUser = matchedRows.find((rider) => rider.rider_user_id);
  if (linkedToAnotherUser) {
    return { ok: false, error: "rider-account-already-linked", status: 409 };
  }

  const primaryRider = matchedRows[0];
  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      account_type: "rider",
      full_name: primaryRider.full_name,
      phone: primaryRider.phone,
      plate_number: primaryRider.plate_number,
    },
  });

  if (createError || !created.user) {
    const message = createError?.message.toLowerCase() ?? "";
    return {
      ok: false,
      error: message.includes("registered") || message.includes("exists") ? "email-already-exists" : "rider-auth-create-failed",
      status: 409,
    };
  }

  const riderIds = matchedRows.map((rider) => rider.id);
  const applicationIds = matchedRows.map((rider) => rider.rider_application_id);
  const [{ error: riderUpdateError }, { error: applicationUpdateError }] = await Promise.all([
    admin.from("restaurant_riders").update({ rider_user_id: created.user.id }).in("id", riderIds),
    admin.from("rider_applications").update({ rider_user_id: created.user.id }).in("id", applicationIds),
  ]);

  if (riderUpdateError || applicationUpdateError) {
    await admin.auth.admin.deleteUser(created.user.id).catch(() => null);
    return { ok: false, error: "rider-link-failed", status: 400 };
  }

  const publicClient = createPublicServerClient();
  if (!publicClient) {
    return { ok: false, error: "supabase-not-configured", status: 500 };
  }

  const { data: sessionData, error: signInError } = await publicClient.auth.signInWithPassword({
    email,
    password: input.password,
  });

  if (signInError || !sessionData.session || !sessionData.user) {
    return { ok: false, error: "rider-login-after-register-failed", status: 401 };
  }

  const riders = await hydrateRiders(admin, matchedRows);

  return {
    ok: true,
    data: {
      accessToken: sessionData.session.access_token,
      refreshToken: sessionData.session.refresh_token,
      user: {
        id: sessionData.user.id,
        email: sessionData.user.email ?? email,
      },
      riders,
    },
  };
}

export async function loginMobileRider(input: {
  email: string;
  password: string;
}): Promise<ServiceResult<{ accessToken: string; refreshToken: string; user: { id: string; email: string }; riders: MobileRider[] }>> {
  const publicClient = createPublicServerClient();
  if (!publicClient) {
    return { ok: false, error: "supabase-not-configured", status: 500 };
  }

  const { data, error } = await publicClient.auth.signInWithPassword({
    email: input.email.trim().toLowerCase(),
    password: input.password,
  });

  if (error || !data.session || !data.user) {
    return { ok: false, error: "invalid-rider-credentials", status: 401 };
  }

  const adminResult = getAdmin();
  if (!adminResult.ok) return adminResult;
  const { data: riderRows, error: riderError } = await adminResult.data
    .from("restaurant_riders")
    .select("id,restaurant_id,rider_user_id,full_name,email,phone,document_number,plate_number,status,membership_amount,membership_currency,membership_started_at,membership_valid_until,approved_at")
    .eq("rider_user_id", data.user.id);

  if (riderError) {
    return { ok: false, error: "rider-login-check-failed", status: 400 };
  }

  const riders = await hydrateRiders(adminResult.data, (riderRows ?? []) as RiderRow[]);
  if (!riders.length) {
    return { ok: false, error: "rider-account-not-linked", status: 403 };
  }

  return {
    ok: true,
    data: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      user: {
        id: data.user.id,
        email: data.user.email ?? input.email.trim().toLowerCase(),
      },
      riders,
    },
  };
}

export async function linkMobileRiderGoogleAccount(input: {
  accessToken: string;
  documentNumber: string;
  plateNumber: string;
}): Promise<ServiceResult<{ user: { id: string; email: string }; riders: MobileRider[] }>> {
  const adminResult = getAdmin();
  if (!adminResult.ok) return adminResult;
  const admin = adminResult.data;

  const { data: userData, error: userError } = await admin.auth.getUser(input.accessToken);
  if (userError || !userData.user?.email) {
    return { ok: false, error: "unauthorized", status: 401 };
  }

  const email = userData.user.email.trim().toLowerCase();
  const documentNumber = normalizeRiderDocument(input.documentNumber);
  const plateNumber = normalizeRiderDocument(input.plateNumber);

  const { data: candidates, error: lookupError } = await admin
    .from("restaurant_riders")
    .select("id,restaurant_id,rider_application_id,rider_user_id,full_name,email,phone,document_number,plate_number,status,membership_amount,membership_currency,membership_started_at,membership_valid_until,approved_at")
    .ilike("email", email)
    .eq("status", "active");

  if (lookupError) {
    return { ok: false, error: "rider-lookup-failed", status: 400 };
  }

  const matchedRows = ((candidates ?? []) as Array<RiderRow & { rider_application_id: string | null }>).filter(
    (rider) => normalizeRiderDocument(rider.document_number) === documentNumber && normalizeRiderDocument(rider.plate_number) === plateNumber,
  );

  if (!matchedRows.length) {
    return { ok: false, error: "approved-rider-not-found", status: 404 };
  }

  if (matchedRows.every((rider) => isExpired(rider.membership_valid_until))) {
    return { ok: false, error: "rider-membership-expired", status: 403 };
  }

  const linkedToAnotherUser = matchedRows.find((rider) => rider.rider_user_id && rider.rider_user_id !== userData.user.id);
  if (linkedToAnotherUser) {
    return { ok: false, error: "rider-account-already-linked", status: 409 };
  }

  const riderIds = matchedRows.map((rider) => rider.id);
  const applicationIds = matchedRows.flatMap((rider) => (rider.rider_application_id ? [rider.rider_application_id] : []));
  const [{ error: riderUpdateError }, applicationUpdate] = await Promise.all([
    admin.from("restaurant_riders").update({ rider_user_id: userData.user.id }).in("id", riderIds),
    applicationIds.length
      ? admin.from("rider_applications").update({ rider_user_id: userData.user.id }).in("id", applicationIds)
      : Promise.resolve({ error: null }),
  ]);

  if (riderUpdateError || applicationUpdate.error) {
    return { ok: false, error: "rider-link-failed", status: 400 };
  }

  const riders = await hydrateRiders(admin, matchedRows);

  return {
    ok: true,
    data: {
      user: {
        id: userData.user.id,
        email,
      },
      riders,
    },
  };
}

function serializeOrder({
  dispatch,
  items,
  order,
  restaurant,
}: {
  dispatch?: DeliveryLinkRow | null;
  items: OrderItemRow[];
  order: OrderRow;
  restaurant?: RestaurantRow;
}): MobileRiderOrder {
  return {
    id: order.id,
    restaurant: {
      id: order.restaurant_id,
      name: restaurant?.name ?? "Restaurante",
      slug: restaurant?.slug ?? "",
      city: restaurant?.city ?? "",
      logoUrl: restaurant?.logo_url ?? "",
      whatsapp: restaurant?.whatsapp ?? "",
    },
    orderNumber: order.order_number,
    customerName: order.customer_name ?? "Cliente",
    customerPhone: order.customer_phone ?? "",
    customerAddress: order.customer_address ?? "",
    deliveryAddressDetail: order.delivery_address_detail ?? "",
    deliveryLatitude: order.delivery_latitude == null ? null : Number(order.delivery_latitude),
    deliveryLongitude: order.delivery_longitude == null ? null : Number(order.delivery_longitude),
    deliveryMapsUrl: order.delivery_maps_url ?? "",
    requestedFulfillmentAt: order.requested_fulfillment_at,
    status: order.status,
    paymentStatus: order.payment_status,
    paymentMethod: order.payment_method,
    subtotal: Number(order.subtotal),
    deliveryFee: Number(order.delivery_fee),
    discountTotal: Number(order.discount_total),
    total: Number(order.total),
    notes: order.notes ?? "",
    acceptedAt: order.accepted_at,
    preparingAt: order.preparing_at,
    readyAt: order.ready_at,
    deliveredAt: order.delivered_at,
    cancelledAt: order.cancelled_at,
    cancellationReason: order.cancellation_reason ?? "",
    createdAt: order.created_at,
    dispatch: dispatch
      ? {
          id: dispatch.id,
          riderId: dispatch.restaurant_rider_id,
          status: dispatch.status,
          deliveryPhone: dispatch.delivery_phone ?? "",
          deliveryName: dispatch.delivery_name ?? "",
          openedAt: dispatch.opened_at,
          arrivedAt: dispatch.arrived_at,
          deliveredAt: dispatch.delivered_at,
          expiresAt: dispatch.expires_at,
          createdAt: dispatch.created_at,
          riderLocation:
            dispatch.rider_latitude == null || dispatch.rider_longitude == null || !dispatch.rider_location_updated_at
              ? null
              : {
                  latitude: Number(dispatch.rider_latitude),
                  longitude: Number(dispatch.rider_longitude),
                  accuracyMeters: dispatch.rider_location_accuracy_m == null ? null : Number(dispatch.rider_location_accuracy_m),
                  heading: dispatch.rider_location_heading == null ? null : Number(dispatch.rider_location_heading),
                  speedMetersPerSecond: dispatch.rider_location_speed_mps == null ? null : Number(dispatch.rider_location_speed_mps),
                  updatedAt: dispatch.rider_location_updated_at,
                },
        }
      : null,
    items: items.map((item) => ({
      id: item.id,
      productId: item.product_id ?? "",
      productName: item.product_name,
      unitPrice: Number(item.unit_price),
      quantity: Number(item.quantity),
      subtotal: Number(item.subtotal),
      notes: item.notes ?? "",
    })),
  };
}

async function hydrateOrders(admin: SupabaseClient, orders: OrderRow[], links: DeliveryLinkRow[] = []) {
  if (!orders.length) return [];

  const orderIds = orders.map((order) => order.id);
  const restaurantIds = Array.from(new Set(orders.map((order) => order.restaurant_id)));
  const [{ data: items }, { data: restaurants }] = await Promise.all([
    admin
      .from("order_items")
      .select("id,order_id,product_id,product_name,unit_price,quantity,subtotal,notes")
      .in("order_id", orderIds)
      .order("created_at", { ascending: true }),
    admin
      .from("restaurants")
      .select("id,name,slug,city,logo_url,whatsapp")
      .in("id", restaurantIds),
  ]);

  const linksByOrder = new Map(links.map((link) => [link.order_id, link]));
  const restaurantById = new Map(((restaurants ?? []) as RestaurantRow[]).map((restaurant) => [restaurant.id, restaurant]));
  const itemsByOrder = new Map<string, OrderItemRow[]>();
  ((items ?? []) as OrderItemRow[]).forEach((item) => {
    const current = itemsByOrder.get(item.order_id) ?? [];
    current.push(item);
    itemsByOrder.set(item.order_id, current);
  });

  return orders.map((order) =>
    serializeOrder({
      dispatch: linksByOrder.get(order.id) ?? null,
      items: itemsByOrder.get(order.id) ?? [],
      order,
      restaurant: restaurantById.get(order.restaurant_id),
    }),
  );
}

const orderSelect =
  "id,restaurant_id,order_number,customer_name,customer_phone,customer_address,delivery_address_detail,delivery_latitude,delivery_longitude,delivery_maps_url,requested_fulfillment_at,status,payment_status,payment_method,subtotal,delivery_fee,discount_total,total,notes,accepted_at,preparing_at,ready_at,delivered_at,cancelled_at,cancellation_reason,created_at";

const deliveryLinkSelect =
  "id,restaurant_id,order_id,restaurant_rider_id,delivery_token,delivery_phone,delivery_name,status,opened_at,arrived_at,delivered_at,expires_at,created_at,rider_latitude,rider_longitude,rider_location_accuracy_m,rider_location_heading,rider_location_speed_mps,rider_location_updated_at";

export async function listMobileRiderOrders(
  session: MobileRiderSession,
  scope: "available" | "mine" | "history",
): Promise<ServiceResult<{ orders: MobileRiderOrder[]; scope: "available" | "mine" | "history"; updatedAt: string }>> {
  const riderIds = session.activeRiders.map((rider) => rider.id);
  const restaurantIds = Array.from(new Set(session.activeRiders.map((rider) => rider.restaurantId)));
  if (!riderIds.length || !restaurantIds.length) {
    return { ok: false, error: "rider-membership-inactive", status: 403 };
  }

  try {
    await session.admin.rpc("expire_old_delivery_links");
  } catch {
    // La expiracion es una limpieza oportunista; no bloquea la lectura de pedidos.
  }

  if (scope === "available") {
    const { data: orders, error } = await session.admin
      .from("orders")
      .select(orderSelect)
      .in("restaurant_id", restaurantIds)
      .eq("order_type", "delivery")
      .eq("status", "ready")
      .order("ready_at", { ascending: true, nullsFirst: false })
      .limit(80);

    if (error) {
      return { ok: false, error: "rider-orders-failed", status: 400 };
    }

    const orderRows = (orders ?? []) as OrderRow[];
    const orderIds = orderRows.map((order) => order.id);
    const { data: links } = orderIds.length
      ? await session.admin.from("order_delivery_links").select(deliveryLinkSelect).in("order_id", orderIds)
      : { data: [] };
    const linksByOrder = new Map(((links ?? []) as DeliveryLinkRow[]).map((link) => [link.order_id, link]));
    const availableOrders = orderRows.filter((order) => {
      const link = linksByOrder.get(order.id);
      return !link || finalDispatchStatuses.has(link.status);
    });

    return {
      ok: true,
      data: {
        orders: await hydrateOrders(session.admin, availableOrders, (links ?? []) as DeliveryLinkRow[]),
        scope,
        updatedAt: new Date().toISOString(),
      },
    };
  }

  const linkQuery = session.admin
    .from("order_delivery_links")
    .select(deliveryLinkSelect)
    .in("restaurant_rider_id", riderIds)
    .order("created_at", { ascending: false })
    .limit(scope === "history" ? 120 : 80);
  const { data: links, error: linksError } = scope === "mine" ? await linkQuery.in("status", Array.from(activeDispatchStatuses)) : await linkQuery;

  if (linksError) {
    return { ok: false, error: "rider-dispatches-failed", status: 400 };
  }

  const linkRows = (links ?? []) as DeliveryLinkRow[];
  const orderIds = Array.from(new Set(linkRows.map((link) => link.order_id)));
  const { data: orders, error } = orderIds.length
    ? await session.admin
        .from("orders")
        .select(orderSelect)
        .in("id", orderIds)
        .neq("status", "cancelled")
    : { data: [], error: null };

  if (error) {
    return { ok: false, error: "rider-orders-failed", status: 400 };
  }

  const ordersById = new Map(((orders ?? []) as OrderRow[]).map((order) => [order.id, order]));
  const orderedRows = linkRows.flatMap((link) => {
    const order = ordersById.get(link.order_id);
    return order ? [order] : [];
  });

  return {
    ok: true,
    data: {
      orders: await hydrateOrders(session.admin, orderedRows, linkRows),
      scope,
      updatedAt: new Date().toISOString(),
    },
  };
}

export async function getMobileRiderOrder(session: MobileRiderSession, orderId: string): Promise<ServiceResult<{ order: MobileRiderOrder }>> {
  const restaurantIds = Array.from(new Set(session.activeRiders.map((rider) => rider.restaurantId)));
  const riderIds = session.activeRiders.map((rider) => rider.id);

  const { data: order } = await session.admin
    .from("orders")
    .select(orderSelect)
    .eq("id", orderId)
    .eq("order_type", "delivery")
    .in("restaurant_id", restaurantIds)
    .maybeSingle();

  if (!order) {
    return { ok: false, error: "order-not-found", status: 404 };
  }

  const { data: link } = await session.admin.from("order_delivery_links").select(deliveryLinkSelect).eq("order_id", orderId).maybeSingle();
  const linkRow = link as DeliveryLinkRow | null;
  const visible =
    (order as OrderRow).status === "ready" && (!linkRow || finalDispatchStatuses.has(linkRow.status)) ||
    Boolean(linkRow?.restaurant_rider_id && riderIds.includes(linkRow.restaurant_rider_id));

  if (!visible) {
    return { ok: false, error: "order-not-found", status: 404 };
  }

  const [serialized] = await hydrateOrders(session.admin, [order as OrderRow], linkRow ? [linkRow] : []);
  return { ok: true, data: { order: serialized } };
}

export async function acceptMobileRiderOrder(session: MobileRiderSession, orderId: string): Promise<ServiceResult<{ order: MobileRiderOrder }>> {
  const restaurantIds = Array.from(new Set(session.activeRiders.map((rider) => rider.restaurantId)));
  const { data: order } = await session.admin
    .from("orders")
    .select(orderSelect)
    .eq("id", orderId)
    .eq("order_type", "delivery")
    .eq("status", "ready")
    .in("restaurant_id", restaurantIds)
    .maybeSingle();

  if (!order) {
    return { ok: false, error: "order-not-available", status: 404 };
  }

  const orderRow = order as OrderRow;
  const rider = session.activeRiders.find((candidate) => candidate.restaurantId === orderRow.restaurant_id);
  if (!rider) {
    return { ok: false, error: "rider-restaurant-not-allowed", status: 403 };
  }

  const { data: existingLink } = await session.admin.from("order_delivery_links").select(deliveryLinkSelect).eq("order_id", orderId).maybeSingle();
  const existing = existingLink as DeliveryLinkRow | null;

  if (existing && activeDispatchStatuses.has(existing.status) && existing.restaurant_rider_id !== rider.id) {
    return { ok: false, error: "order-already-assigned", status: 409 };
  }

  if (existing?.status === "delivered") {
    return { ok: false, error: "order-already-delivered", status: 409 };
  }

  const token = existing?.delivery_token || `${crypto.randomUUID().replaceAll("-", "")}${crypto.randomUUID().replaceAll("-", "")}`;
  const payload = {
    restaurant_id: orderRow.restaurant_id,
    order_id: orderRow.id,
    restaurant_rider_id: rider.id,
    delivery_token: token,
    delivery_phone: rider.phone,
    delivery_name: rider.fullName,
    status: "active" as const,
    opened_at: null,
    arrived_at: null,
    delivered_at: null,
    expires_at: endOfBusinessDayIso(),
  };

  const { error } = await session.admin.from("order_delivery_links").upsert(payload, { onConflict: "order_id" });
  if (error) {
    return { ok: false, error: error.code === "23505" ? "order-already-assigned" : "order-accept-failed", status: 409 };
  }

  const { data: link } = await session.admin.from("order_delivery_links").select(deliveryLinkSelect).eq("order_id", orderId).maybeSingle();
  const [serialized] = await hydrateOrders(session.admin, [orderRow], link ? [link as DeliveryLinkRow] : []);
  return { ok: true, data: { order: serialized } };
}

export async function updateMobileRiderDeliveryStatus(
  session: MobileRiderSession,
  orderId: string,
  status: "arrived" | "delivered",
): Promise<ServiceResult<{ order: MobileRiderOrder; status: "arrived" | "delivered" }>> {
  const riderIds = session.activeRiders.map((rider) => rider.id);
  const { data: link } = await session.admin
    .from("order_delivery_links")
    .select(deliveryLinkSelect)
    .eq("order_id", orderId)
    .in("restaurant_rider_id", riderIds)
    .maybeSingle();

  const linkRow = link as DeliveryLinkRow | null;
  if (!linkRow) {
    return { ok: false, error: "rider-dispatch-not-found", status: 404 };
  }

  if (linkRow.status === "delivered") {
    return { ok: false, error: "order-already-delivered", status: 409 };
  }

  const rpcName = status === "arrived" ? "mark_delivery_order_arrived" : "mark_delivery_order_delivered";
  const { data, error } = await session.admin.rpc(rpcName, {
    p_delivery_token: linkRow.delivery_token,
  });

  if (error) {
    return { ok: false, error: error.message || "delivery-status-failed", status: 400 };
  }

  const payload = data as { order_id?: string; restaurant_id?: string } | null;
  if (payload?.order_id) {
    await sendOrderStatusPush({
      eventType: "delivery_status",
      orderId: payload.order_id,
      status,
    }).catch((pushError) => {
      console.error("rider-mobile-delivery-push-failed", pushError);
    });
  }

  const result = await getMobileRiderOrder(session, orderId);
  if (!result.ok) return result;

  return {
    ok: true,
    data: {
      order: result.data.order,
      status,
    },
  };
}

export async function updateMobileRiderLocation(
  session: MobileRiderSession,
  orderId: string,
  input: {
    latitude: number;
    longitude: number;
    accuracyMeters?: number | null;
    heading?: number | null;
    speedMetersPerSecond?: number | null;
  },
): Promise<ServiceResult<{ order: MobileRiderOrder }>> {
  if (
    !Number.isFinite(input.latitude) ||
    !Number.isFinite(input.longitude) ||
    input.latitude < -90 ||
    input.latitude > 90 ||
    input.longitude < -180 ||
    input.longitude > 180
  ) {
    return { ok: false, error: "invalid-rider-location", status: 400 };
  }

  const riderIds = session.activeRiders.map((rider) => rider.id);
  const { data: link } = await session.admin
    .from("order_delivery_links")
    .select(deliveryLinkSelect)
    .eq("order_id", orderId)
    .in("restaurant_rider_id", riderIds)
    .in("status", Array.from(activeDispatchStatuses))
    .maybeSingle();

  const linkRow = link as DeliveryLinkRow | null;
  if (!linkRow) {
    return { ok: false, error: "rider-dispatch-not-found", status: 404 };
  }

  const { error } = await session.admin
    .from("order_delivery_links")
    .update({
      rider_latitude: input.latitude,
      rider_longitude: input.longitude,
      rider_location_accuracy_m: input.accuracyMeters ?? null,
      rider_location_heading: input.heading ?? null,
      rider_location_speed_mps: input.speedMetersPerSecond ?? null,
      rider_location_updated_at: new Date().toISOString(),
    })
    .eq("id", linkRow.id);

  if (error) {
    return { ok: false, error: "rider-location-failed", status: 400 };
  }

  const result = await getMobileRiderOrder(session, orderId);
  if (!result.ok) return result;
  return { ok: true, data: { order: result.data.order } };
}
