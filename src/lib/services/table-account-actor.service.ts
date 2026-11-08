import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database.types";
import { tableOrderSource } from "@/lib/table-account";

type Row = { id: string; order_origin?: string | null; customer_name?: string | null; notes?: string | null };

/** Display only: waiter routing uses trusted audit records, never order notes. */
export async function tableAccountActors(db: SupabaseClient<Database>, restaurantId: string, orders: Row[]) {
  const userId = (row: Row) => row.order_origin === "pos_counter" ? row.notes?.match(/(?:^|\|)\s*Usuario:\s*([a-f\d-]{36})(?:\s*\||\s*$)/i)?.[1] : undefined;
  const ids = [...new Set(orders.map(userId).filter((id): id is string => Boolean(id)))];
  const members = ids.length ? await db.from("restaurant_memberships").select("user_id,role").eq("restaurant_id", restaurantId).in("user_id", ids) : { data: [], error: null };
  if (members.error) throw members.error;
  const authorizedIds = [...new Set((members.data ?? []).map(row => row.user_id))];
  const profiles = authorizedIds.length ? await db.from("profiles").select("id,full_name").in("id", authorizedIds) : { data: [], error: null };
  if (profiles.error) throw profiles.error;
  return new Map(orders.map(order => {
    const id = userId(order), member = members.data?.find(row => row.user_id === id);
    const profile = profiles.data?.find(row => row.id === id);
    const source = member && profile ? `${member.role === "waiter" ? "Mesero" : member.role === "cashier" ? "Caja" : "Administrador"} · ${profile.full_name || "Personal"}`
      : tableOrderSource({ orderOrigin: order.order_origin ?? undefined, customerName: order.customer_name, notes: order.notes });
    return [order.id, source];
  }));
}
