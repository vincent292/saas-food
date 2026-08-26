import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import type { UserRestaurantMembership } from "@/lib/services/membership.service";
import type { PanelNotification } from "@/types/notification.types";

type OrderNotificationRow = {
  id: string;
  order_number: string;
  order_type: "table" | "delivery" | "pickup" | "pos";
  order_origin: "pos_counter" | "table_qr" | "web_checkout" | "phone_whatsapp" | "external_platform";
  total: number;
  created_at: string;
};

type CancellationReviewNotificationRow = {
  id: string;
  restaurant_id: string;
  order_number: string;
  total: number;
  owner_review_status: "pending" | "approved" | "observed";
  owner_reviewed_at: string | null;
  cancelled_at: string;
  cash_session_id: string | null;
  cash_movement_id: string | null;
  payment_status_at_cancellation: "pending" | "paid" | "cancelled" | "refunded";
};

type CashSessionNotificationRow = {
  id: string;
  restaurant_id: string;
  status: "open" | "closed";
  opened_at: string;
  closed_at: string | null;
  difference_amount: number | null;
};

function startOfBusinessDayIso() {
  const now = new Date();
  const date = new Date(now);
  date.setHours(4, 0, 0, 0);
  if (now < date) {
    date.setDate(date.getDate() - 1);
  }
  return date.toISOString();
}

