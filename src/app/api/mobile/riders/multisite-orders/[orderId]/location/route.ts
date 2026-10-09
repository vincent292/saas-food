import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession } from "@/lib/services/rider-mobile.service";
import { updateRiderMultisiteLocation } from "@/lib/services/multisite-delivery.service";

const schema = z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) });
export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!z.string().uuid().safeParse(orderId).success || !parsed.success) return NextResponse.json({ error: "invalid-rider-location" }, { status: 400 });
  const session = await getMobileRiderSession(request);
  if (!session.ok) return NextResponse.json({ error: session.error }, { status: session.status });
  const result = await updateRiderMultisiteLocation(session.data, orderId, parsed.data);
  return result.ok ? NextResponse.json(result.data) : NextResponse.json({ error: result.error }, { status: result.status });
}
