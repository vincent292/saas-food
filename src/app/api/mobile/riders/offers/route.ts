import { NextResponse } from "next/server";
import { getMobileRiderSession, listMobileRiderDeliveryOffers } from "@/lib/services/rider-mobile.service";

export async function GET(request: Request) {
  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const result = await listMobileRiderDeliveryOffers(session.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
