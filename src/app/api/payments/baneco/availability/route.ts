import { NextResponse } from "next/server";
import { z } from "zod";
import { bankOrderPaymentService } from "@/lib/services/bank-qr.service";
import { consumeRateLimit } from "@/lib/security/rate-limit";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const id = z.string().uuid().safeParse(new URL(request.url).searchParams.get("restaurantId"));
  const limit = await consumeRateLimit({ scope: "bank-availability", identity: "public", maxAttempts: 120, windowSeconds: 60, blockSeconds: 60 });
  if (!id.success || !limit.allowed) return NextResponse.json({ available: false }, { status: id.success ? 429 : 400, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ available: await bankOrderPaymentService.availableForRestaurant(id.data) }, { headers: { "Cache-Control": "no-store" } });
}
