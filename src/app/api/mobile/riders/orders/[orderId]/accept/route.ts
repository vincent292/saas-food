import { NextResponse } from "next/server";
import { acceptMobileRiderOrder, getMobileRiderSession } from "@/lib/services/rider-mobile.service";

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const result = await acceptMobileRiderOrder(session.data, orderId);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
