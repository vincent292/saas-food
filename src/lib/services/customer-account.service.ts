import { createAdminClient } from "@/lib/supabase/admin";

export type CustomerProfileRecord = {
  id: string;
  fullName: string;
  email: string;
  phone: string;
  documentNumber: string;
  provider: "email" | "google";
  status: "active" | "blocked";
  createdAt: string;
  updatedAt: string;
  lastSignInAt: string | null;
};

export type CustomerAddressRecord = {
  id: string;
  customerId: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  mapsUrl: string | null;
  city: string | null;
  apartment: string | null;
  buildingName: string | null;
  reference: string | null;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CustomerFavoriteRecord = {
  id: string;
  entityId: string;
  kind: "restaurant" | "product";
  title: string;
  subtitle: string;
  imageUrl: string;
  restaurantId: string;
  restaurantSlug: string;
  price?: number;
  savedAt: string;
};

export type CustomerOrderRecord = {
  id: string;
  restaurantName: string;
  restaurantSlug: string;
  orderNumber: string;
  customerPhone: string;
  trackingToken: string;
  orderType: "delivery" | "pickup" | "table" | "pos";
  status: "pending" | "accepted" | "preparing" | "ready" | "delivered" | "cancelled";
  total: number;
  createdAt: string;
};

type ServiceResult<T> = { ok: true; data: T } | { ok: false; error: string; status: number };

type CustomerProfileRow = {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  phone_normalized: string;
  document_number: string;
  provider: "email" | "google";
  status: "active" | "blocked";
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
};

type CustomerOrderRow = {
  id: string;
  restaurant_id: string;
  order_number: string;
  customer_phone: string | null;
  tracking_token: string;
  order_type: CustomerOrderRecord["orderType"];
  status: CustomerOrderRecord["status"];
  total: number;
  created_at: string;
};

type CustomerOrderRestaurantRow = {
  id: string;
  name: string;
  slug: string;
};

type CustomerAddressRow = {
  id: string;
  customer_id: string;
  label: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  maps_url: string | null;
  city: string | null;
  apartment: string | null;
  building_name: string | null;
  reference: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
};

type CustomerFavoriteRow = {
  customer_id: string;
  kind: "restaurant" | "product";
  restaurant_id: string;
  product_id: string | null;
  created_at: string;
};

type CustomerFavoriteRestaurantRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  city: string | null;
  logo_url: string | null;
  banner_url: string | null;
};

type CustomerFavoriteProductRow = {
  id: string;
  restaurant_id: string;
  name: string;
  image_url: string | null;
  price: number;
};

export function normalizeCustomerPhone(value: string) {
  return value.replace(/\D/g, "");
}

export function normalizeCustomerDocument(value: string) {
  return value.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
}

function mapProfile(row: CustomerProfileRow): CustomerProfileRecord {
  return {
    id: row.id,
    fullName: row.full_name,
    email: row.email,
    phone: row.phone,
    documentNumber: row.document_number,
    provider: row.provider,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lastSignInAt: row.last_sign_in_at,
  };
}

function mapAddress(row: CustomerAddressRow): CustomerAddressRecord {
  return {
    id: row.id,
    customerId: row.customer_id,
    label: row.label,
    address: row.address,
    latitude: row.latitude,
    longitude: row.longitude,
    mapsUrl: row.maps_url,
    city: row.city,
    apartment: row.apartment,
    buildingName: row.building_name,
    reference: row.reference,
    isDefault: row.is_default,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listCustomerFavorites(admin: NonNullable<ReturnType<typeof createAdminClient>>, customerId: string): Promise<CustomerFavoriteRecord[]> {
  const { data } = await admin
    .from("customer_favorites")
    .select("customer_id,kind,restaurant_id,product_id,created_at")
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false });
  const favorites = (data ?? []) as CustomerFavoriteRow[];
  if (!favorites.length) return [];

  const restaurantIds = Array.from(new Set(favorites.map((favorite) => favorite.restaurant_id)));
  const productIds = Array.from(new Set(favorites.flatMap((favorite) => favorite.product_id ? [favorite.product_id] : [])));
  const [{ data: restaurants }, { data: products }] = await Promise.all([
    admin.from("restaurants").select("id,name,slug,description,city,logo_url,banner_url").in("id", restaurantIds),
    productIds.length
      ? admin.from("products").select("id,restaurant_id,name,image_url,price").in("id", productIds)
      : Promise.resolve({ data: [] }),
  ]);
  const restaurantById = new Map(((restaurants ?? []) as CustomerFavoriteRestaurantRow[]).map((restaurant) => [restaurant.id, restaurant]));
  const productById = new Map(((products ?? []) as CustomerFavoriteProductRow[]).map((product) => [product.id, product]));

  return favorites.flatMap<CustomerFavoriteRecord>((favorite) => {
    const restaurant = restaurantById.get(favorite.restaurant_id);
    if (!restaurant) return [];

    if (favorite.kind === "restaurant") {
      return [{
        entityId: restaurant.id,
        id: `restaurant:${restaurant.id}`,
        imageUrl: restaurant.banner_url || restaurant.logo_url || "",
        kind: "restaurant" as const,
        restaurantId: restaurant.id,
        restaurantSlug: restaurant.slug,
        savedAt: favorite.created_at,
        subtitle: restaurant.description || restaurant.city || "Local en Yopido",
        title: restaurant.name,
      }];
    }

    const product = favorite.product_id ? productById.get(favorite.product_id) : null;
    if (!product) return [];
    return [{
      entityId: product.id,
      id: `product:${product.id}`,
      imageUrl: product.image_url || "",
      kind: "product" as const,
      price: Number(product.price),
      restaurantId: restaurant.id,
      restaurantSlug: restaurant.slug,
      savedAt: favorite.created_at,
      subtitle: restaurant.name,
      title: product.name,
    }];
  });
}

