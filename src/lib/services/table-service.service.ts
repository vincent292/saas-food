import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { businessTypeSupportsTableQr } from "@/lib/restaurant-directory-options";
import { bankOrderPaymentService } from "./bank-qr.service";
import { announcementService } from "./announcement.service";
import type { PosSession } from "@/app/api/mobile/pos/_shared";

export async function getPublicTable(slug: string, code: string) {
  const db = createAdminClient();
  if (!db) throw new Error("table-unavailable");
  const { data: restaurant } = await db.from("restaurants").select("id,name,slug,business_type").eq("slug", slug).eq("status", "active").is("deleted_at", null).maybeSingle();
  if (!restaurant || !businessTypeSupportsTableQr(restaurant.business_type)) throw new Error("table-unavailable");
  const [{ data: table }, { data: settings }, { data: cash }] = await Promise.all([
    db.from("tables").select("id,name,code").eq("restaurant_id", restaurant.id).eq("code", code).eq("is_active", true).maybeSingle(),
    db.from("restaurant_settings").select("table_orders_enabled,currency").eq("restaurant_id", restaurant.id).maybeSingle(),
    db.from("cash_sessions").select("id").eq("restaurant_id", restaurant.id).eq("status", "open").limit(1).maybeSingle(),
  ]);
  if (!table || !settings?.table_orders_enabled) throw new Error("table-unavailable");
  const closed = await announcementService.hasActiveClosure(restaurant.id);
  return { restaurant: { id: restaurant.id, name: restaurant.name, slug: restaurant.slug }, table,
    bankQrAvailable: await bankOrderPaymentService.availableForRestaurant(restaurant.id, settings.currency), callsAvailable: Boolean(cash) && !closed };
}

export async function tableServiceStaffView(auth: PosSession, restaurantId: string) {
  const restaurant = auth.restaurants.find(row => row.id === restaurantId);
  if (!restaurant) throw new Error("table-service-forbidden");
  const support = await auth.admin.from("support_impersonation_sessions").select("id").eq("actor_user_id", auth.profile.id).eq("status", "active").gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
  if (support.error || support.data) throw new Error("table-service-forbidden");
  let allowed: string[] | null = null;
  if (restaurant.role === "waiter") {
    const [shift, assignments] = await Promise.all([
      auth.admin.from("admin_audit_logs").select("action").eq("actor_user_id", auth.profile.id).eq("restaurant_id", restaurantId).in("action", ["waiter_shift_opened", "waiter_shift_closed"]).order("created_at", { ascending: false }).order("id", { ascending: false }).limit(1).maybeSingle(),
      auth.admin.from("waiter_table_assignments").select("table_id,waiter_user_id").eq("restaurant_id", restaurantId),
    ]);
    if (shift.error || assignments.error) throw new Error("table-service-unavailable");
    if (shift.data?.action !== "waiter_shift_opened") return { calls: [], reservations: [] };
    if (assignments.data?.length) allowed = assignments.data.filter(row => row.waiter_user_id === auth.profile.id).map(row => row.table_id);
  }
  let calls = auth.admin.from("table_service_calls").select("id,table_id,assigned_waiter_id,status,created_at").eq("restaurant_id", restaurantId).eq("status", "pending").gt("created_at", new Date(Date.now() - 15 * 60000).toISOString()).order("created_at");
  if (restaurant.role === "waiter") calls = calls.eq("assigned_waiter_id", auth.profile.id);
  let drafts = auth.admin.from("orders").select("id,table_id,order_number,total,created_at,payment_status").eq("restaurant_id", restaurantId).eq("order_type", "table").eq("bank_checkout_hold", true).eq("status", "pending").gte("created_at", new Date(Date.now() - 86400000).toISOString()).order("created_at", { ascending: false }).limit(100);
  if (allowed) drafts = drafts.in("table_id", allowed);
  const [notifications, reservations] = await Promise.all([calls, drafts]);
  if (notifications.error || reservations.error) throw new Error("table-service-unavailable");
  const tables = await auth.admin.from("tables").select("id,name").eq("restaurant_id", restaurantId);
  if (tables.error) throw new Error("table-service-unavailable");
  const names = new Map(tables.data.map(row => [row.id, row.name]));
  const draftIds = (reservations.data ?? []).map(row => row.id);
  // Only load lines from the already-authorized, branch-scoped draft IDs.
  const lines = draftIds.length ? await auth.admin.from("order_items").select("order_id,product_name,quantity,subtotal").in("order_id", draftIds) : { data: [], error: null };
  if (lines.error) throw new Error("table-service-unavailable");
  return {
    calls: (notifications.data ?? []).map(row => ({ id: row.id, tableId: row.table_id, tableName: names.get(row.table_id) ?? "Mesa", status: row.status, createdAt: row.created_at })),
    reservations: (reservations.data ?? []).map(row => ({ id: row.id, tableId: row.table_id, tableName: names.get(row.table_id ?? "") ?? "Mesa", orderNumber: row.order_number, total: Number(row.total), createdAt: row.created_at, paymentStatus: row.payment_status,
      items: (lines.data ?? []).filter(item => item.order_id === row.id).map(item => ({ name: item.product_name, quantity: item.quantity, subtotal: Number(item.subtotal) })) })),
  };
}
