import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession, updateMobileRiderAvailability } from "@/lib/services/rider-mobile.service";

const availabilitySchema = z.object({
  isAvailable: z.boolean(),
  latitude: z.number().min(-90).max(90).nullable().optional(),
  longitude: z.number().min(-180).max(180).nullable().optional(),
  accuracyMeters: z.number().min(0).max(10000).nullable().optional(),
  heading: z.number().min(0).max(360).nullable().optional(),
  speedMetersPerSecond: z.number().min(0).max(120).nullable().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = availabilitySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-rider-availability" }, { status: 400 });
  }

  const session = await getMobileRiderSession(request, { requireActive: false });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const result = await updateMobileRiderAvailability(session.data, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
