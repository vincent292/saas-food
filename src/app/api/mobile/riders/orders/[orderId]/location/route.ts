import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession, updateMobileRiderLocation } from "@/lib/services/rider-mobile.service";

const locationSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().min(0).max(10000).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  speedMetersPerSecond: z.number().min(0).max(120).nullable().optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = locationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-rider-location" }, { status: 400 });
  }

  const session = await getMobileRiderSession(request);
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const result = await updateMobileRiderLocation(session.data, orderId, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
