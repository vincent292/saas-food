import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { additionalLocationPriceMonthly, fullPlanName, primaryLocationPriceMonthly } from "@/lib/billing/full-plan";
import { formatMoney } from "@/lib/utils/money";
import type { UserRestaurantMembership } from "@/lib/services/membership.service";

export type OwnerBranchSummary = {
  membership: UserRestaurantMembership;
  orders30d: number;
  paidOrders30d: number;
  ordersToday: number;
  activeOrders: number;
  revenue30d: number;
  openCashSession: boolean;
  openCashOpenedAt?: string;
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

export type OwnerBranchCapacityRequest = {
  id: string;
  sourceRestaurantId: string;
  requestedAdditional: number;
  reason?: string;
  status: "pending" | "approved" | "rejected";
  currentLimit: number;
  approvedLimit?: number;
  resolutionNotes?: string;
  createdAt: string;
  resolvedAt?: string;
};

export async function listOwnerBranchCapacityRequests(ownerUserId: string): Promise<OwnerBranchCapacityRequest[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("owner_branch_capacity_requests")
    .select("id,source_restaurant_id,requested_additional,reason,status,current_limit,approved_limit,resolution_notes,created_at,resolved_at")
    .eq("owner_user_id", ownerUserId)
    .order("created_at", { ascending: false });

  if (error) {
    return [];
  }

  return (data ?? []).map((request) => ({
    id: request.id,
    sourceRestaurantId: request.source_restaurant_id,
    requestedAdditional: request.requested_additional,
    reason: request.reason ?? undefined,
    status: request.status,
    currentLimit: request.current_limit,
    approvedLimit: request.approved_limit ?? undefined,
    resolutionNotes: request.resolution_notes ?? undefined,
    createdAt: request.created_at,
    resolvedAt: request.resolved_at ?? undefined,
  }));
}

export type OwnerProductPerformance = {
  productName: string;
  branchName: string;
  quantity: number;
  revenue: number;
};

export type OwnerDailySales = {
  date: string;
  label: string;
  orders: number;
  revenue: number;
};

export type OwnerBranchRevenueShare = {
  branchName: string;
  orders: number;
  percentage: number;
  revenue: number;
};

export type OwnerOrderChannel = {
  label: string;
  count: number;
  percentage: number;
};

export type OwnerCustomerInsight = {
  uniqueCustomers30d: number;
  repeatCustomers30d: number;
  topCustomerName: string;
  topCustomerOrders: number;
};

export type OwnerProfitabilityInsight = {
  estimatedCost30d: number;
  estimatedGrossProfit30d: number;
  estimatedMarginPercent: number;
  configuredProductSales: number;
  unconfiguredProductSales: number;
};

export type OwnerExecutiveNotice = {
  title: string;
  detail: string;
  tone: "success" | "warning" | "danger" | "info";
};

export type OwnerDashboardData = {
  capacity: OwnerBranchCapacity;
  summaries: OwnerBranchSummary[];
  performance: {
    topProducts: OwnerProductPerformance[];
    lowProducts: OwnerProductPerformance[];
  };
  analytics: {
    branchRevenueShare: OwnerBranchRevenueShare[];
    dailySales: OwnerDailySales[];
  };
  executive: {
    alerts: OwnerExecutiveNotice[];
    cash: {
      branchesWithoutRecentClose: number;
      lastClosedCashAt?: string;
      openSessions: number;
    };
    customers: OwnerCustomerInsight;
    inventory: {
      expiringLots: number;
      lowStockItems: number;
    };
    orders: {
      activeOrders: number;
      cancellationRate: number;
      cancelled30d: number;
      channels: OwnerOrderChannel[];
      total30d: number;
    };
    profitability: OwnerProfitabilityInsight;
    recommendations: OwnerExecutiveNotice[];
    sales: {
      bestDayLabel: string;
      previous30dRevenue: number;
      revenue30d: number;
      revenue7d: number;
      revenueDeltaPercent: number;
      revenueToday: number;
    };
    branches: {
      attentionBranchName: string;
      bestBranchName: string;
    };
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
  isActive: boolean;
};

export function ownerMembershipsForUser(memberships: UserRestaurantMembership[], userId: string) {
  return memberships.filter((membership) => membership.role === "restaurant_admin" && membership.restaurant.ownerUserId === userId);
}

function groupByRestaurant<T extends { restaurant_id: string }>(rows: T[]) {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const current = grouped.get(row.restaurant_id) ?? [];
    current.push(row);
    grouped.set(row.restaurant_id, current);
  }

  return grouped;
}

export async function getOwnerDashboardData(memberships: UserRestaurantMembership[]): Promise<OwnerDashboardData> {
  const [summaries, capacity, performance, dailySales] = await Promise.all([
    getOwnerBranchSummaries(memberships),
    getOwnerBranchCapacity(memberships),
    getOwnerProductPerformance(memberships),
    getOwnerDailySales(memberships),
  ]);

  const orders30d = summaries.reduce((sum, summary) => sum + summary.orders30d, 0);
  const paidOrders30d = summaries.reduce((sum, summary) => sum + summary.paidOrders30d, 0);
  const revenue30d = summaries.reduce((sum, summary) => sum + summary.revenue30d, 0);
  const activeOrders = summaries.reduce((sum, summary) => sum + summary.activeOrders, 0);
  const inventoryAlerts = summaries.reduce((sum, summary) => sum + summary.lowStockItems + summary.expiringLots, 0);
  const branchRevenueShare = summaries
    .map((summary) => ({
      branchName: summary.membership.restaurant.name,
      orders: summary.orders30d,
      percentage: revenue30d ? Math.round((summary.revenue30d / revenue30d) * 100) : 0,
      revenue: summary.revenue30d,
    }))
    .sort((left, right) => right.revenue - left.revenue);
  const executive = await getOwnerExecutiveInsights(memberships, summaries, performance, dailySales);

  return {
    analytics: {
      branchRevenueShare,
      dailySales,
    },
    capacity,
    executive,
    summaries,
    performance,
    totals: {
      orders30d,
      revenue30d,
      activeOrders,
      inventoryAlerts,
      averageTicket: paidOrders30d ? formatMoney(revenue30d / paidOrders30d) : formatMoney(0),
    },
  };
}

async function getOwnerExecutiveInsights(
  memberships: UserRestaurantMembership[],
  summaries: OwnerBranchSummary[],
  performance: { topProducts: OwnerProductPerformance[]; lowProducts: OwnerProductPerformance[] },
  dailySales: OwnerDailySales[],
): Promise<OwnerDashboardData["executive"]> {
  const restaurantIds = memberships.map((membership) => membership.restaurant.id);
  const emptyProfitability: OwnerProfitabilityInsight = {
    estimatedCost30d: 0,
    estimatedGrossProfit30d: 0,
    estimatedMarginPercent: 0,
    configuredProductSales: 0,
    unconfiguredProductSales: 0,
  };

  if (!restaurantIds.length) {
    return {
      alerts: [],
      branches: { attentionBranchName: "Sin sucursales", bestBranchName: "Sin sucursales" },
      cash: { branchesWithoutRecentClose: 0, openSessions: 0 },
      customers: { repeatCustomers30d: 0, topCustomerName: "Sin clientes", topCustomerOrders: 0, uniqueCustomers30d: 0 },
      inventory: { expiringLots: 0, lowStockItems: 0 },
      orders: { activeOrders: 0, cancellationRate: 0, cancelled30d: 0, channels: [], total30d: 0 },
      profitability: emptyProfitability,
      recommendations: [],
      sales: { bestDayLabel: "Sin datos", previous30dRevenue: 0, revenue30d: 0, revenue7d: 0, revenueDeltaPercent: 0, revenueToday: 0 },
    };
  }

  const supabase = await createClient();
  const now = new Date();
  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);
  const since7Days = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const since30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const since60Days = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);

  const { data: orders } = await supabase
    .from("orders")
    .select("id,restaurant_id,customer_name,customer_phone,customer_email,order_type,status,payment_status,total,created_at")
    .in("restaurant_id", restaurantIds)
    .gte("created_at", since60Days.toISOString());

  const orderRows = orders ?? [];
  const orders30d = orderRows.filter((order) => new Date(order.created_at) >= since30Days);
  const previous30dOrders = orderRows.filter((order) => {
    const createdAt = new Date(order.created_at);
    return createdAt >= since60Days && createdAt < since30Days;
  });
  const validOrders30d = orders30d.filter((order) => order.status !== "cancelled");
  const paidOrders30d = validOrders30d.filter((order) => order.payment_status === "paid");
  const paidOrders7d = paidOrders30d.filter((order) => new Date(order.created_at) >= since7Days);
  const paidOrdersToday = paidOrders30d.filter((order) => new Date(order.created_at) >= todayStart);
  const previousPaidOrders = previous30dOrders.filter((order) => order.status !== "cancelled" && order.payment_status === "paid");
  const revenue30d = paidOrders30d.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const previous30dRevenue = previousPaidOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0);
  const revenueDeltaPercent = previous30dRevenue ? Math.round(((revenue30d - previous30dRevenue) / previous30dRevenue) * 100) : revenue30d ? 100 : 0;
  const cancelled30d = orders30d.filter((order) => order.status === "cancelled").length;
  const activeOrders = orders30d.filter((order) => ["pending", "accepted", "preparing", "ready"].includes(order.status)).length;
  const channelLabels: Record<string, string> = { delivery: "Delivery", pickup: "Recojo", pos: "Caja/POS", table: "Mesa QR" };
  const channelCounts = validOrders30d.reduce<Map<string, number>>((map, order) => {
    map.set(order.order_type, (map.get(order.order_type) ?? 0) + 1);
    return map;
  }, new Map());
  const channels = Array.from(channelCounts.entries())
    .map(([key, count]) => ({ count, label: channelLabels[key] ?? key, percentage: validOrders30d.length ? Math.round((count / validOrders30d.length) * 100) : 0 }))
    .sort((left, right) => right.count - left.count);

  const customers = buildCustomerInsights(validOrders30d);
  const profitability = await getOwnerProfitabilityInsight(restaurantIds, paidOrders30d.map((order) => order.id), revenue30d);
  const openSessions = summaries.filter((summary) => summary.openCashSession).length;
  const staleOpenSessions = summaries.filter(
    (summary) => summary.openCashOpenedAt && Date.now() - new Date(summary.openCashOpenedAt).getTime() > 18 * 60 * 60 * 1000,
  ).length;
  const branchesWithoutRecentClose = summaries.filter((summary) => !summary.openCashSession && !summary.lastClosedCashAt).length;
  const lastClosedCashAt = summaries
    .map((summary) => summary.lastClosedCashAt)
    .filter(Boolean)
    .sort()
    .at(-1);
  const lowStockItems = summaries.reduce((sum, summary) => sum + summary.lowStockItems, 0);
  const expiringLots = summaries.reduce((sum, summary) => sum + summary.expiringLots, 0);
  const bestBranch = [...summaries].sort((left, right) => right.revenue30d - left.revenue30d)[0];
  const attentionBranch = [...summaries].sort((left, right) => left.revenue30d - right.revenue30d || right.lowStockItems + right.expiringLots - (left.lowStockItems + left.expiringLots))[0];
  const bestDay = [...dailySales].sort((left, right) => right.revenue - left.revenue)[0];
  const alerts = buildOwnerAlerts({
    activeOrders,
    cancelled30d,
    cancellationRate: orders30d.length ? Math.round((cancelled30d / orders30d.length) * 100) : 0,
    expiringLots,
    lowStockItems,
    openSessions,
    staleOpenSessions,
    topProduct: performance.topProducts[0],
  });
  const recommendations = buildOwnerRecommendations({
    attentionBranchName: attentionBranch?.membership.restaurant.name ?? "Sucursal",
    channels,
    customers,
    lowProducts: performance.lowProducts,
    profitability,
    revenueDeltaPercent,
    topProducts: performance.topProducts,
  });

  return {
    alerts,
    branches: {
      attentionBranchName: attentionBranch?.membership.restaurant.name ?? "Sin datos",
      bestBranchName: bestBranch?.membership.restaurant.name ?? "Sin datos",
    },
    cash: { branchesWithoutRecentClose, lastClosedCashAt, openSessions },
    customers,
    inventory: { expiringLots, lowStockItems },
    orders: {
      activeOrders,
      cancellationRate: orders30d.length ? Math.round((cancelled30d / orders30d.length) * 100) : 0,
      cancelled30d,
      channels,
      total30d: orders30d.length,
    },
    profitability,
    recommendations,
    sales: {
      bestDayLabel: bestDay?.label ?? "Sin datos",
      previous30dRevenue,
      revenue30d,
      revenue7d: paidOrders7d.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      revenueDeltaPercent,
      revenueToday: paidOrdersToday.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
    },
  };
}

