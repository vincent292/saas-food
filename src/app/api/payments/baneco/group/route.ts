import { NextResponse } from "next/server";
import { z } from "zod";
import { bankGroupPaymentService } from "@/lib/services/bank-group-payment.service";
import { consumeRateLimit } from "@/lib/security/rate-limit";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const headers = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };
const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("cancel"), billId: z.string().uuid() }),
  z.object({ action: z.enum(["qr", "cash", "reset"]), participantId: z.string().uuid(), restaurantId: z.string().uuid(), payingOther: z.boolean().default(false) }),
]);
async function handle(request: Request, mutate: boolean) {
  const url = new URL(request.url), sessionToken = url.searchParams.get("sessionToken") ?? "", secret = request.headers.get("x-group-access") ?? "";
  if (!/^[A-Za-z0-9_-]{6,128}$/.test(sessionToken) || secret.length < 12 || secret.length > 256) return NextResponse.json({ error: "group-bank-forbidden" }, { status: 404, headers });
  const limit = await consumeRateLimit({ scope: mutate ? "bank-group-mutate" : "bank-group-view", identity: sessionToken, maxAttempts: mutate ? 20 : 90, windowSeconds: 60, blockSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "bank-operation-busy" }, { status: 429, headers });
  const access = { sessionToken, secret, host: request.headers.get("x-group-role") === "host" };
  try {
    if (!mutate) return NextResponse.json(await bankGroupPaymentService.view(access, url.searchParams.get("billId") ?? undefined), { headers });
    const reader = request.body?.getReader();
    if (!reader) throw new Error("group-bank-invalid");
    let bytes = 0, raw = ""; const decoder = new TextDecoder();
    try {
      for (;;) { const chunk = await reader.read(); if (chunk.done) break; bytes += chunk.value.byteLength;
        if (bytes > 4096) { await reader.cancel(); throw new Error("group-bank-invalid"); } raw += decoder.decode(chunk.value, { stream: true }); }
      raw += decoder.decode();
    } finally { reader.releaseLock(); }
    const input = schema.parse(JSON.parse(raw));
    const result = input.action === "cancel" ? await bankGroupPaymentService.cancel(access, input.billId)
      : await bankGroupPaymentService.operate(access, { participantId: input.participantId, restaurantId: input.restaurantId, mode: input.action, payingOther: input.payingOther });
    return NextResponse.json(result, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const code = /^(group-[a-z-]+|bank-[a-z-]+)$/.test(message) ? message : "group-bank-unavailable";
    return NextResponse.json({ error: code }, { status: code === "group-bank-forbidden" ? 404 : 409, headers });
  }
}
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