function recentIso(hours: number) {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function money(value: number) {
  return `Bs ${Number(value || 0).toFixed(2)}`;
}

function orderTypeLabel(type: OrderNotificationRow["order_type"], origin?: OrderNotificationRow["order_origin"]) {
  if (origin === "phone_whatsapp") {
    return type === "pickup" ? "WhatsApp recojo" : "WhatsApp delivery";
  }

  if (type === "delivery") return "delivery";
  if (type === "pickup") return "recojo";
  if (type === "table") return "mesa";
  return "POS";
}

function restaurantNameById(memberships: UserRestaurantMembership[]) {
  return new Map(memberships.map((membership) => [membership.restaurant.id, membership.restaurant.name]));
}

export const panelNotificationsService = {
  async listForRestaurant(restaurantId: string): Promise<PanelNotification[]> {
    if (!hasSupabaseEnv()) return [];

    const supabase = await createClient();
    const today = startOfBusinessDayIso();
    const recent = recentIso(36);
    const [{ data: pendingOrders }, { data: pendingReviews }, { data: reviewedCancellations }, { data: recentCashSessions }] = await Promise.all([
      supabase
        .from("orders")
        .select("id,order_number,order_type,order_origin,total,created_at")
        .eq("restaurant_id", restaurantId)
        .gte("created_at", today)
        .eq("status", "pending")
        .in("order_type", ["table", "delivery", "pickup"])
        .order("created_at", { ascending: false })
        .limit(6),
      supabase
        .from("order_cancellation_reviews")
        .select("id,restaurant_id,order_number,total,owner_review_status,owner_reviewed_at,cancelled_at,cash_session_id,cash_movement_id,payment_status_at_cancellation")
        .eq("restaurant_id", restaurantId)
        .eq("owner_review_status", "pending")
        .or("payment_status_at_cancellation.eq.paid,cash_session_id.not.is.null")
        .order("cancelled_at", { ascending: false })
        .limit(5),
      supabase
        .from("order_cancellation_reviews")
        .select("id,restaurant_id,order_number,total,owner_review_status,owner_reviewed_at,cancelled_at,cash_session_id,cash_movement_id,payment_status_at_cancellation")
        .eq("restaurant_id", restaurantId)
        .in("owner_review_status", ["approved", "observed"])
        .gte("owner_reviewed_at", recent)
        .order("owner_reviewed_at", { ascending: false })
        .limit(5),
      supabase
        .from("cash_sessions")
        .select("id,restaurant_id,status,opened_at,closed_at,difference_amount")
        .eq("restaurant_id", restaurantId)
        .gte("opened_at", today)
        .order("opened_at", { ascending: false })
        .limit(4),
    ]);

    const notifications: PanelNotification[] = [];

    for (const order of (pendingOrders ?? []) as OrderNotificationRow[]) {
      notifications.push({
        id: `order:${order.id}:${order.created_at}`,
        title: `Pedido ${order.order_number} pendiente`,
        description: `${orderTypeLabel(order.order_type, order.order_origin)} por ${money(Number(order.total))}. Requiere aprobacion.`,
        href: `/admin/restaurantes/${restaurantId}/pedidos?tab=nuevos`,
        createdAt: order.created_at,
        tone: "danger",
      });
    }

    for (const review of (pendingReviews ?? []) as CancellationReviewNotificationRow[]) {
      notifications.push({
        id: `review:pending:${review.id}:${review.cancelled_at}`,
        title: `Anulacion ${review.order_number} pendiente`,
        description: `Afecta caja por ${money(Number(review.total))}. Esperando revision del dueno.`,
        href: `/admin/restaurantes/${restaurantId}/caja?tab=cierre`,
        createdAt: review.cancelled_at,
        tone: "warning",
      });
    }

    for (const review of (reviewedCancellations ?? []) as CancellationReviewNotificationRow[]) {
      const approved = review.owner_review_status === "approved";
      notifications.push({
        id: `review:${review.owner_review_status}:${review.id}:${review.owner_reviewed_at ?? review.cancelled_at}`,
        title: `${approved ? "Aprobada" : "Observada"} anulacion ${review.order_number}`,
        description: approved
          ? `El dueno aprobo el cuadre por ${money(Number(review.total))}.`
          : `El dueno observo esta anulacion. Revisa el cierre de caja.`,
        href: `/admin/restaurantes/${restaurantId}/caja?tab=cierre`,
        createdAt: review.owner_reviewed_at ?? review.cancelled_at,
        tone: approved ? "success" : "danger",
      });
    }

    for (const session of (recentCashSessions ?? []) as CashSessionNotificationRow[]) {
      notifications.push({
        id: `cash:${session.status}:${session.id}:${session.closed_at ?? session.opened_at}`,
        title: session.status === "open" ? "Caja abierta" : "Caja cerrada",
        description: session.status === "open"
          ? "Hay una caja activa para registrar ventas y movimientos."
          : `Cierre registrado${session.difference_amount ? ` con diferencia de ${money(Number(session.difference_amount))}` : ""}.`,
        href: `/admin/restaurantes/${restaurantId}/caja?tab=cierre`,
        createdAt: session.closed_at ?? session.opened_at,
        tone: session.status === "open" ? "info" : Number(session.difference_amount ?? 0) === 0 ? "success" : "warning",
      });
    }

    return notifications.sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 20);
  },

  async listForOwner(ownerMemberships: UserRestaurantMembership[]): Promise<PanelNotification[]> {
    if (!hasSupabaseEnv()) return [];

    const restaurantIds = ownerMemberships.map((membership) => membership.restaurant.id);
    if (!restaurantIds.length) return [];

    const namesById = restaurantNameById(ownerMemberships);
    const supabase = await createClient();
    const recent = recentIso(36);
    const [{ data: pendingReviews }, { data: recentCashSessions }] = await Promise.all([
      supabase
        .from("order_cancellation_reviews")
        .select("id,restaurant_id,order_number,total,owner_review_status,owner_reviewed_at,cancelled_at,cash_session_id,cash_movement_id,payment_status_at_cancellation")
        .in("restaurant_id", restaurantIds)
        .eq("owner_review_status", "pending")
        .order("cancelled_at", { ascending: false })
        .limit(12),
      supabase
        .from("cash_sessions")
        .select("id,restaurant_id,status,opened_at,closed_at,difference_amount")
        .in("restaurant_id", restaurantIds)
        .eq("status", "closed")
        .gte("closed_at", recent)
        .order("closed_at", { ascending: false })
        .limit(10),
    ]);

    const notifications: PanelNotification[] = [];

    for (const review of (pendingReviews ?? []) as CancellationReviewNotificationRow[]) {
      const restaurantName = namesById.get(review.restaurant_id) ?? "Sucursal";
      notifications.push({
        id: `owner-review:pending:${review.id}:${review.cancelled_at}`,
        title: `Anulacion pendiente en ${restaurantName}`,
        description: `Pedido ${review.order_number} por ${money(Number(review.total))}. Necesita tu aprobacion u observacion.`,
        href: "/dueno/anulaciones",
        createdAt: review.cancelled_at,
        tone: "warning",
      });
    }

    for (const session of (recentCashSessions ?? []) as CashSessionNotificationRow[]) {
      const restaurantName = namesById.get(session.restaurant_id) ?? "Sucursal";
      notifications.push({
        id: `owner-cash:closed:${session.id}:${session.closed_at ?? session.opened_at}`,
        title: `Caja cerrada en ${restaurantName}`,
        description: Number(session.difference_amount ?? 0) === 0
          ? "El cierre no reporta diferencia."
          : `Revisa diferencia de ${money(Number(session.difference_amount))}.`,
        href: `/admin/restaurantes/${session.restaurant_id}/caja?tab=cierre`,
        createdAt: session.closed_at ?? session.opened_at,
        tone: Number(session.difference_amount ?? 0) === 0 ? "success" : "warning",
      });
    }

    return notifications.sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 20);
  },
};