function buildCustomerInsights(
  orders: Array<{ customer_email: string | null; customer_name: string | null; customer_phone: string | null }>,
): OwnerCustomerInsight {
  const customers = new Map<string, { name: string; orders: number }>();

  for (const order of orders) {
    const key = order.customer_phone?.trim() || order.customer_email?.trim().toLowerCase() || order.customer_name?.trim().toLowerCase();

    if (!key) {
      continue;
    }

    const current = customers.get(key) ?? { name: order.customer_name?.trim() || order.customer_phone?.trim() || "Cliente", orders: 0 };
    current.orders += 1;
    customers.set(key, current);
  }

  const customerList = Array.from(customers.values());
  const topCustomer = [...customerList].sort((left, right) => right.orders - left.orders)[0];

  return {
    repeatCustomers30d: customerList.filter((customer) => customer.orders > 1).length,
    topCustomerName: topCustomer?.name ?? "Sin clientes",
    topCustomerOrders: topCustomer?.orders ?? 0,
    uniqueCustomers30d: customerList.length,
  };
}

async function getOwnerProfitabilityInsight(restaurantIds: string[], orderIds: string[], revenue30d: number): Promise<OwnerProfitabilityInsight> {
  if (!restaurantIds.length || !orderIds.length) {
    return {
      estimatedCost30d: 0,
      estimatedGrossProfit30d: revenue30d,
      estimatedMarginPercent: revenue30d ? 100 : 0,
      configuredProductSales: 0,
      unconfiguredProductSales: 0,
    };
  }

  const supabase = await createClient();
  const [{ data: items }, { data: ingredients }, { data: options }, { data: inventoryItems }] = await Promise.all([
    supabase.from("order_items").select("product_id,option_ids,quantity,subtotal").in("order_id", orderIds),
    supabase.from("product_ingredients").select("product_id,inventory_item_id,quantity,waste_factor").in("restaurant_id", restaurantIds),
    supabase.from("product_options").select("id,inventory_item_id,inventory_quantity,inventory_waste_factor").in("restaurant_id", restaurantIds),
    supabase.from("inventory_items").select("id,unit_cost").in("restaurant_id", restaurantIds),
  ]);
  const unitCostByItem = new Map((inventoryItems ?? []).map((item) => [item.id, Number(item.unit_cost ?? 0)]));
  const ingredientCostByProduct = new Map<string, number>();
  const optionCostById = new Map<string, number>();

  for (const ingredient of ingredients ?? []) {
    const unitCost = unitCostByItem.get(ingredient.inventory_item_id) ?? 0;
    const quantity = Number(ingredient.quantity ?? 0);
    const wasteFactor = Number(ingredient.waste_factor ?? 0);
    const cost = quantity * (1 + wasteFactor / 100) * unitCost;
    ingredientCostByProduct.set(ingredient.product_id, (ingredientCostByProduct.get(ingredient.product_id) ?? 0) + cost);
  }

  for (const option of options ?? []) {
    if (!option.inventory_item_id) {
      continue;
    }
    const unitCost = unitCostByItem.get(option.inventory_item_id) ?? 0;
    const quantity = Number(option.inventory_quantity ?? 1);
    const wasteFactor = Number(option.inventory_waste_factor ?? 0);
    optionCostById.set(option.id, quantity * (1 + wasteFactor / 100) * unitCost);
  }

  let estimatedCost30d = 0;
  let configuredProductSales = 0;
  let unconfiguredProductSales = 0;

  for (const item of items ?? []) {
    const quantity = Number(item.quantity ?? 0);
    const productCost = item.product_id ? ingredientCostByProduct.get(item.product_id) : undefined;
    const optionCost = (item.option_ids ?? []).reduce((sum: number, optionId: string) => sum + (optionCostById.get(optionId) ?? 0), 0);
    const sale = Number(item.subtotal ?? 0);

    if ((productCost ?? 0) > 0 || optionCost > 0) {
      configuredProductSales += 1;
    } else {
      unconfiguredProductSales += 1;
    }

    estimatedCost30d += quantity * (productCost ?? 0) + quantity * optionCost;
    void sale;
  }

  const estimatedGrossProfit30d = Math.max(0, revenue30d - estimatedCost30d);

  return {
    estimatedCost30d,
    estimatedGrossProfit30d,
    estimatedMarginPercent: revenue30d ? Math.round((estimatedGrossProfit30d / revenue30d) * 100) : 0,
    configuredProductSales,
    unconfiguredProductSales,
  };
}

