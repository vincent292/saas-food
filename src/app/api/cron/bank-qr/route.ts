import { NextResponse } from "next/server";
import { bankWorkerAuthorized, runBankQrWorker } from "@/lib/services/bank-qr.service";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
export const runtime = "nodejs";

export async function POST(request: Request) {
  const authentication = { timestamp: request.headers.get("x-baneco-time"), signature: request.headers.get("x-baneco-signature") };
  if (!bankWorkerAuthorized(authentication)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  try {
    const result = await runBankQrWorker(authentication);
    return NextResponse.json({ ok: true, ...result }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never log raw bank/network exceptions, URLs or credentials.
    return NextResponse.json({ error: "bank-reconciliation-unavailable" }, { status: 503 });
  }
}
