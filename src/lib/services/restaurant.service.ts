import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { createPublicServerClient } from "@/lib/supabase/public-server";
import { fullPlanModules } from "@/lib/billing/full-plan";
import { inferRestaurantCategory, normalizeRestaurantBusinessType, normalizeRestaurantCategory } from "@/lib/restaurant-directory-options";
import { defaultRestaurantPalette } from "@/lib/theme/design-tokens";
import type { PlanKey, Restaurant, RestaurantDeliveryZone, RestaurantSettings } from "@/types/restaurant.types";

const legacyGreenBrandColors = new Set(["#1d8844", "#146333", "#15803d", "#22c55e"]);

function normalizeBrandPrimary(value?: string | null) {
  const normalized = value?.trim().toLowerCase();
  if (!normalized || legacyGreenBrandColors.has(normalized)) {
    return defaultRestaurantPalette.primaryColor;
  }
  return value ?? defaultRestaurantPalette.primaryColor;
}

function themeFromColors({
  primaryColor,
  secondaryColor,
  backgroundColor,
  surfaceColor,
  textColor,
  mutedColor,
  borderColor,
  navBackgroundColor,
  navTextColor,
}: {
  primaryColor: string;
  secondaryColor?: string | null;
  backgroundColor?: string | null;
  surfaceColor?: string | null;
  textColor?: string | null;
  mutedColor?: string | null;
  borderColor?: string | null;
  navBackgroundColor?: string | null;
  navTextColor?: string | null;
}) {
  const primary = normalizeBrandPrimary(primaryColor);

  return {
    primary,
    primaryDark: defaultRestaurantPalette.primaryDark,
    primaryLight: defaultRestaurantPalette.primaryLight,
    background: backgroundColor || defaultRestaurantPalette.backgroundColor,
    surface: surfaceColor || defaultRestaurantPalette.surfaceColor,
    text: textColor || defaultRestaurantPalette.textColor,
    muted: mutedColor || defaultRestaurantPalette.mutedColor,
    border: borderColor || defaultRestaurantPalette.borderColor,
    navBackground: navBackgroundColor || surfaceColor || defaultRestaurantPalette.surfaceColor,
    navText: navTextColor || textColor || defaultRestaurantPalette.textColor,
    success: defaultRestaurantPalette.successColor,
    warning: secondaryColor || defaultRestaurantPalette.secondaryColor,
    danger: defaultRestaurantPalette.dangerColor,
  };
}

function mapRestaurant(row: {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  status: Restaurant["status"];
  owner_user_id?: string | null;
  owner_name?: string | null;
  owner_email?: string | null;
  deactivated_at?: string | null;
  deleted_at?: string | null;
  logo_url: string | null;
  banner_url: string | null;
  primary_color: string;
  secondary_color: string | null;
  background_color?: string | null;
  surface_color?: string | null;
  text_color?: string | null;
  muted_color?: string | null;
  border_color?: string | null;
  nav_background_color?: string | null;
  nav_text_color?: string | null;
  menu_background_image_url?: string | null;
  public_banner_size?: "compact" | "standard" | "large" | null;
  whatsapp: string | null;
  address: string | null;
  address_reference?: string | null;
  city: string | null;
  business_type?: Restaurant["businessType"] | null;
  public_category?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  maps_url?: string | null;
}): Restaurant {
  const businessType = normalizeRestaurantBusinessType(row.business_type);
  const primaryColor = normalizeBrandPrimary(row.primary_color);
  const secondaryColor = row.secondary_color || defaultRestaurantPalette.secondaryColor;
  const initials = row.name
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description ?? "",
    status: row.status,
    ownerUserId: row.owner_user_id ?? undefined,
    ownerName: row.owner_name ?? undefined,
    ownerEmail: row.owner_email ?? undefined,
    deactivatedAt: row.deactivated_at ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
    logoUrl: row.logo_url || initials,
    bannerUrl: row.banner_url || "",
    primaryColor,
    secondaryColor,
    whatsapp: row.whatsapp ?? "",
    address: row.address ?? "",
    addressReference: row.address_reference ?? "",
    city: row.city ?? "",
    businessType,
    publicCategory: normalizeRestaurantCategory(row.public_category ?? inferRestaurantCategory(`${row.name} ${row.description ?? ""}`, businessType), businessType),
    latitude: row.latitude === null || row.latitude === undefined ? undefined : Number(row.latitude),
    longitude: row.longitude === null || row.longitude === undefined ? undefined : Number(row.longitude),
    mapsUrl: row.maps_url ?? "",
    menuBackgroundImageUrl: row.menu_background_image_url ?? "",
    publicBannerSize: row.public_banner_size ?? "compact",
    theme: themeFromColors({
      primaryColor,
      secondaryColor,
      backgroundColor: row.background_color,
      surfaceColor: row.surface_color,
      textColor: row.text_color,
      mutedColor: row.muted_color,
      borderColor: row.border_color,
      navBackgroundColor: row.nav_background_color,
      navTextColor: row.nav_text_color,
    }),
  };
}

