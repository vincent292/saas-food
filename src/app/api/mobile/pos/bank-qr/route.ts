import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { bankOrderPaymentService, safeBankError } from "@/lib/services/bank-qr.service";
import { consumeRateLimit } from "@/lib/security/rate-limit";
import { checked, json, PosError, restaurantAccess, session } from "../_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
export function OPTIONS() { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization, Content-Type", "Access-Control-Allow-Methods": "GET, POST, OPTIONS" } }); }
const input = z.object({ restaurantId: z.string().uuid(), orderId: z.string().uuid(), action: z.enum(["generate", "cancel"]).optional() });
async function handle(request: Request, mutate: boolean) {
  try {
    const values = mutate ? await request.json() : Object.fromEntries(new URL(request.url).searchParams);
    const parsed = input.safeParse(values);
    if (!parsed.success) throw new PosError("bank-invalid-input", 400);
    let authorized = request;
    if (!request.headers.has("authorization")) {
      if (mutate && request.headers.get("origin") !== new URL(request.url).origin) throw new PosError("bank-forbidden", 403);
      const server = await createClient();
      const { data } = await server.auth.getSession();
      if (!data.session) throw new PosError("bank-forbidden", 401);
      authorized = new Request(request.url, { headers: { authorization: `Bearer ${data.session.access_token}` } });
    }
    const auth = await session(authorized);
    restaurantAccess(auth, parsed.data.restaurantId, true);
    const support = checked(await auth.admin.from("support_impersonation_sessions").select("id").eq("actor_user_id", auth.profile.id).eq("status", "active").gt("expires_at", new Date().toISOString()).limit(1).maybeSingle());
    if (support) throw new PosError("bank-forbidden", 403);
    const limit = await consumeRateLimit({ scope: mutate ? "pos-bank-write" : "pos-bank-read", identity: auth.profile.id,
      maxAttempts: mutate ? 15 : 120, windowSeconds: 60, blockSeconds: 60 });
    if (!limit.allowed) throw new PosError("bank-operation-busy", 429);
    const order = checked(await auth.admin.from("orders").select("id,tracking_token,bank_group_session_id").eq("restaurant_id", parsed.data.restaurantId).eq("id", parsed.data.orderId).maybeSingle());
    if (!order || order.bank_group_session_id) throw new PosError("bank-order-ineligible", 409);
    if (mutate && parsed.data.action !== "cancel") {
      checked(await auth.admin.rpc("prepare_baneco_staff_order", { p_restaurant: parsed.data.restaurantId, p_order: order.id, p_actor: auth.profile.id }));
    }
    const result = !mutate ? await bankOrderPaymentService.get(order.id, order.tracking_token)
      : parsed.data.action === "cancel" ? await bankOrderPaymentService.cancel(order.id, order.tracking_token)
      : await bankOrderPaymentService.generate(order.id, order.tracking_token);
    const response = json({ ...result, realtimeToken: order.tracking_token });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    const response = json({ error: safeBankError(error) }, error instanceof PosError ? error.status : 409);
    response.headers.set("Cache-Control", "no-store");
    return response;
  }
}
export function GET(request: Request) { return handle(request, false); }
export function POST(request: Request) { return handle(request, true); }
