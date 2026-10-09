import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession } from "@/lib/services/rider-mobile.service";
import { advanceRiderMultisiteRoute } from "@/lib/services/multisite-delivery.service";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("pickup"), childId: z.string().uuid(), confirmationCode: z.string().regex(/^\d{4}$/) }),
  z.object({ action: z.literal("delivered"), confirmationCode: z.string().regex(/^\d{4}$/) }),
]);
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(orderId).success || !parsed.success) return NextResponse.json({ error: "invalid-multisite-status" }, { status: 400 });
  const session = await getMobileRiderSession(request);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const result = await advanceRiderMultisiteRoute(session.data, orderId, parsed.data);
  return result.ok ? NextResponse.json(result.data) : NextResponse.json({ error: result.error }, { status: result.status });
}