function mapSettings(row: {
  restaurant_id: string;
  delivery_enabled: boolean;
  pickup_enabled: boolean;
  table_orders_enabled: boolean;
  inventory_enabled: boolean;
  cash_enabled: boolean;
  kitchen_enabled: boolean;
  delivery_fee: number;
  delivery_qr_prepayment_enabled?: boolean | null;
  far_delivery_distance_km?: number | null;
  free_delivery_from: number | null;
  min_order_amount: number;
  currency: string;
  invoice_enabled?: boolean | null;
  qr_payment_url: string | null;
  qr_account_name?: string | null;
  qr_account_document?: string | null;
  qr_bank_name?: string | null;
  qr_account_type?: string | null;
  qr_currency?: string | null;
  print_format?: "thermal_58" | "thermal_80" | "large" | null;
  auto_print_kitchen?: boolean | null;
  print_logo?: boolean | null;
}): RestaurantSettings {
  return {
    restaurantId: row.restaurant_id,
    deliveryEnabled: row.delivery_enabled,
    pickupEnabled: row.pickup_enabled,
    tableOrdersEnabled: row.table_orders_enabled,
    inventoryEnabled: row.inventory_enabled,
    cashEnabled: row.cash_enabled,
    kitchenEnabled: row.kitchen_enabled,
    deliveryFee: Number(row.delivery_fee),
    deliveryQrPrepaymentEnabled: row.delivery_qr_prepayment_enabled ?? true,
    farDeliveryDistanceKm: Number(row.far_delivery_distance_km ?? 5),
    freeDeliveryFrom: Number(row.free_delivery_from ?? 0),
    minOrderAmount: Number(row.min_order_amount),
    currency: row.currency,
    invoiceEnabled: row.invoice_enabled ?? false,
    qrPaymentUrl: row.qr_payment_url ?? "",
    qrAccountName: row.qr_account_name ?? "",
    qrAccountDocument: row.qr_account_document ?? "",
    qrBankName: row.qr_bank_name ?? "",
    qrAccountType: row.qr_account_type ?? "",
    qrCurrency: row.qr_currency ?? row.currency,
    printFormat: row.print_format ?? "thermal_80",
    autoPrintKitchen: row.auto_print_kitchen ?? false,
    printLogo: row.print_logo ?? true,
  };
}

function mapDeliveryZone(row: {
  id: string;
  restaurant_id: string;
  name: string;
  city: string | null;
  center_latitude: number | null;
  center_longitude: number | null;
  radius_km: number;
  delivery_fee: number;
  min_order_amount: number;
  is_active: boolean;
}): RestaurantDeliveryZone {
  return {
    id: row.id,
    restaurantId: row.restaurant_id,
    name: row.name,
    city: row.city ?? "",
    centerLatitude: row.center_latitude === null ? undefined : Number(row.center_latitude),
    centerLongitude: row.center_longitude === null ? undefined : Number(row.center_longitude),
    radiusKm: Number(row.radius_km),
    deliveryFee: Number(row.delivery_fee),
    minOrderAmount: Number(row.min_order_amount),
    isActive: row.is_active,
  };
}

async function enrichRestaurants(restaurants: Restaurant[]) {
  if (!hasSupabaseEnv() || restaurants.length === 0) {
    return restaurants;
  }

  const supabase = await createClient();
  const restaurantIds = restaurants.map((restaurant) => restaurant.id);
  const [{ data: subscriptions }, { data: plans }] = await Promise.all([
    supabase.from("restaurant_subscriptions").select("restaurant_id, plan_id").in("restaurant_id", restaurantIds).in("status", ["trialing", "active", "past_due"]),
    supabase.from("subscription_plans").select("id, key").eq("is_active", true),
  ]);

  return restaurants.map((restaurant) => {
    const subscription = subscriptions?.find((item) => item.restaurant_id === restaurant.id);
    const plan = plans?.find((item) => item.id === subscription?.plan_id);

    return {
      ...restaurant,
      planKey: plan?.key as PlanKey | undefined,
      activeModules: fullPlanModules,
    };
  });
}

