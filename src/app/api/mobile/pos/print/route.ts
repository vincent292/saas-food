import { z } from "zod";
import { checked, cors, failure, json, PosError, restaurantAccess, session } from "../_shared";
import { readSmallJson } from "@/lib/security/read-small-json";
export const runtime = "nodejs";
export function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
const base = z.object({ restaurantId: z.string().uuid(), orderId: z.string().uuid(), deviceId: z.string().uuid(), token: z.string().uuid() });
const input = z.discriminatedUnion("action", [
  base.extend({ action: z.literal("claim"), since: z.string().datetime().optional(), reprint: z.boolean().optional() }),
  base.extend({ action: z.literal("finish"), result: z.enum(["printed", "failed", "uncertain"]) }),
]);
export async function POST(request: Request) {
  try {
    const auth = await session(request);
    const parsed = input.safeParse(await readSmallJson(request).catch(() => null));
    if (!parsed.success) throw new PosError("print-invalid-input", 400);
    const value = parsed.data;
    restaurantAccess(auth, value.restaurantId, true);
    const result = value.action === "claim" ? checked(await auth.client.rpc("claim_pos_order_print", {
      p_restaurant_id: value.restaurantId, p_order_id: value.orderId, p_device_id: value.deviceId, p_claim_token: value.token,
      p_since: value.since ?? null, p_reprint: value.reprint ?? false,
    })) : checked(await auth.client.rpc("finish_pos_order_print", {
      p_restaurant_id: value.restaurantId, p_order_id: value.orderId, p_device_id: value.deviceId, p_claim_token: value.token, p_result: value.result,
    }));
    return json(value.action === "claim" ? result : { completed: result });
  } catch (error) { return failure(error); }
}
