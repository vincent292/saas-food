import { NextResponse } from "next/server";
import { getMobileRiderSession } from "@/lib/services/rider-mobile.service";
import { listRiderMultisiteRoutes } from "@/lib/services/multisite-delivery.service";

export async function GET(request: Request) {
  const session = await getMobileRiderSession(request);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const result = await listRiderMultisiteRoutes(session.data);
  return result.ok ? NextResponse.json(result.data, { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: result.error }, { status: result.status });
}