function mapUniqueError(message = "") {
  if (message.includes("customer_profiles_phone_unique")) return "phone-already-exists";
  if (message.includes("customer_profiles_document_unique")) return "document-already-exists";
  if (message.includes("customer_profiles_email_unique")) return "email-already-exists";
  if (message.includes("customer_profiles_phone_digits") || message.includes("customer_profiles_document_digits")) return "invalid-customer-profile";
  return "customer-save-failed";
}

async function getAdmin() {
  const admin = createAdminClient();
  if (!admin) {
    return { ok: false as const, error: "service-role-required", status: 500 };
  }

  return { ok: true as const, admin };
}

async function isBusinessUser(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string) {
  const { data } = await admin.from("profiles").select("id").eq("id", userId).maybeSingle();
  return Boolean(data);
}

export async function getMobileCustomerSession(request: Request) {
  const adminResult = await getAdmin();
  if (!adminResult.ok) return adminResult;

  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    return { ok: false as const, error: "unauthorized", status: 401 };
  }

  const { data, error } = await adminResult.admin.auth.getUser(token);
  if (error || !data.user) {
    return { ok: false as const, error: "unauthorized", status: 401 };
  }

  return { ok: true as const, admin: adminResult.admin, user: data.user };
}

export async function registerCustomerAccount(input: {
  email: string;
  password: string;
  fullName: string;
  phone: string;
  documentNumber: string;
}): Promise<ServiceResult<CustomerProfileRecord>> {
  const adminResult = await getAdmin();
  if (!adminResult.ok) return adminResult;

  const admin = adminResult.admin;
  const email = input.email.trim().toLowerCase();
  const phone = input.phone.trim();
  const documentNumber = input.documentNumber.trim();
  const phoneNormalized = normalizeCustomerPhone(phone);
  const documentNormalized = normalizeCustomerDocument(documentNumber);

  const [emailMatch, phoneMatch, documentMatch] = await Promise.all([
    admin.from("customer_profiles").select("id").eq("email", email).maybeSingle(),
    admin.from("customer_profiles").select("id").eq("phone_normalized", phoneNormalized).maybeSingle(),
    admin.from("customer_profiles").select("id").eq("document_number_normalized", documentNormalized).maybeSingle(),
  ]);

  if (emailMatch.data) return { ok: false, error: "email-already-exists", status: 409 };
  if (phoneMatch.data) return { ok: false, error: "phone-already-exists", status: 409 };
  if (documentMatch.data) return { ok: false, error: "document-already-exists", status: 409 };

  const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
    email,
    password: input.password,
    email_confirm: true,
    user_metadata: {
      account_type: "customer",
      document_number: documentNumber,
      full_name: input.fullName.trim(),
      phone,
    },
  });

  if (createError || !createdUser.user) {
    const message = createError?.message.toLowerCase() ?? "";
    return { ok: false, error: message.includes("registered") || message.includes("exists") ? "email-already-exists" : "customer-auth-create-failed", status: 409 };
  }

  const payload = {
    id: createdUser.user.id,
    full_name: input.fullName.trim(),
    email,
    phone,
    document_number: documentNumber,
    provider: "email" as const,
    status: "active" as const,
    last_sign_in_at: new Date().toISOString(),
  };

  const { data: profile, error } = await admin.from("customer_profiles").insert(payload).select("*").single();
  if (error || !profile) {
    await admin.auth.admin.deleteUser(createdUser.user.id).catch(() => null);
    return { ok: false, error: mapUniqueError(error?.message), status: 409 };
  }

  return { ok: true, data: mapProfile(profile as CustomerProfileRow) };
}

