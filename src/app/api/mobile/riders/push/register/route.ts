import { NextResponse } from "next/server";
import { z } from "zod";
import { getMobileRiderSession, registerMobileRiderPushToken } from "@/lib/services/rider-mobile.service";

const pushSchema = z.object({
  expoPushToken: z.string().trim().min(20).max(400),
  deviceId: z.string().trim().max(160).optional(),
  platform: z.string().trim().max(40).optional(),
  appVersion: z.string().trim().max(40).optional(),
  riderId: z.string().uuid().optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = pushSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-rider-push-token" }, { status: 400 });
  }

  const session = await getMobileRiderSession(request, { requireActive: false });
  if (!session.ok) {
    return NextResponse.json({ error: session.error }, { status: session.status });
  }

  const result = await registerMobileRiderPushToken(session.data, parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json(result.data);
}
