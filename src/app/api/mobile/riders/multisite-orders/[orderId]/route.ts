import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession } from "@/lib/services/rider-mobile.service";
import { listRiderMultisiteRoutes } from "@/lib/services/multisite-delivery.service";

export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!z.string().uuid().safeParse(orderId).success) return NextResponse.json({ error: "invalid-order-id" }, { status: 400 });
  const session = await getMobileRiderSession(request);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const result = await listRiderMultisiteRoutes(session.data, orderId);
  return result.ok ? NextResponse.json(result.data.routes[0], { headers: { "Cache-Control": "private, no-store" } }) : NextResponse.json({ error: result.error }, { status: result.status });
}
