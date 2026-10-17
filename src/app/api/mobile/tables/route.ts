import { NextResponse } from "next/server";
import { z } from "zod";
import { getPublicTable } from "@/lib/services/table-service.service";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" };
export async function GET(request: Request) {
  const input = z.object({ restaurantSlug: z.string().regex(/^[a-z0-9-]{1,150}$/), tableCode: z.string().regex(/^[A-Za-z0-9_-]{1,100}$/) }).safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!input.success) return NextResponse.json({ error: "table-unavailable" }, { status: 404, headers });
  try { return NextResponse.json(await getPublicTable(input.data.restaurantSlug, input.data.tableCode), { headers }); }
  catch { return NextResponse.json({ error: "table-unavailable" }, { status: 404, headers }); }
}
