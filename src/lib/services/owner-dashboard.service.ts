import { createClient } from "@/lib/supabase/server";
import { additionalLocationPriceMonthly, fullPlanName, primaryLocationPriceMonthly } from "@/lib/billing/full-plan";
import { formatMoney } from "@/lib/utils/money";
import type { UserRestaurantMembership } from "@/lib/services/membership.service";

export type OwnerBranchSummary = {
  membership: UserRestaurantMembership;
  orders30d: number;
  ordersToday: number;
  activeOrders: number;
  revenue30d: number;
  openCashSession: boolean;
  lastClosedCashAt?: string;
  lowStockItems: number;
  expiringLots: number;
};

export type OwnerBranchCapacity = {
  used: number;
  limit: number;
  planName: string;
  primaryPriceMonthly: number;
  additionalPriceMonthly: number;
  monthlyTotal: number;
};

export type OwnerProductPerformance = {
  productName: string;
  branchName: string;
  quantity: number;
  revenue: number;
};

export type OwnerDashboardData = {
  capacity: OwnerBranchCapacity;
  summaries: OwnerBranchSummary[];
  performance: {
    topProducts: OwnerProductPerformance[];
    lowProducts: OwnerProductPerformance[];
  };
  totals: {
    orders30d: number;
    revenue30d: number;
    activeOrders: number;
    inventoryAlerts: number;
    averageTicket: string;
  };
};

export type OwnerResponsible = {
  restaurantId: string;
  restaurantName: string;
  userId: string;
  role: string;
  email: string;
  fullName: string;
};

export function ownerMembershipsForUser(memberships: UserRestaurantMembership[], userId: string) {
  return memberships.filter((membership) => membership.role === "restaurant_admin" && membership.restaurant.ownerUserId === userId);
}

export async function getOwnerDashboardData(memberships: UserRestaurantMembership[]): Promise<OwnerDashboardData> {
  const [summaries, capacity, performance] = await Promise.all([
    getOwnerBranchSummaries(memberships),
    getOwnerBranchCapacity(memberships),
    getOwnerProductPerformance(memberships),
  ]);

  const orders30d = summaries.reduce((sum, summary) => sum + summary.orders30d, 0);
  const revenue30d = summaries.reduce((sum, summary) => sum + summary.revenue30d, 0);
  const activeOrders = summaries.reduce((sum, summary) => sum + summary.activeOrders, 0);
  const inventoryAlerts = summaries.reduce((sum, summary) => sum + summary.lowStockItems + summary.expiringLots, 0);

  return {
    capacity,
    summaries,
    performance,
    totals: {
      orders30d,
      revenue30d,
      activeOrders,
      inventoryAlerts,
      averageTicket: orders30d ? formatMoney(revenue30d / orders30d) : formatMoney(0),
    },
  };
}

export async function getOwnerBranchSummaries(memberships: UserRestaurantMembership[]): Promise<OwnerBranchSummary[]> {
  const restaurantIds = memberships.map((membership) => membership.restaurant.id);

  if (!restaurantIds.length) {
    return [];
  }

  const supabase = await createClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const next14Days = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
  const since30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [{ data: orders }, { data: cashSessions }, { data: inventoryItems }, { data: inventoryLots }] = await Promise.all([
    supabase.from("orders").select("restaurant_id,status,total,created_at").in("restaurant_id", restaurantIds).gte("created_at", since30Days.toISOString()),
    supabase.from("cash_sessions").select("restaurant_id,status,closed_at,opened_at").in("restaurant_id", restaurantIds).order("opened_at", { ascending: false }),
    supabase.from("inventory_items").select("restaurant_id,current_stock,min_stock,is_active").in("restaurant_id", restaurantIds).eq("is_active", true),
    supabase
      .from("inventory_lots")
      .select("restaurant_id,expires_on,remaining_quantity,is_active")
      .in("restaurant_id", restaurantIds)
      .eq("is_active", true)
      .gt("remaining_quantity", 0),
  ]);

  return memberships.map((membership) => {
    const branchOrders = (orders ?? []).filter((order) => order.restaurant_id === membership.restaurant.id);
    const validOrders = branchOrders.filter((order) => order.status !== "cancelled");
    const branchCashSessions = (cashSessions ?? []).filter((session) => session.restaurant_id === membership.restaurant.id);
    const latestClosedCash = branchCashSessions.find((session) => session.status === "closed" && session.closed_at);
    const branchInventory = (inventoryItems ?? []).filter((item) => item.restaurant_id === membership.restaurant.id);
    const branchLots = (inventoryLots ?? []).filter((lot) => lot.restaurant_id === membership.restaurant.id);

    return {
      membership,
      orders30d: validOrders.length,
      ordersToday: validOrders.filter((order) => new Date(order.created_at) >= todayStart).length,
      activeOrders: branchOrders.filter((order) => ["pending", "accepted", "preparing", "ready"].includes(order.status)).length,
      revenue30d: validOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      openCashSession: branchCashSessions.some((session) => session.status === "open"),
      lastClosedCashAt: latestClosedCash?.closed_at ?? undefined,
      lowStockItems: branchInventory.filter((item) => Number(item.min_stock ?? 0) > 0 && Number(item.current_stock ?? 0) <= Number(item.min_stock ?? 0)).length,
      expiringLots: branchLots.filter((lot) => lot.expires_on && new Date(`${lot.expires_on}T00:00:00`) <= next14Days).length,
    };
  });
}

