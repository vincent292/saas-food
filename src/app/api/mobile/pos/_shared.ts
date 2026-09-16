import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Database } from "@/types/database.types";

export class PosError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS", "Cache-Control": "no-store" };
export function json(data: unknown, status = 200) { return NextResponse.json(data, { status, headers: cors }); }
export function failure(error: unknown) {
  if (error instanceof PosError) return json({ error: error.message }, error.status);
  console.error("mobile-pos-failed", error);
  return json({ error: "No se pudo completar la operacion. Intenta nuevamente." }, 500);
}
export function checked<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new PosError(result.error.message);
  return result.data;
}
export async function allRows<T extends { id: string }>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>): Promise<T[]> {
  const rows = new Map<string, T>();
  for (let offset = 0; ; offset += 500) {
    const batch = checked(await page(offset, offset + 499)) ?? [];
    for (const row of batch) rows.set(row.id, row);
    if (batch.length < 500) return [...rows.values()];
  }
}
export async function session(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  if (!token) throw new PosError("Inicia sesion para continuar.", 401);
  const admin = createAdminClient();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!admin || !url || !key) throw new PosError("Servicio no configurado.", 503);
  const client = createClient<Database>(url, key, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) throw new PosError("La sesion ha vencido.", 401);
  if (data.user.user_metadata.must_change_password === true) throw new PosError("Actualiza tu contrasena para continuar.", 403);
  const profile = checked(await client.from("profiles").select("id,email,full_name,global_role").eq("id", data.user.id).maybeSingle());
  if (!profile) throw new PosError("Esta cuenta no tiene acceso al POS.", 403);
  const memberships = checked(await client.from("restaurant_memberships").select("restaurant_id,role").eq("user_id", data.user.id).eq("is_active", true)) ?? [];
  let query = client.from("restaurants").select("id,name,slug,business_type").eq("status", "active").is("deleted_at", null).order("name");
  if (profile.global_role !== "superadmin") query = query.in("id", memberships.map((m) => m.restaurant_id));
  const restaurants = (checked(await query) ?? []).flatMap((restaurant) => {
    const roles = memberships.filter((m) => m.restaurant_id === restaurant.id).map((m) => m.role);
    const role = profile.global_role === "superadmin" ? "superadmin" : (["restaurant_admin", "cashier", "waiter"] as const).find((r) => roles.includes(r));
    return role ? [{ ...restaurant, role, canManage: role !== "waiter" }] : [];
  });
  return { client, admin, profile, restaurants };
}
export type PosSession = Awaited<ReturnType<typeof session>>;
export function restaurantAccess(auth: PosSession, id: string, manager = false) {
  const restaurant = auth.restaurants.find((r) => r.id === id);
  if (!restaurant || (manager && !restaurant.canManage)) throw new PosError("No tienes permiso para esta operacion.", 403);
  return restaurant;
}
