import { NextResponse } from "next/server";
import { getMobileRiderSession } from "@/lib/services/rider-mobile.service";
import { listMobileMultisiteRiderOffers } from "@/lib/services/multisite-rider-negotiation.service";

export async function GET(request: Request) {
  const session = await getMobileRiderSession(request);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const result = await listMobileMultisiteRiderOffers(session.data);
  return result.ok
    ? NextResponse.json(result.data, { headers: { "Cache-Control": "no-store" } })
    : NextResponse.json({ error: result.error }, { status: result.status });
}
