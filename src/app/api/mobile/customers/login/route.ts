import { NextResponse } from "next/server";
import { z } from "zod";
import { clearRateLimit, consumeRateLimit } from "@/lib/security/rate-limit";
import { createPublicServerClient } from "@/lib/supabase/public-server";

const loginSchema = z.object({
  email: z.string().trim().email().max(180),
  password: z.string().min(6).max(120),
});

export async function POST(request: Request) {
  const supabase = createPublicServerClient();
  if (!supabase) {
    return NextResponse.json({ error: "supabase-not-configured" }, { status: 500 });
  }

  const body = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid-login" }, { status: 400 });
  }

  const rateLimit = await consumeRateLimit({
    scope: "mobile-customer-login",
    identity: parsed.data.email,
    maxAttempts: 10,
    windowSeconds: 15 * 60,
    blockSeconds: 15 * 60,
  });
  if (!rateLimit.allowed) {
    return NextResponse.json({ error: "rate-limit" }, { status: 429 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email.toLowerCase(),
    password: parsed.data.password,
  });

  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: "invalid-login-credentials" }, { status: 401 });
  }

  await clearRateLimit("mobile-customer-login", rateLimit.identifierHash);

  return NextResponse.json({
    accessToken: data.session.access_token,
    refreshToken: data.session.refresh_token,
    user: {
      id: data.user.id,
      email: data.user.email ?? "",
    },
  });
}
