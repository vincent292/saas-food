import { NextResponse } from "next/server";
import { getMobileRiderDashboard, getMobileRiderSession } from "@/lib/services/rider-mobile.service";

export async function GET(request: Request) {
  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const includeAvailable = new URL(request.url).searchParams.get("includeAvailable") !== "false";
  const result = await getMobileRiderDashboard(session.data, { includeAvailable });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, {
    headers: {
      "Cache-Control": "private, no-store",
    },
  });
}
