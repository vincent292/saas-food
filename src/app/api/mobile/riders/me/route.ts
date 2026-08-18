import { NextResponse } from "next/server";
import { getMobileRiderAvailability, getMobileRiderSession } from "@/lib/services/rider-mobile.service";

export async function GET(request: Request) {
  const session = await getMobileRiderSession(request, { requireActive: false });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const availability = await getMobileRiderAvailability(session.data);

  return NextResponse.json({
    user: {
      id: session.data.user.id,
      email: session.data.user.email ?? "",
    },
    riders: session.data.riders,
    activeRiders: session.data.activeRiders,
    availableToday: availability.ok ? availability.data.available : false,
    updatedAt: new Date().toISOString(),
  });
}
