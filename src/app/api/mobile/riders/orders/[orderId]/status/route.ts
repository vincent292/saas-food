import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession, updateMobileRiderDeliveryStatus } from "@/lib/services/rider-mobile.service";

const statusSchema = z.object({
  status: z.enum(["arrived", "delivered"]),
});

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = statusSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-rider-status" }, { status: 400 });
  }

  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const result = await updateMobileRiderDeliveryStatus(session.data, orderId, parsed.data.status);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