export async function getCustomerAccount(
  request: Request,
): Promise<ServiceResult<{ profile: CustomerProfileRecord | null; addresses: CustomerAddressRecord[]; favorites: CustomerFavoriteRecord[]; orders: CustomerOrderRecord[] }>> {
  const session = await getMobileCustomerSession(request);
  if (!session.ok) return session;

  const { data: profile } = await session.admin.from("customer_profiles").select("*").eq("id", session.user.id).maybeSingle();
  const profileRow = profile as CustomerProfileRow | null;
  const orderFilters = [`customer_id.eq.${session.user.id}`];
  if (profileRow?.phone_normalized) {
    orderFilters.push(`customer_phone_normalized.eq.${profileRow.phone_normalized}`);
  }

  const [{ data: addresses }, { data: orders }, favorites] = await Promise.all([
    session.admin.from("customer_addresses").select("*").eq("customer_id", session.user.id).order("is_default", { ascending: false }).order("updated_at", { ascending: false }),
    session.admin
      .from("orders")
      .select("id,restaurant_id,order_number,customer_phone,tracking_token,order_type,status,total,created_at")
      .or(orderFilters.join(","))
      .order("created_at", { ascending: false })
      .limit(50),
    listCustomerFavorites(session.admin, session.user.id),
  ]);

  if (profile) {
    await session.admin.from("customer_profiles").update({ last_sign_in_at: new Date().toISOString() }).eq("id", session.user.id);
  }

  const orderRows = (orders ?? []) as CustomerOrderRow[];
  const restaurantIds = Array.from(new Set(orderRows.map((order) => order.restaurant_id)));
  const { data: restaurants } = restaurantIds.length
    ? await session.admin.from("restaurants").select("id,name,slug").in("id", restaurantIds)
    : { data: [] };
  const restaurantById = new Map(
    ((restaurants ?? []) as CustomerOrderRestaurantRow[]).map((restaurant) => [restaurant.id, restaurant]),
  );

  return {
    ok: true,
    data: {
      profile: profile ? mapProfile(profile as CustomerProfileRow) : null,
      addresses: ((addresses ?? []) as CustomerAddressRow[]).map(mapAddress),
      favorites,
      orders: orderRows.map((order) => {
        const restaurant = restaurantById.get(order.restaurant_id);
        return {
          id: order.id,
          restaurantName: restaurant?.name ?? "Restaurante",
          restaurantSlug: restaurant?.slug ?? "",
          orderNumber: order.order_number,
          customerPhone: order.customer_phone ?? profileRow?.phone ?? "",
          trackingToken: order.tracking_token,
          orderType: order.order_type,
          status: order.status,
          total: Number(order.total),
          createdAt: order.created_at,
        };
      }),
    },
  };
}

export async function claimCustomerOrders(
  request: Request,
  input: { orders: Array<{ orderId: string; trackingToken: string }> },
): Promise<ServiceResult<{ claimed: number; orderIds: string[] }>> {
  const session = await getMobileCustomerSession(request);
  if (!session.ok) return session;

  const results = await Promise.all(
    input.orders.map((order) =>
      session.admin
        .from("orders")
        .update({
          customer_id: session.user.id,
          customer_email: session.user.email?.trim().toLowerCase() ?? null,
        })
        .eq("id", order.orderId)
        .eq("tracking_token", order.trackingToken)
        .select("id"),
    ),
  );

  const error = results.find((result) => result.error)?.error;
  if (error) {
    return { ok: false, error: "customer-order-claim-failed", status: 400 };
  }

  const orderIds = results.flatMap((result) => (result.data ?? []).map((order) => order.id));
  return {
    ok: true,
    data: {
      claimed: orderIds.length,
      orderIds,
    },
  };
}

