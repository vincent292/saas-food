import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession } from "@/lib/services/rider-mobile.service";
import { respondToMultisiteRiderOffer } from "@/lib/services/multisite-rider-negotiation.service";

const responseSchema = z.object({
  action: z.enum(["accept", "counter", "reject"]),
  counterFee: z.coerce.number().nonnegative().max(500).optional(),
}).superRefine((value, context) => {
  if (value.action === "counter" && value.counterFee == null) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "counter-fee-required", path: ["counterFee"] });
  }
});

export async function POST(request: Request, { params }: { params: Promise<{ offerId: string }> }) {
  const { offerId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-multisite-rider-response" }, { status: 400 });
  }
  const parsed = responseSchema.safeParse(body);
  if (!z.string().uuid().safeParse(offerId).success || !parsed.success) {
    return NextResponse.json({ error: "invalid-multisite-rider-response" }, { status: 400 });
  }
  const session = await getMobileRiderSession(request);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const result = await respondToMultisiteRiderOffer(session.data, { offerId, ...parsed.data });
  return result.ok ? NextResponse.json(result.data) : NextResponse.json({ error: result.error }, { status: result.status });
}
