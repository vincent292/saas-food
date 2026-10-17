import { after, NextResponse } from "next/server";
import { z } from "zod";
import { getPublicTable } from "@/lib/services/table-service.service";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { sendTableServicePush } from "@/lib/services/mobile-push.service";
import { readSmallJson } from "@/lib/security/read-small-json";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type,x-table-call-token", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" };
export function OPTIONS() { return new Response(null, { status: 204, headers }); }
const schema = z.object({ restaurantSlug: z.string().regex(/^[a-z0-9-]{1,150}$/), tableCode: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/), requestId: z.string().uuid() });
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return NextResponse.json({ error: "invalid-input" }, { status: 400, headers });
  const input = schema.safeParse(await readSmallJson(request).catch(() => null));
  if (!input.success) return NextResponse.json({ error: "invalid-input" }, { status: 400, headers });
  try {
    const context = await getPublicTable(input.data.restaurantSlug, input.data.tableCode);
    if (!context.callsAvailable) return NextResponse.json({ error: "table-service-closed" }, { status: 409, headers });
    const limit = await consumeRateLimit({ scope: "table-service-call", identity: `${context.restaurant.id}:${context.table.id}`, maxAttempts: 5, windowSeconds: 300, blockSeconds: 300 });
    if (!limit.allowed) return NextResponse.json({ error: "table-call-cooldown" }, { status: 429, headers });
    const result = await createAdminClient()!.rpc("request_table_service", { p_restaurant: context.restaurant.id, p_table: context.table.id, p_request: input.data.requestId });
    if (result.error) throw new Error(result.error.message);
    const row = (result.data as { call: { id: string; tracking_token: string; status: string; created_at: string } }).call;
    after(async () => { await sendTableServicePush(row.id); });
    return NextResponse.json({ id: row.id, token: row.tracking_token, status: row.status, createdAt: row.created_at, tableName: context.table.name }, { headers });
  } catch (error) {
    const code = error instanceof Error && ["table-call-cooldown", "table-service-closed"].includes(error.message) ? error.message : "table-unavailable";
    return NextResponse.json({ error: code }, { status: code === "table-call-cooldown" ? 429 : 409, headers });
  }
}
export async function GET(request: Request) {
  const url = new URL(request.url), id = z.string().uuid().safeParse(url.searchParams.get("id")), token = request.headers.get("x-table-call-token") ?? "";
  if (!id.success || !/^[a-f0-9]{64}$/.test(token)) return NextResponse.json({ error: "not-found" }, { status: 404, headers });
  const row = await createAdminClient()?.from("table_service_calls").select("status,created_at").eq("id", id.data).eq("tracking_token", token).maybeSingle();
  if (!row?.data) return NextResponse.json({ error: "not-found" }, { status: 404, headers });
  return NextResponse.json({ status: row.data.status === "pending" && Date.parse(row.data.created_at) < Date.now() - 15 * 60000 ? "expired" : row.data.status }, { headers });
}
