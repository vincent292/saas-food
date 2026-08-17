import { NextResponse } from "next/server";
import { z } from "zod";
import { loginMobileRider } from "@/lib/services/rider-mobile.service";
import { clearRateLimit, consumeRateLimit } from "@/lib/security/rate-limit";

const loginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(6).max(120),
});

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid-json" }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-rider-login" }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit({
    scope: "mobile-rider-login",
    identity: parsed.data.email,
    maxAttempts: 10,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate-limit" }, { status: 429 });
  }

  const result = await loginMobileRider(parsed.data);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await clearRateLimit("mobile-rider-login", rateLimit.identifierHash);

  return NextResponse.json(result.data);
}
