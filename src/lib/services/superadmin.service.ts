import { cashService } from "@/lib/services/cash.service";
import { inventoryService } from "@/lib/services/inventory.service";
import { membershipService } from "@/lib/services/membership.service";
import { orderService } from "@/lib/services/order.service";
import { restaurantService } from "@/lib/services/restaurant.service";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { Restaurant } from "@/types/restaurant.types";
import type {
  AdminAuditLog,
  PlatformIncident,
  RestaurantAccessSession,
  RestaurantOperationSummary,
  SuperAdminDashboardSummary,
  SuperAdminReports,
  SupportTicket,
  SupportTicketAttachment,
} from "@/types/superadmin.types";

type OrderStatsRow = {
  restaurant_id: string;
  status: string;
  payment_status: string;
  payment_method: string;
  total: number;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name: string | null;
  email: string | null;
};

type SupportAttachmentRow = {
  id: string;
  ticket_id: string;
  restaurant_id: string | null;
  file_url: string;
  file_name: string;
  file_size: number;
  uploaded_by: string | null;
  created_at: string;
};

function startOfTodayIso() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function daysAgoIso(days: number) {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString();
}

function emptyDashboard(): SuperAdminDashboardSummary {
  return {
    restaurantCount: 0,
    activeRestaurantCount: 0,
    suspendedRestaurantCount: 0,
    archivedRestaurantCount: 0,
    todayOrders: 0,
    todayRevenue: 0,
    openSupportTickets: 0,
    openIncidents: 0,
    activeAccessSessions: 0,
    lowStockRestaurants: 0,
    topRestaurants: [],
    recentAuditLogs: [],
    urgentTickets: [],
    activeIncidents: [],
  };
}

function restaurantNameMap(restaurants: Restaurant[]) {
  return new Map(restaurants.map((restaurant) => [restaurant.id, restaurant.name]));
}

function mapTicket(row: {
  id: string;
  restaurant_id: string | null;
  restaurant_name_snapshot: string | null;
  title: string;
  description: string | null;
  category: SupportTicket["category"];
  priority: SupportTicket["priority"];
  status: SupportTicket["status"];
  created_by: string | null;
  created_at: string;
  updated_at: string;
  resolved_at: string | null;
}, names: Map<string, string>, profiles: Map<string, ProfileRow>, attachments: Map<string, SupportTicketAttachment[]>): SupportTicket {
  const createdByProfile = row.created_by ? profiles.get(row.created_by) : undefined;

  return {
    id: row.id,
    restaurantId: row.restaurant_id ?? undefined,
    restaurantName: row.restaurant_id ? names.get(row.restaurant_id) ?? row.restaurant_name_snapshot ?? "Restaurante eliminado" : "Plataforma",
    title: row.title,
    description: row.description ?? "",
    category: row.category,
    priority: row.priority,
    status: row.status,
    createdBy: row.created_by ?? undefined,
    createdByName: createdByProfile?.full_name ?? createdByProfile?.email ?? undefined,
    createdByEmail: createdByProfile?.email ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resolvedAt: row.resolved_at ?? undefined,
    attachments: attachments.get(row.id) ?? [],
  };
}

function mapSupportAttachment(row: SupportAttachmentRow): SupportTicketAttachment {
  return {
    id: row.id,
    ticketId: row.ticket_id,
    restaurantId: row.restaurant_id ?? undefined,
    fileUrl: row.file_url,
    fileName: row.file_name,
    fileSize: Number(row.file_size),
    uploadedBy: row.uploaded_by ?? undefined,
    createdAt: row.created_at,
  };
}

function mapIncident(row: {
  id: string;
  affected_restaurant_id: string | null;
  affected_restaurant_snapshot: string | null;
  title: string;
  description: string | null;
  impact_area: PlatformIncident["impactArea"];
  severity: PlatformIncident["severity"];
  status: PlatformIncident["status"];
  started_at: string;
  resolved_at: string | null;
  postmortem: string | null;
}, names: Map<string, string>): PlatformIncident {
  return {
    id: row.id,
    affectedRestaurantId: row.affected_restaurant_id ?? undefined,
    affectedRestaurantName: row.affected_restaurant_id ? names.get(row.affected_restaurant_id) ?? row.affected_restaurant_snapshot ?? "Restaurante eliminado" : "Plataforma",
    title: row.title,
    description: row.description ?? "",
    impactArea: row.impact_area,
    severity: row.severity,
    status: row.status,
    startedAt: row.started_at,
    resolvedAt: row.resolved_at ?? undefined,
    postmortem: row.postmortem ?? "",
  };
}

