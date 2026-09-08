import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession, rejectMobileRiderOrder } from "@/lib/services/rider-mobile.service";

const rejectSchema = z.object({
  reason: z.string().trim().max(160).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const [{ orderId }, body] = await Promise.all([
    params,
    request
      .json()
      .catch(() => ({})),
  ]);
  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-rider-order-reject" }, { status: 400 });
  }

  const result = await rejectMobileRiderOrder(session.data, {
    orderId,
    reason: parsed.data.reason,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data, {
    headers: { "Cache-Control": "no-store" },
  });
}
