import { after, NextResponse } from "next/server";
import { parseBanecoNotice } from "@/lib/payments/baneco-notification";
import { acceptBanecoPaymentNotice } from "@/lib/services/bank-qr.service";
import { consumeRateLimit } from "@/lib/security/rate-limit";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(request: Request) {
  let qrId: string;
  try {
    const limit = await consumeRateLimit({ scope: "baneco-notice", identity: "bank", maxAttempts: 120, windowSeconds: 60, blockSeconds: 60 });
    if (!limit.allowed) return NextResponse.json({ responseCode: 1, message: "Intente nuevamente" }, { status: 429 });
    qrId = await parseBanecoNotice(request);
  } catch {
    return NextResponse.json({ responseCode: 1, message: "Notificacion invalida" }, { status: 400 });
  }
  try {
    const work = await acceptBanecoPaymentNotice(qrId);
    if (work) after(work);
    return NextResponse.json({ responseCode: 0, message: "" }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ responseCode: 1, message: "No se pudo recibir la notificacion" }, { status: 503 });
  }
}