export async function getOwnerBranchCapacity(memberships: UserRestaurantMembership[]): Promise<OwnerBranchCapacity> {
  const ownerUserId = memberships[0]?.restaurant.ownerUserId;

  if (!memberships.length || !ownerUserId) {
    return {
      used: 0,
      limit: 1,
      planName: fullPlanName,
      primaryPriceMonthly: primaryLocationPriceMonthly,
      additionalPriceMonthly: additionalLocationPriceMonthly,
      monthlyTotal: 0,
    };
  }

  const supabase = await createClient();
  const [{ data: entitlement }, { data: plans }] = await Promise.all([
    supabase.from("owner_branch_entitlements").select("branch_limit").eq("owner_user_id", ownerUserId).maybeSingle(),
    supabase.from("subscription_plans").select("name,price_monthly,additional_restaurant_price_monthly").eq("key", "premium").eq("is_active", true).limit(1),
  ]);
  type CapacityPlanRow = {
    name?: string | null;
    price_monthly?: number | string | null;
    additional_restaurant_price_monthly?: number | string | null;
  };
  const planRows = ((plans ?? []) as unknown) as CapacityPlanRow[];
  const fullPlan = planRows[0];
  const primaryPrice = Number(fullPlan?.price_monthly ?? primaryLocationPriceMonthly);
  const additionalPrice = Number(fullPlan?.additional_restaurant_price_monthly ?? additionalLocationPriceMonthly);
  const limit = Math.max(1, Number(entitlement?.branch_limit ?? 1));

  return {
    used: memberships.length,
    limit,
    planName: fullPlan?.name ?? fullPlanName,
    primaryPriceMonthly: primaryPrice,
    additionalPriceMonthly: additionalPrice,
    monthlyTotal: primaryPrice + Math.max(0, memberships.length - 1) * additionalPrice,
  };
}

export async function getOwnerBranchLimit(ownerUserId?: string | null) {
  if (!ownerUserId) {
    return 1;
  }

  const supabase = await createClient();
  const { data } = await supabase.from("owner_branch_entitlements").select("branch_limit").eq("owner_user_id", ownerUserId).maybeSingle();
  return Math.max(1, Number(data?.branch_limit ?? 1));
}

export async function getOwnerProductPerformance(
  memberships: UserRestaurantMembership[],
): Promise<{ topProducts: OwnerProductPerformance[]; lowProducts: OwnerProductPerformance[] }> {
  const restaurantIds = memberships.map((membership) => membership.restaurant.id);

  if (!restaurantIds.length) {
    return { topProducts: [], lowProducts: [] };
  }

  const supabase = await createClient();
  const since30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const { data: orders } = await supabase
    .from("orders")
    .select("id,restaurant_id,status,created_at")
    .in("restaurant_id", restaurantIds)
    .neq("status", "cancelled")
    .gte("created_at", since30Days.toISOString());

  const orderIds = (orders ?? []).map((order) => order.id);

  if (!orderIds.length) {
    return { topProducts: [], lowProducts: [] };
  }

  const { data: items } = await supabase.from("order_items").select("order_id,product_name,quantity,subtotal").in("order_id", orderIds);
  const branchById = new Map(memberships.map((membership) => [membership.restaurant.id, membership.restaurant.name]));
  const restaurantByOrder = new Map((orders ?? []).map((order) => [order.id, order.restaurant_id]));
  const performanceByKey = new Map<string, OwnerProductPerformance>();

  for (const item of items ?? []) {
    const restaurantId = restaurantByOrder.get(item.order_id);

    if (!restaurantId) {
      continue;
    }

    const productName = item.product_name || "Producto";
    const key = `${restaurantId}:${productName.toLowerCase()}`;
    const current = performanceByKey.get(key) ?? {
      productName,
      branchName: branchById.get(restaurantId) ?? "Sucursal",
      quantity: 0,
      revenue: 0,
    };

    current.quantity += Number(item.quantity ?? 0);
    current.revenue += Number(item.subtotal ?? 0);
    performanceByKey.set(key, current);
  }

  const performance = Array.from(performanceByKey.values()).filter((item) => item.quantity > 0);

  return {
    topProducts: [...performance].sort((left, right) => right.revenue - left.revenue || right.quantity - left.quantity).slice(0, 5),
    lowProducts: [...performance].sort((left, right) => left.quantity - right.quantity || left.revenue - right.revenue).slice(0, 5),
  };
}

export async function listOwnerResponsibles(memberships: UserRestaurantMembership[]): Promise<OwnerResponsible[]> {
  const restaurantIds = memberships.map((membership) => membership.restaurant.id);

  if (!restaurantIds.length) {
    return [];
  }

  const supabase = await createClient();
  const { data: membershipRows } = await supabase
    .from("restaurant_memberships")
    .select("restaurant_id,user_id,role")
    .in("restaurant_id", restaurantIds)
    .eq("is_active", true);
  const userIds = Array.from(new Set((membershipRows ?? []).map((membership) => membership.user_id)));

  if (!userIds.length) {
    return [];
  }

  const { data: profiles } = await supabase.from("profiles").select("id,email,full_name").in("id", userIds);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const restaurantById = new Map(memberships.map((membership) => [membership.restaurant.id, membership.restaurant.name]));

  return (membershipRows ?? []).map((membership) => {
    const profile = profileById.get(membership.user_id);

    return {
      restaurantId: membership.restaurant_id,
      restaurantName: restaurantById.get(membership.restaurant_id) ?? "Sucursal",
      userId: membership.user_id,
      role: membership.role,
      email: profile?.email ?? "Sin correo",
      fullName: profile?.full_name ?? "Responsable",
    };
  });
}
