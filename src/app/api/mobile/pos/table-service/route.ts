import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { json, session, restaurantAccess, PosError } from "../_shared";
import { tableServiceStaffView } from "@/lib/services/table-service.service";
export const dynamic = "force-dynamic";
export function OPTIONS() { return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Authorization,Content-Type", "Access-Control-Allow-Methods": "GET,POST,OPTIONS" } }); }
async function handle(request: Request, mutate: boolean) {
  try {
    const input = z.object({ restaurantId: z.string().uuid(), callId: z.string().uuid().optional() }).parse(mutate ? await request.json() : Object.fromEntries(new URL(request.url).searchParams));
    let authorized = request;
    if (!request.headers.has("authorization")) {
      if (mutate && request.headers.get("origin") !== new URL(request.url).origin) throw new PosError("table-service-forbidden", 403);
      const { data } = await (await createClient()).auth.getSession();
      if (!data.session) throw new PosError("table-service-forbidden", 401);
      authorized = new Request(request.url, { headers: { Authorization: `Bearer ${data.session.access_token}` } });
    }
    const auth = await session(authorized); restaurantAccess(auth, input.restaurantId);
    if (mutate) {
      if (!input.callId) throw new PosError("invalid-input", 400);
      const result = await auth.admin.rpc("attend_table_service", { p_restaurant: input.restaurantId, p_call: input.callId, p_actor: auth.profile.id });
      if (result.error) throw new PosError("table-service-forbidden", 403);
    }
    return json(await tableServiceStaffView(auth, input.restaurantId));
  } catch (error) { return json({ error: "table-service-forbidden" }, error instanceof PosError ? error.status : 403); }
}
export function GET(request: Request) { return handle(request, false); }
export function POST(request: Request) { return handle(request, true); }