function mapAuditLog(row: {
  id: string;
  actor_email: string | null;
  restaurant_id: string | null;
  restaurant_name_snapshot: string | null;
  action: string;
  entity_type: string;
  severity: AdminAuditLog["severity"];
  ip_address: string | null;
  created_at: string;
}, names: Map<string, string>): AdminAuditLog {
  return {
    id: row.id,
    actorEmail: row.actor_email ?? "Sistema",
    restaurantId: row.restaurant_id ?? undefined,
    restaurantName: row.restaurant_id ? names.get(row.restaurant_id) ?? row.restaurant_name_snapshot ?? "Restaurante eliminado" : "Plataforma",
    action: row.action,
    entityType: row.entity_type,
    severity: row.severity,
    ipAddress: row.ip_address ?? "",
    createdAt: row.created_at,
  };
}

async function getProfiles(ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
  if (!uniqueIds.length) {
    return new Map<string, ProfileRow>();
  }

  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id,full_name,email").in("id", uniqueIds);
  return new Map((data ?? []).map((profile) => [profile.id, profile as ProfileRow]));
}

async function getSupportTicketAttachments(ticketIds: string[]) {
  const uniqueTicketIds = Array.from(new Set(ticketIds.filter(Boolean)));
  if (!uniqueTicketIds.length) {
    return new Map<string, SupportTicketAttachment[]>();
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("support_ticket_attachments")
    .select("*")
    .in("ticket_id", uniqueTicketIds)
    .order("created_at", { ascending: true });

  if (error || !data?.length) {
    return new Map<string, SupportTicketAttachment[]>();
  }

  const grouped = new Map<string, SupportTicketAttachment[]>();

  for (const row of data as SupportAttachmentRow[]) {
    const current = grouped.get(row.ticket_id) ?? [];
    current.push(mapSupportAttachment(row));
    grouped.set(row.ticket_id, current);
  }

  return grouped;
}

async function orderStatsSince(iso: string) {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select("restaurant_id,status,payment_status,payment_method,total,created_at")
    .gte("created_at", iso);

  if (error || !data?.length) {
    return [];
  }

  return data as OrderStatsRow[];
}

export const superadminService = {
  async listRestaurantOperations(): Promise<RestaurantOperationSummary[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const [restaurants, orders30d, accessSessions] = await Promise.all([
      restaurantService.listRestaurants(),
      orderStatsSince(daysAgoIso(30)),
      this.listAccessSessions("active"),
    ]);

    return restaurants.map((restaurant) => {
      const restaurantOrders = orders30d.filter((order) => order.restaurant_id === restaurant.id);
      const paidOrders = restaurantOrders.filter((order) => order.payment_status === "paid");
      const lastOrder = restaurantOrders.sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

      return {
        id: restaurant.id,
        name: restaurant.name,
        slug: restaurant.slug,
        status: restaurant.status,
        ownerEmail: restaurant.ownerEmail ?? "",
        city: restaurant.city,
        planKey: restaurant.planKey,
        activeModules: restaurant.activeModules?.length ?? 0,
        orders30d: restaurantOrders.length,
        revenue30d: paidOrders.reduce((sum, order) => sum + Number(order.total), 0),
        lastOrderAt: lastOrder?.created_at,
        activeSessions: accessSessions.filter((session) => session.restaurantId === restaurant.id).length,
      };
    });
  },

  async getDashboardSummary(): Promise<SuperAdminDashboardSummary> {
    if (!hasSupabaseEnv()) {
      return emptyDashboard();
    }

    const [restaurants, deletedRestaurants, todayOrders, operations, tickets, incidents, auditLogs, activeSessions, inventoryItems] = await Promise.all([
      restaurantService.listRestaurants(),
      restaurantService.listDeletedRestaurants(),
      orderStatsSince(startOfTodayIso()),
      this.listRestaurantOperations(),
      this.listSupportTickets(),
      this.listIncidents(),
      this.listAuditLogs(8),
      this.listAccessSessions("active"),
      this.listLowStockRestaurantIds(),
    ]);

    const openTicketStatuses = new Set(["open", "in_progress", "waiting_customer"]);
    const openIncidentStatuses = new Set(["investigating", "identified", "monitoring"]);
    const topRestaurants = [...operations].sort((a, b) => b.orders30d - a.orders30d).slice(0, 5);

    return {
      restaurantCount: restaurants.length,
      activeRestaurantCount: restaurants.filter((restaurant) => restaurant.status === "active").length,
      suspendedRestaurantCount: restaurants.filter((restaurant) => restaurant.status === "suspended").length,
      archivedRestaurantCount: deletedRestaurants.length,
      todayOrders: todayOrders.length,
      todayRevenue: todayOrders.filter((order) => order.payment_status === "paid").reduce((sum, order) => sum + Number(order.total), 0),
      openSupportTickets: tickets.filter((ticket) => openTicketStatuses.has(ticket.status)).length,
      openIncidents: incidents.filter((incident) => openIncidentStatuses.has(incident.status)).length,
      activeAccessSessions: activeSessions.length,
      lowStockRestaurants: inventoryItems.length,
      topRestaurants,
      recentAuditLogs: auditLogs,
      urgentTickets: tickets.filter((ticket) => ticket.priority === "urgent" && openTicketStatuses.has(ticket.status)).slice(0, 4),
      activeIncidents: incidents.filter((incident) => openIncidentStatuses.has(incident.status)).slice(0, 4),
    };
  },

  async listSupportTickets(limit = 80, restaurantId?: string): Promise<SupportTicket[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const [restaurants, supabase] = await Promise.all([restaurantService.listRestaurants(), createClient()]);
    const names = restaurantNameMap(restaurants);
    let query = supabase.from("support_tickets").select("*").order("created_at", { ascending: false }).limit(limit);

    if (restaurantId) {
      query = query.eq("restaurant_id", restaurantId);
    }

    const { data, error } = await query;

    if (error || !data?.length) {
      return [];
    }

    const [profiles, attachments] = await Promise.all([
      getProfiles(data.map((ticket) => ticket.created_by ?? "")),
      getSupportTicketAttachments(data.map((ticket) => ticket.id)),
    ]);

    return data.map((ticket) => mapTicket(ticket, names, profiles, attachments));
  },

  async listIncidents(limit = 80): Promise<PlatformIncident[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const [restaurants, supabase] = await Promise.all([restaurantService.listRestaurants(), createClient()]);
    const names = restaurantNameMap(restaurants);
    const { data, error } = await supabase
      .from("platform_incidents")
      .select("*")
      .order("started_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      return [];
    }

    return data.map((incident) => mapIncident(incident, names));
  },

  async listAuditLogs(limit = 80): Promise<AdminAuditLog[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const [restaurants, supabase] = await Promise.all([restaurantService.listRestaurants(), createClient()]);
    const names = restaurantNameMap(restaurants);
    const { data, error } = await supabase
      .from("admin_audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data?.length) {
      return [];
    }

    return data.map((log) => mapAuditLog(log, names));
  },

  async listAccessSessions(status?: RestaurantAccessSession["status"]): Promise<RestaurantAccessSession[]> {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    await supabase.rpc("expire_stale_restaurant_access_sessions");

    let query = supabase.from("restaurant_access_sessions").select("*").order("last_seen_at", { ascending: false }).limit(80);
    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;

    if (error || !data?.length) {
      return [];
    }

    const [restaurants, profiles] = await Promise.all([
      restaurantService.listRestaurants(),
      getProfiles(data.map((session) => session.user_id)),
    ]);
    const names = restaurantNameMap(restaurants);

    return data.map((session) => {
      const profile = profiles.get(session.user_id);
      return {
        id: session.id,
        restaurantId: session.restaurant_id,
        restaurantName: names.get(session.restaurant_id) ?? "Restaurante eliminado",
        userId: session.user_id,
        userEmail: profile?.email ?? "",
        userName: profile?.full_name ?? profile?.email ?? "Usuario",
        role: session.role,
        ipAddress: session.ip_address ?? "",
        userAgent: session.user_agent ?? "",
        status: session.status,
        openedAt: session.opened_at,
        lastSeenAt: session.last_seen_at,
        expiresAt: session.expires_at,
        releasedAt: session.released_at ?? undefined,
        releaseReason: session.release_reason ?? undefined,
      };
    });
  },

  async listLowStockRestaurantIds() {
    if (!hasSupabaseEnv()) {
      return [];
    }

    const supabase = await createClient();
    const { data, error } = await supabase.from("inventory_items").select("restaurant_id,current_stock,min_stock").eq("is_active", true);

    if (error || !data?.length) {
      return [];
    }

    return Array.from(new Set(data.filter((item) => Number(item.current_stock) <= Number(item.min_stock)).map((item) => item.restaurant_id)));
  },

  async getReports(): Promise<SuperAdminReports> {
    if (!hasSupabaseEnv()) {
      return {
        totalOrders: 0,
        paidOrders: 0,
        cancelledOrders: 0,
        totalRevenue: 0,
        averageTicket: 0,
        restaurantsWithOrders: [],
        orderStatusCounts: {},
        paymentMethodRevenue: {},
        moduleUsage: {},
      };
    }

    const [orders, operations, restaurants] = await Promise.all([
      orderStatsSince(daysAgoIso(30)),
      this.listRestaurantOperations(),
      restaurantService.listRestaurants(),
    ]);
    const paidOrders = orders.filter((order) => order.payment_status === "paid");
    const totalRevenue = paidOrders.reduce((sum, order) => sum + Number(order.total), 0);
    const orderStatusCounts = orders.reduce<Record<string, number>>((acc, order) => {
      acc[order.status] = (acc[order.status] ?? 0) + 1;
      return acc;
    }, {});
    const paymentMethodRevenue = paidOrders.reduce<Record<string, number>>((acc, order) => {
      acc[order.payment_method] = (acc[order.payment_method] ?? 0) + Number(order.total);
      return acc;
    }, {});
    const moduleUsage = restaurants.reduce<Record<string, number>>((acc, restaurant) => {
      for (const moduleKey of restaurant.activeModules ?? []) {
        acc[moduleKey] = (acc[moduleKey] ?? 0) + 1;
      }
      return acc;
    }, {});

    return {
      totalOrders: orders.length,
      paidOrders: paidOrders.length,
      cancelledOrders: orders.filter((order) => order.status === "cancelled").length,
      totalRevenue,
      averageTicket: paidOrders.length ? totalRevenue / paidOrders.length : 0,
      restaurantsWithOrders: [...operations].sort((a, b) => b.orders30d - a.orders30d),
      orderStatusCounts,
      paymentMethodRevenue,
      moduleUsage,
    };
  },

  async getRestaurantControl(restaurantId: string) {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const restaurant = await restaurantService.getById(restaurantId);
    if (!restaurant) {
      return null;
    }

    const [orders, cashReports, lowStock, tickets, incidents, accessSessions, memberships] = await Promise.all([
      orderService.listByRestaurant(restaurant.id),
      cashService.listSessionReports(restaurant.id, 5),
      inventoryService.listLowStock(restaurant.id),
      this.listSupportTickets(100, restaurant.id),
      this.listIncidents(100),
      this.listAccessSessions("active"),
      membershipService.listByRestaurant(restaurant.id),
    ]);

    return {
      restaurant,
      orders: orders.slice(0, 8),
      cashReports,
      lowStock,
      tickets: tickets.slice(0, 8),
      incidents: incidents.filter((incident) => incident.affectedRestaurantId === restaurant.id).slice(0, 8),
      accessSessions: accessSessions.filter((session) => session.restaurantId === restaurant.id),
      memberships,
    };
  },
};
