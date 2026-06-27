import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { ModuleKey, PlanKey, Restaurant, RestaurantSettings } from "@/types/restaurant.types";

function themeFromColors(primaryColor: string, secondaryColor?: string | null) {
  return {
    primary: primaryColor || "#1d8844",
    primaryDark: "#146333",
    primaryLight: "#e8f7ee",
    background: "#f7faf7",
    surface: "#ffffff",
    text: "#142018",
    muted: "#68766c",
    border: "#dfe8e2",
    success: primaryColor || "#1d8844",
    warning: secondaryColor || "#d97706",
    danger: "#dc2626",
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
  whatsapp: string | null;
  address: string | null;
  city: string | null;
}): Restaurant {
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
    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color ?? "#f59e0b",
    whatsapp: row.whatsapp ?? "",
    address: row.address ?? "",
    city: row.city ?? "",
    theme: themeFromColors(row.primary_color, row.secondary_color),
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
  free_delivery_from: number | null;
  min_order_amount: number;
  currency: string;
  qr_payment_url: string | null;
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
    freeDeliveryFrom: Number(row.free_delivery_from ?? 0),
    minOrderAmount: Number(row.min_order_amount),
    currency: row.currency,
    qrPaymentUrl: row.qr_payment_url ?? "",
    printFormat: row.print_format ?? "thermal_80",
    autoPrintKitchen: row.auto_print_kitchen ?? false,
    printLogo: row.print_logo ?? true,
  };
}

async function enrichRestaurants(restaurants: Restaurant[]) {
  if (!hasSupabaseEnv() || restaurants.length === 0) {
    return restaurants;
  }

  const supabase = await createClient();
  const restaurantIds = restaurants.map((restaurant) => restaurant.id);
  const [{ data: subscriptions }, { data: plans }, { data: modules }, { data: planModules }] = await Promise.all([
    supabase.from("restaurant_subscriptions").select("restaurant_id, plan_id").in("restaurant_id", restaurantIds).in("status", ["trialing", "active", "past_due"]),
    supabase.from("subscription_plans").select("id, key").eq("is_active", true),
    supabase.from("module_settings").select("restaurant_id, module_key, is_enabled").in("restaurant_id", restaurantIds),
    supabase.from("plan_modules").select("plan_id, module_key, is_enabled").eq("is_enabled", true),
  ]);

  return restaurants.map((restaurant) => {
    const subscription = subscriptions?.find((item) => item.restaurant_id === restaurant.id);
    const plan = plans?.find((item) => item.id === subscription?.plan_id);
    const allowedModules = new Set((planModules ?? []).filter((module) => module.plan_id === subscription?.plan_id).map((module) => module.module_key));
    const configuredModules = (modules ?? []).filter((module) => module.restaurant_id === restaurant.id);
    const fallbackModules: ModuleKey[] = plan ? Array.from(allowedModules).map((moduleKey) => moduleKey as ModuleKey) : ["public_menu", "orders"];
    const activeModules = configuredModules.length
      ? configuredModules
          .filter((module) => module.is_enabled)
          .filter((module) => !plan || allowedModules.has(module.module_key))
          .map((module) => module.module_key as ModuleKey)
      : fallbackModules;

    return {
      ...restaurant,
      planKey: plan?.key as PlanKey | undefined,
      activeModules,
    };
  });
}

export const restaurantService = {
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
    const { data, error } = await supabase.from("restaurants").select("*").eq("slug", slug).eq("status", "active").is("deleted_at", null).maybeSingle();

    if (error || !data) {
      return null;
    }

    const [restaurant] = await enrichRestaurants([mapRestaurant(data)]);
    return restaurant.activeModules?.includes("public_menu") ? restaurant : null;
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
        return null;
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
};