export async function updateCustomerProfile(
  request: Request,
  input: { fullName: string; phone: string; documentNumber: string },
): Promise<ServiceResult<CustomerProfileRecord>> {
  const session = await getMobileCustomerSession(request);
  if (!session.ok) return session;

  if (await isBusinessUser(session.admin, session.user.id)) {
    return { ok: false, error: "business-account-not-allowed", status: 403 };
  }

  const email = session.user.email?.trim().toLowerCase();
  if (!email) {
    return { ok: false, error: "email-required", status: 400 };
  }

  const phone = input.phone.trim();
  const documentNumber = input.documentNumber.trim();
  const phoneNormalized = normalizeCustomerPhone(phone);
  const documentNormalized = normalizeCustomerDocument(documentNumber);

  const [phoneMatch, documentMatch] = await Promise.all([
    session.admin.from("customer_profiles").select("id").eq("phone_normalized", phoneNormalized).neq("id", session.user.id).maybeSingle(),
    session.admin.from("customer_profiles").select("id").eq("document_number_normalized", documentNormalized).neq("id", session.user.id).maybeSingle(),
  ]);

  if (phoneMatch.data) return { ok: false, error: "phone-already-exists", status: 409 };
  if (documentMatch.data) return { ok: false, error: "document-already-exists", status: 409 };

  const { data: profile, error } = await session.admin
    .from("customer_profiles")
    .upsert(
      {
        id: session.user.id,
        full_name: input.fullName.trim(),
        email,
        phone,
        document_number: documentNumber,
        provider: session.user.app_metadata?.provider === "google" ? "google" : "email",
        status: "active",
        last_sign_in_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error || !profile) {
    return { ok: false, error: mapUniqueError(error?.message), status: 409 };
  }

  return { ok: true, data: mapProfile(profile as CustomerProfileRow) };
}

export async function createCustomerAddress(
  request: Request,
  input: {
    label: string;
    address: string;
    latitude?: number;
    longitude?: number;
    mapsUrl?: string;
    city?: string;
    apartment?: string;
    buildingName?: string;
    reference?: string;
    isDefault?: boolean;
  },
): Promise<ServiceResult<CustomerAddressRecord[]>> {
  const session = await getMobileCustomerSession(request);
  if (!session.ok) return session;

  const { data: profile } = await session.admin.from("customer_profiles").select("id").eq("id", session.user.id).maybeSingle();
  if (!profile) {
    return { ok: false, error: "customer-profile-required", status: 409 };
  }

  if (input.isDefault) {
    await session.admin.from("customer_addresses").update({ is_default: false }).eq("customer_id", session.user.id);
  }

  const { error } = await session.admin.from("customer_addresses").insert({
    customer_id: session.user.id,
    label: input.label.trim() || "Direccion",
    address: input.address.trim(),
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    maps_url: input.mapsUrl ?? null,
    city: input.city ?? null,
    apartment: input.apartment?.trim() || null,
    building_name: input.buildingName?.trim() || null,
    reference: input.reference?.trim() || null,
    is_default: Boolean(input.isDefault),
  });

  if (error) {
    return { ok: false, error: "address-save-failed", status: 400 };
  }

  const { data: addresses } = await session.admin.from("customer_addresses").select("*").eq("customer_id", session.user.id).order("is_default", { ascending: false }).order("updated_at", { ascending: false });

  return { ok: true, data: ((addresses ?? []) as CustomerAddressRow[]).map(mapAddress) };
}

export async function setCustomerFavorite(
  request: Request,
  input: {
    kind: "restaurant" | "product";
    restaurantId: string;
    productId?: string;
    favorite: boolean;
  },
): Promise<ServiceResult<CustomerFavoriteRecord[]>> {
  const session = await getMobileCustomerSession(request);
  if (!session.ok) return session;

  const { data: profile } = await session.admin.from("customer_profiles").select("id").eq("id", session.user.id).maybeSingle();
  if (!profile) return { ok: false, error: "customer-profile-required", status: 409 };

  const { data: restaurant } = await session.admin.from("restaurants").select("id").eq("id", input.restaurantId).maybeSingle();
  if (!restaurant) return { ok: false, error: "favorite-restaurant-not-found", status: 404 };

  if (input.kind === "product") {
    const { data: product } = await session.admin
      .from("products")
      .select("id")
      .eq("id", input.productId ?? "")
      .eq("restaurant_id", input.restaurantId)
      .maybeSingle();
    if (!product) return { ok: false, error: "favorite-product-not-found", status: 404 };
  }

  let favoriteQuery = session.admin
    .from("customer_favorites")
    .delete()
    .eq("customer_id", session.user.id)
    .eq("kind", input.kind);
  favoriteQuery = input.kind === "product"
    ? favoriteQuery.eq("product_id", input.productId ?? "")
    : favoriteQuery.eq("restaurant_id", input.restaurantId).is("product_id", null);
  const { error: deleteError } = await favoriteQuery;
  if (deleteError) return { ok: false, error: "favorite-save-failed", status: 400 };

  if (input.favorite) {
    const { error: insertError } = await session.admin.from("customer_favorites").insert({
      customer_id: session.user.id,
      kind: input.kind,
      product_id: input.kind === "product" ? input.productId : null,
      restaurant_id: input.restaurantId,
    });
    if (insertError) return { ok: false, error: "favorite-save-failed", status: 400 };
  }

  return { ok: true, data: await listCustomerFavorites(session.admin, session.user.id) };
}

export async function listCustomerAccounts(): Promise<CustomerProfileRecord[]> {
  const adminResult = await getAdmin();
  if (!adminResult.ok) return [];

  const { data } = await adminResult.admin.from("customer_profiles").select("*").order("created_at", { ascending: false }).limit(500);
  return ((data ?? []) as CustomerProfileRow[]).map(mapProfile);
}
