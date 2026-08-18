import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession, rejectMobileRiderDeliveryOffer } from "@/lib/services/rider-mobile.service";

const rejectSchema = z.object({
  reason: z.string().trim().max(200).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = rejectSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-rider-offer-reject" }, { status: 400 });
  }

  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const result = await rejectMobileRiderDeliveryOffer(session.data, {
    offerId,
    reason: parsed.data.reason,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
