import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGroupOrderPayload, getMobileGroupAdmin, groupPaymentStatusSchema, mobileGroupError, paymentMethodForStatus } from "../../_shared";

const paymentSchema = z.object({
  participantToken: z.string().min(12),
  paymentStatus: groupPaymentStatusSchema,
  paymentNote: z.string().trim().max(240).optional(),
  paymentReceiptUrl: z.string().trim().max(700).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileGroupError("invalid-json");
  }
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) return mobileGroupError("payment");
  if (parsed.data.paymentStatus === "paid_qr" && !parsed.data.paymentReceiptUrl?.trim()) return mobileGroupError("receipt-required");

  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);
  const { data: session } = await supabase.from("group_order_sessions").select("id,status").eq("public_token", sessionToken).maybeSingle();
  if (!session || !["open", "locked"].includes(session.status)) return mobileGroupError("closed", 409);

  const { error } = await supabase
    .from("group_order_participants")
    .update({
      payment_method: paymentMethodForStatus(parsed.data.paymentStatus),
      payment_note: parsed.data.paymentNote || null,
      payment_receipt_url: parsed.data.paymentStatus === "pending" ? null : parsed.data.paymentReceiptUrl || null,
      payment_receipt_uploaded_at: parsed.data.paymentStatus === "paid_qr" ? new Date().toISOString() : null,
      payment_status: parsed.data.paymentStatus,
    })
    .eq("session_id", session.id)
    .eq("participant_token", parsed.data.participantToken);
  if (error) return mobileGroupError("payment");

  const payload = await buildGroupOrderPayload({ participantToken: parsed.data.participantToken, sessionToken, supabase });
  return NextResponse.json(payload);
}