export const restaurantService = {
  async listPublicDirectoryRestaurants() {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return [];
    }
    const { data, error } = await supabase.from("restaurants").select("*").eq("status", "active").is("deleted_at", null).order("created_at", { ascending: false });

    if (error || !data?.length) {
      return [];
    }

    const restaurants = data.map(mapRestaurant);
    return restaurants.map((restaurant) => ({
      ...restaurant,
      activeModules: fullPlanModules,
    }));
  },

  async getPublicBySlug(slug: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return null;
    }

    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const restaurant = mapRestaurant(data);
    return {
      ...restaurant,
      activeModules: fullPlanModules,
    };
  },

  async listRestaurants() {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("restaurants").select("*").is("deleted_at", null).order("created_at", { ascending: false });

    if (error || !data?.length) {
      return [];
    }

    return enrichRestaurants(data.map(mapRestaurant));
  },

  async listDeletedRestaurants() {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("restaurants").select("*").not("deleted_at", "is", null).order("deleted_at", { ascending: false });

    if (error || !data?.length) {
      return [];
    }

    return enrichRestaurants(data.map(mapRestaurant));
  },

  async getBySlug(slug: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data: rawRestaurant, error: rawError } = await supabase.from("restaurants").select("*").eq("slug", slug).is("deleted_at", null).maybeSingle();

    if (rawError || !rawRestaurant) {
      return null;
    }

    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const [restaurant] = await enrichRestaurants([mapRestaurant(data)]);
    return restaurant.activeModules?.includes("public_menu") ? restaurant : null;
  },

  async getOperationalBySlug(slug: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data: rawRestaurant, error: rawError } = await supabase.from("restaurants").select("*").eq("slug", slug).is("deleted_at", null).maybeSingle();

    if (rawError || !rawRestaurant) {
      return null;
    }

    const { data, error } = await supabase
      .from("restaurants")
      .select("*")
      .eq("slug", slug)
      .eq("status", "active")
      .is("deleted_at", null)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    const [restaurant] = await enrichRestaurants([mapRestaurant(data)]);
    return restaurant;
  },

  async getById(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("restaurants").select("*").eq("id", restaurantId).maybeSingle();

    if (error || !data) {
      return null;
    }

    if (data.deleted_at || data.status !== "active") {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) {
        return null;
      }

      const { data: profile } = await supabase.from("profiles").select("global_role").eq("id", userData.user.id).maybeSingle();
      if (profile?.global_role !== "superadmin") {
        const { data: membership } = await supabase
          .from("restaurant_memberships")
          .select("role")
          .eq("restaurant_id", restaurantId)
          .eq("user_id", userData.user.id)
          .eq("is_active", true)
          .maybeSingle();

        if (!membership) {
          return null;
        }
      }
    }

    const [restaurant] = await enrichRestaurants([mapRestaurant(data)]);
    return restaurant;
  },

  async getSettings(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("restaurant_settings").select("*").eq("restaurant_id", restaurantId).maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapSettings(data);
  },

  async getPublicSettings(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = createPublicServerClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("restaurant_settings")
        .select("*")
        .eq("restaurant_id", restaurantId)
        .maybeSingle();

      if (!error && data) {
        return mapSettings(data);
      }
    }

    const admin = createAdminClient();
    if (!admin) {
      return null;
    }

    const { data, error } = await admin
      .from("restaurant_settings")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .maybeSingle();

    if (error || !data) {
      return null;
    }

    return mapSettings(data);
  },

  async listDeliveryZones(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("restaurant_delivery_zones")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .order("is_active", { ascending: false })
      .order("name", { ascending: true });

    if (error || !data?.length) {
      return [];
    }

    return data.map(mapDeliveryZone);
  },

  async listPublicDeliveryZones(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = createPublicServerClient();
    if (!supabase) {
      return [];
    }

    const { data, error } = await supabase
      .from("restaurant_delivery_zones")
      .select("*")
      .eq("restaurant_id", restaurantId)
      .eq("is_active", true)
      .order("name", { ascending: true });

    if (error || !data?.length) {
      return [];
    }

    return data.map(mapDeliveryZone);
  },
};