function buildOwnerAlerts({
  activeOrders,
  cancelled30d,
  cancellationRate,
  expiringLots,
  lowStockItems,
  openSessions,
  staleOpenSessions,
  topProduct,
}: {
  activeOrders: number;
  cancelled30d: number;
  cancellationRate: number;
  expiringLots: number;
  lowStockItems: number;
  openSessions: number;
  staleOpenSessions: number;
  topProduct?: OwnerProductPerformance;
}): OwnerExecutiveNotice[] {
  const alerts: OwnerExecutiveNotice[] = [];

  if (activeOrders) alerts.push({ title: "Pedidos activos", detail: `${activeOrders} pedidos necesitan seguimiento ahora.`, tone: "info" });
  if (lowStockItems) alerts.push({ title: "Inventario bajo", detail: `${lowStockItems} insumos llegaron al minimo.`, tone: "warning" });
  if (expiringLots) alerts.push({ title: "Vencimientos proximos", detail: `${expiringLots} lotes vencen pronto.`, tone: "warning" });
  if (cancelled30d) alerts.push({ title: "Cancelaciones", detail: `${cancelled30d} pedidos cancelados (${cancellationRate}%).`, tone: cancellationRate >= 10 ? "danger" : "warning" });
  if (!openSessions) alerts.push({ title: "Cajas cerradas", detail: "No hay caja abierta en este momento.", tone: "success" });
  if (staleOpenSessions) alerts.push({ title: "Cajas sin cerrar", detail: `${staleOpenSessions} caja${staleOpenSessions === 1 ? "" : "s"} lleva${staleOpenSessions === 1 ? "" : "n"} mas de 18 horas abierta${staleOpenSessions === 1 ? "" : "s"}.`, tone: "danger" });
  if (topProduct) alerts.push({ title: "Producto estrella", detail: `${topProduct.productName} lidera con ${topProduct.quantity} vendidos.`, tone: "success" });

  return alerts.slice(0, 6);
}

