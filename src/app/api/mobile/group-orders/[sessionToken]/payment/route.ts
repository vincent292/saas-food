import { NextResponse } from "next/server";
import { z } from "zod";
import { uploadPrivateFile } from "@/lib/supabase/storage";
import {
  buildGroupOrderPayload,
  getMobileGroupAdmin,
  groupPaymentStatusSchema,
  groupPrivateReceiptTypes,
  isNonEmptyFile,
  isGroupSessionExpired,
  mobileGroupError,
  paymentMethodForStatus,
  validateGroupUpload,
} from "../../_shared";

const paymentSchema = z.object({
  participantToken: z.string().min(12),
  paymentStatus: groupPaymentStatusSchema,
  paymentNote: z.string().trim().max(240).optional(),
  paymentReceiptUrl: z.string().trim().max(700).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  let body: unknown;
  let paymentReceiptFile: File | null = null;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = {
        participantToken: formData.get("participantToken") || undefined,
        paymentNote: formData.get("paymentNote") || undefined,
        paymentStatus: formData.get("paymentStatus") || undefined,
      };
      const file = formData.get("paymentReceiptFile");
      paymentReceiptFile = isNonEmptyFile(file) ? file : null;
    } else {
      body = await request.json();
    }
  } catch {
    return mobileGroupError("invalid-json");
  }
  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) return mobileGroupError("payment");
  if (parsed.data.paymentStatus === "paid_qr" || parsed.data.paymentStatus === "covered_by_host" || parsed.data.paymentStatus === "excluded") {
    return mobileGroupError("host-only-payment-status", 403);
  }
  if (paymentReceiptFile) {
    const uploadError = validateGroupUpload(paymentReceiptFile, groupPrivateReceiptTypes);
    if (uploadError) return mobileGroupError(uploadError);
  }
  if (parsed.data.paymentStatus === "qr_uploaded" && !parsed.data.paymentReceiptUrl?.trim() && !paymentReceiptFile) return mobileGroupError("receipt-required");

  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);
  const { data: session } = await supabase.from("group_order_sessions").select("id,restaurant_id,status,expires_at").eq("public_token", sessionToken).maybeSingle();
  if (!session || !["open", "locked"].includes(session.status) || isGroupSessionExpired(session)) return mobileGroupError("closed", 409);
  const paymentReceiptUrl =
    parsed.data.paymentStatus === "qr_uploaded" && paymentReceiptFile
      ? await uploadPrivateFile(paymentReceiptFile, `restaurants/${session.restaurant_id}/group-payment-receipts`)
      : parsed.data.paymentReceiptUrl || null;

  const { error } = await supabase
    .from("group_order_participants")
    .update({
      payment_method: paymentMethodForStatus(parsed.data.paymentStatus),
      payment_note: parsed.data.paymentNote || null,
      payment_receipt_url: parsed.data.paymentStatus === "pending" ? null : paymentReceiptUrl,
      payment_receipt_uploaded_at: parsed.data.paymentStatus === "qr_uploaded" ? new Date().toISOString() : null,
      payment_status: parsed.data.paymentStatus,
    })
    .eq("session_id", session.id)
    .eq("participant_token", parsed.data.participantToken);
  if (error) return mobileGroupError("payment");

  const payload = await buildGroupOrderPayload({ participantToken: parsed.data.participantToken, sessionToken, supabase });
  return NextResponse.json(payload);
}
