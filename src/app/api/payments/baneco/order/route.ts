import { NextResponse } from "next/server";
import { z } from "zod";
import { bankOrderPaymentService, safeBankError } from "@/lib/services/bank-qr.service";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
const idSchema = z.string().uuid();
const cors = { "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "x-order-tracking-token", "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS" };
export function OPTIONS() { return new Response(null, { status: 204, headers: cors }); }
async function handle(request: Request, generate: boolean, cancel = false) {
  const orderId = idSchema.safeParse(new URL(request.url).searchParams.get("orderId"));
  const token = request.headers.get("x-order-tracking-token") ?? "";
  if (!orderId.success || token.length < 20 || token.length > 256) return NextResponse.json({ error: "bank-request-unavailable" }, { status: 404, headers: cors });
  const limit = await consumeRateLimit({ scope: generate ? "baneco-order-generate" : "baneco-order-view", identity: orderId.data,
    maxAttempts: generate ? 10 : 90, windowSeconds: 60, blockSeconds: 60 });
  if (!limit.allowed) return NextResponse.json({ error: "bank-operation-busy" }, { status: 429, headers: cors });
  try {
    const result = cancel && new URL(request.url).searchParams.get("abandon") === "1" ? await bankOrderPaymentService.abandonCheckout(orderId.data, token)
      : cancel ? await bankOrderPaymentService.cancel(orderId.data, token) : generate ? await bankOrderPaymentService.generate(orderId.data, token) : await bankOrderPaymentService.get(orderId.data, token);
    return NextResponse.json(result, { headers: cors });
  } catch (error) {
    return NextResponse.json({ error: safeBankError(error) }, { status: 409, headers: cors });
  }
}
export async function GET(request: Request) { return handle(request, false); }
export async function POST(request: Request) { return handle(request, true); }
export async function DELETE(request: Request) { return handle(request, true, true); }