function buildOwnerRecommendations({
  attentionBranchName,
  channels,
  customers,
  lowProducts,
  profitability,
  revenueDeltaPercent,
  topProducts,
}: {
  attentionBranchName: string;
  channels: OwnerOrderChannel[];
  customers: OwnerCustomerInsight;
  lowProducts: OwnerProductPerformance[];
  profitability: OwnerProfitabilityInsight;
  revenueDeltaPercent: number;
  topProducts: OwnerProductPerformance[];
}): OwnerExecutiveNotice[] {
  const recommendations: OwnerExecutiveNotice[] = [];
  const mainChannel = channels[0];

  if (revenueDeltaPercent < 0) {
    recommendations.push({ title: "Recuperar ventas", detail: `Las ventas bajaron ${Math.abs(revenueDeltaPercent)}%. Revisa promo o visibilidad de productos fuertes.`, tone: "warning" });
  } else if (revenueDeltaPercent > 0) {
    recommendations.push({ title: "Reforzar lo que funciona", detail: `Ventas arriba ${revenueDeltaPercent}%. Mantén stock y personal en horarios fuertes.`, tone: "success" });
  }
  if (topProducts[0]) recommendations.push({ title: "Destacar producto lider", detail: `Pon ${topProducts[0].productName} como destacado o combo rentable.`, tone: "info" });
  if (lowProducts[0]) recommendations.push({ title: "Revisar baja rotacion", detail: `${lowProducts[0].productName} vende poco. Considera promo, foto o pausarlo.`, tone: "warning" });
  if (profitability.unconfiguredProductSales > profitability.configuredProductSales) {
    recommendations.push({ title: "Configurar costos", detail: "Faltan recetas/insumos en varios productos; el margen sera mas preciso al ligarlos a inventario.", tone: "info" });
  }
  if (mainChannel) recommendations.push({ title: "Canal principal", detail: `${mainChannel.label} concentra ${mainChannel.percentage}% de pedidos. Optimiza ese flujo primero.`, tone: "info" });
  if (customers.repeatCustomers30d > 0) recommendations.push({ title: "Premiar clientes frecuentes", detail: `${customers.repeatCustomers30d} clientes repitieron compra. Puedes crear cupon o beneficio.`, tone: "success" });
  recommendations.push({ title: "Sucursal a mirar", detail: `${attentionBranchName} necesita seguimiento por ventas o alertas operativas.`, tone: "warning" });

  return recommendations.slice(0, 8);
}

