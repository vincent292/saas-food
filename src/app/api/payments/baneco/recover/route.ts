import { NextResponse } from "next/server";
import { z } from "zod";
import { findRecoverableOrder } from "@/lib/payments/order-recovery";
import { createAdminClient } from "@/lib/supabase/admin";
import { consumeRateLimit } from "@/lib/security/rate-limit";
export const dynamic = "force-dynamic";
const schema = z.object({ restaurantId: z.string().uuid(), requestId: z.string().uuid(), recoveryKey: z.string().regex(/^[a-f0-9]{64}$/) });
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
export async function POST(request: Request) {
  if (Number(request.headers.get("content-length") ?? 0) > 2048) return NextResponse.json({ error: "invalid" }, { status: 400, headers });
  let payload: unknown;
  const reader = request.body?.getReader();
  try {
    let text = "", bytes = 0;
    const decoder = new TextDecoder();
    if (!reader) throw new Error("invalid");
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > 2048) { await reader.cancel(); throw new Error("invalid"); }
      text += decoder.decode(value, { stream: true });
    }
    payload = JSON.parse(text + decoder.decode());
  } catch { return NextResponse.json({ error: "invalid" }, { status: 400, headers }); }
  finally { reader?.releaseLock(); }
  const input = schema.safeParse(payload);
  if (!input.success) return NextResponse.json({ error: "not-found" }, { status: 404, headers });
  const limit = await consumeRateLimit({ scope: "public-order-recover", identity: input.data.restaurantId, maxAttempts: 20, windowSeconds: 60, blockSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "busy" }, { status: 429, headers });
  try {
    const order = await findRecoverableOrder(input.data.restaurantId, input.data.requestId, input.data.recoveryKey);
    if (!order) return NextResponse.json({ error: "not-found" }, { status: 404, headers });
    const { data: restaurant } = await createAdminClient()!.from("restaurants").select("slug").eq("id", order.restaurant_id).maybeSingle();
    if (!restaurant) return NextResponse.json({ error: "not-found" }, { status: 404, headers });
    return NextResponse.json({ path: `/${restaurant.slug}/${order.bank_checkout_hold ? "pago" : "pedido"}/${order.id}?token=${encodeURIComponent(order.tracking_token)}`,
      terminal: ["delivered", "cancelled"].includes(order.status) }, { headers });
  } catch { return NextResponse.json({ error: "unavailable" }, { status: 503, headers }); }
}
