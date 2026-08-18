import { NextResponse } from "next/server";
import { getMobileRiderSession, updateMobileRiderAvailability } from "@/lib/services/rider-mobile.service";

export async function GET(request: Request) {
  const session = await getMobileRiderSession(request, { requireActive: false });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  await updateMobileRiderAvailability(session.data, { isAvailable: true });

  return NextResponse.json({
    user: {
      id: session.data.user.id,
      email: session.data.user.email ?? "",
    },
    riders: session.data.riders,
    activeRiders: session.data.activeRiders,
    updatedAt: new Date().toISOString(),
  });
}