export async function getOwnerDailySales(memberships: UserRestaurantMembership[]): Promise<OwnerDailySales[]> {
  const restaurantIds = memberships.map((membership) => membership.restaurant.id);

  if (!restaurantIds.length) {
    return [];
  }

  const supabase = await createClient();
  const now = new Date();
  const firstDay = new Date(now);
  firstDay.setDate(now.getDate() - 6);
  firstDay.setHours(0, 0, 0, 0);

  const { data: orders } = await supabase
    .from("orders")
    .select("status,payment_status,total,created_at")
    .in("restaurant_id", restaurantIds)
    .neq("status", "cancelled")
    .eq("payment_status", "paid")
    .gte("created_at", firstDay.toISOString());

  const formatter = new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "short", timeZone: "America/La_Paz" });
  const keyFormatter = new Intl.DateTimeFormat("en-CA", { day: "2-digit", month: "2-digit", timeZone: "America/La_Paz", year: "numeric" });
  const dayKey = (date: Date) => {
    const parts = keyFormatter.formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value ?? "0000";
    const month = parts.find((part) => part.type === "month")?.value ?? "00";
    const day = parts.find((part) => part.type === "day")?.value ?? "00";
    return `${year}-${month}-${day}`;
  };
  const totalsByDay = new Map<string, { orders: number; revenue: number }>();

  for (const order of orders ?? []) {
    const date = new Date(order.created_at);
    const key = dayKey(date);
    const current = totalsByDay.get(key) ?? { orders: 0, revenue: 0 };
    current.orders += 1;
    current.revenue += Number(order.total ?? 0);
    totalsByDay.set(key, current);
  }

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + index);
    const key = dayKey(date);
    const totals = totalsByDay.get(key) ?? { orders: 0, revenue: 0 };

    return {
      date: key,
      label: formatter.format(date).replace(".", ""),
      orders: totals.orders,
      revenue: totals.revenue,
    };
  });
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
    supabase.from("orders").select("restaurant_id,status,payment_status,total,created_at").in("restaurant_id", restaurantIds).gte("created_at", since30Days.toISOString()),
    supabase.from("cash_sessions").select("restaurant_id,status,closed_at,opened_at").in("restaurant_id", restaurantIds).order("opened_at", { ascending: false }),
    supabase.from("inventory_items").select("restaurant_id,current_stock,min_stock,is_active").in("restaurant_id", restaurantIds).eq("is_active", true),
    supabase
      .from("inventory_lots")
      .select("restaurant_id,expires_on,remaining_quantity,is_active")
      .in("restaurant_id", restaurantIds)
      .eq("is_active", true)
      .gt("remaining_quantity", 0),
  ]);
  const ordersByRestaurant = groupByRestaurant(orders ?? []);
  const cashByRestaurant = groupByRestaurant(cashSessions ?? []);
  const inventoryByRestaurant = groupByRestaurant(inventoryItems ?? []);
  const lotsByRestaurant = groupByRestaurant(inventoryLots ?? []);

  return memberships.map((membership) => {
    const branchOrders = ordersByRestaurant.get(membership.restaurant.id) ?? [];
    const validOrders = branchOrders.filter((order) => order.status !== "cancelled");
    const paidOrders = validOrders.filter((order) => order.payment_status === "paid");
    const branchCashSessions = cashByRestaurant.get(membership.restaurant.id) ?? [];
    const latestClosedCash = branchCashSessions.find((session) => session.status === "closed" && session.closed_at);
    const openCash = branchCashSessions.find((session) => session.status === "open");
    const branchInventory = inventoryByRestaurant.get(membership.restaurant.id) ?? [];
    const branchLots = lotsByRestaurant.get(membership.restaurant.id) ?? [];

    return {
      membership,
      orders30d: validOrders.length,
      paidOrders30d: paidOrders.length,
      ordersToday: validOrders.filter((order) => new Date(order.created_at) >= todayStart).length,
      activeOrders: branchOrders.filter((order) => ["pending", "accepted", "preparing", "ready"].includes(order.status)).length,
      revenue30d: paidOrders.reduce((sum, order) => sum + Number(order.total ?? 0), 0),
      openCashSession: branchCashSessions.some((session) => session.status === "open"),
      openCashOpenedAt: openCash?.opened_at ?? undefined,
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
  const [entitlementResult, { data: plans }] = await Promise.all([
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
  if (entitlementResult.error) {
    throw new Error(`owner-entitlement-read:${entitlementResult.error.code}`);
  }
  const limit = Math.max(1, Number(entitlementResult.data?.branch_limit ?? 1));

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
  const { data, error } = await supabase.from("owner_branch_entitlements").select("branch_limit").eq("owner_user_id", ownerUserId).maybeSingle();
  if (error) {
    throw new Error(`owner-entitlement-read:${error.code}`);
  }
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
    .select("id,restaurant_id,status,payment_status,created_at")
    .in("restaurant_id", restaurantIds)
    .neq("status", "cancelled")
    .eq("payment_status", "paid")
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
    .select("restaurant_id,user_id,role,is_active")
    .in("restaurant_id", restaurantIds)
    .eq("role", "restaurant_admin");
  const userIds = Array.from(new Set((membershipRows ?? []).map((membership) => membership.user_id)));

  if (!userIds.length) {
    return [];
  }

  const { data: profiles } = await supabase.from("profiles").select("id,email,full_name").in("id", userIds);
  const profileById = new Map((profiles ?? []).map((profile) => [profile.id, profile]));
  const authUserById = await getAuthUsersById(userIds);
  const restaurantById = new Map(memberships.map((membership) => [membership.restaurant.id, membership.restaurant.name]));

  return (membershipRows ?? []).map((membership) => {
    const profile = profileById.get(membership.user_id);
    const authUser = authUserById.get(membership.user_id);
    const metadataName = typeof authUser?.user_metadata?.full_name === "string" ? authUser.user_metadata.full_name : "";

    return {
      restaurantId: membership.restaurant_id,
      restaurantName: restaurantById.get(membership.restaurant_id) ?? "Sucursal",
      userId: membership.user_id,
      role: membership.role,
      email: profile?.email || authUser?.email || "Sin correo",
      fullName: profile?.full_name || metadataName || authUser?.email || "Responsable",
      isActive: membership.is_active,
    };
  });
}

async function getAuthUsersById(userIds: string[]) {
  const admin = createAdminClient();
  const users = new Map<string, { email?: string; user_metadata?: Record<string, unknown> }>();

  if (!admin) {
    return users;
  }

  await Promise.all(
    userIds.map(async (userId) => {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data.user) {
        users.set(userId, {
          email: data.user.email,
          user_metadata: data.user.user_metadata,
        });
      }
    }),
  );

  return users;
}
