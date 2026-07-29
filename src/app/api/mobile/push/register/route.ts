import { NextResponse } from "next/server";
import { z } from "zod";
import { registerMobilePushToken } from "@/lib/services/mobile-push.service";

const pushRegistrationSchema = z.object({
  appVersion: z.string().trim().max(40).optional(),
  customerPhone: z.string().trim().max(40).optional(),
  deviceId: z.string().trim().max(120).optional(),
  expoPushToken: z.string().trim().min(20).max(400),
  platform: z.string().trim().max(40).optional(),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = pushRegistrationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-push-registration" }, { status: 400 });
  }

  const result = await registerMobilePushToken(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: "push-registration-failed" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
