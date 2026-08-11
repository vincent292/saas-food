import { NextResponse } from "next/server";
import { z } from "zod";
import { deletePublicFileUrl, uploadPrivateFile, uploadTemporaryPublicImage } from "@/lib/supabase/storage";
import {
  buildGroupOrderPayload,
  getMobileGroupAdmin,
  groupCollectModeSchema,
  groupPaymentStatusSchema,
  groupPrivateReceiptTypes,
  groupPublicImageTypes,
  groupTemporaryUploadMaxAgeSeconds,
  isNonEmptyFile,
  isGroupSessionExpired,
  mobileGroupError,
  paymentMethodForStatus,
  submitGroupSchema,
  submitMobileGroupOrder,
  validateGroupUpload,
} from "../../_shared";

const hostSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    hostAccessToken: z.string().min(12),
    status: z.enum(["open", "locked", "cancelled"]),
  }),
  z.object({
    action: z.literal("participant"),
    hostAccessToken: z.string().min(12),
    participantId: z.string().uuid(),
    paymentStatus: groupPaymentStatusSchema,
  }),
  z.object({
    action: z.literal("settings"),
    hostAccessToken: z.string().min(12),
    collectMode: groupCollectModeSchema,
    hostQrUrl: z.string().trim().max(700).optional(),
    multisiteEnabled: z.boolean().optional().default(false),
  }),
  z.object({
    action: z.literal("submit"),
    payload: submitGroupSchema,
  }),
]);

function isMissingMultisiteColumnError(error: unknown) {
  const candidate = error as { code?: string; details?: string; message?: string } | null;
  const text = `${candidate?.message ?? ""} ${candidate?.details ?? ""}`.toLowerCase();
  return candidate?.code === "PGRST204" || candidate?.code === "42703" || (text.includes("multisite_enabled") && (text.includes("schema cache") || text.includes("column")));
}

export async function POST(request: Request, { params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  let body: unknown;
  let hostQrFile: File | null = null;
  let paymentReceiptFile: File | null = null;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await request.formData();
      const action = formData.get("action");
      if (action === "settings") {
        body = {
          action,
          collectMode: formData.get("collectMode") || undefined,
          hostAccessToken: formData.get("hostAccessToken") || undefined,
          multisiteEnabled: formData.get("multisiteEnabled") === "true",
        };
        const file = formData.get("hostQrFile");
        hostQrFile = isNonEmptyFile(file) ? file : null;
      } else if (action === "submit") {
        const payloadJson = formData.get("payload");
        body = {
          action,
          payload: typeof payloadJson === "string" ? JSON.parse(payloadJson) : undefined,
        };
        const file = formData.get("paymentReceiptFile");
        paymentReceiptFile = isNonEmptyFile(file) ? file : null;
      } else {
        body = Object.fromEntries(formData.entries());
      }
    } else {
      body = await request.json();
    }
  } catch {
    return mobileGroupError("invalid-json");
  }
  const parsed = hostSchema.safeParse(body);
  if (!parsed.success) return mobileGroupError("invalid");
  if (hostQrFile) {
    const uploadError = validateGroupUpload(hostQrFile, groupPublicImageTypes, "qr");
    if (uploadError) return mobileGroupError(uploadError);
  }
  if (paymentReceiptFile) {
    const uploadError = validateGroupUpload(paymentReceiptFile, groupPrivateReceiptTypes);
    if (uploadError) return mobileGroupError(uploadError);
  }

  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);

  if (parsed.data.action === "submit") {
    try {
      let payload = parsed.data.payload;
      if (payload.paymentMethod === "qr" && paymentReceiptFile) {
        const { data: session } = await supabase
          .from("group_order_sessions")
          .select("id,restaurant_id,status,expires_at")
          .eq("public_token", sessionToken)
          .eq("host_access_token", payload.hostAccessToken)
          .maybeSingle();
        if (!session || !["open", "locked"].includes(session.status) || isGroupSessionExpired(session)) return mobileGroupError("closed", 409);
        const paymentReceiptUrl = await uploadPrivateFile(paymentReceiptFile, `restaurants/${session.restaurant_id}/payment-receipts`);
        payload = { ...payload, paymentReceiptUrl: paymentReceiptUrl ?? undefined };
      }
      const order = await submitMobileGroupOrder(supabase, sessionToken, payload);
      return NextResponse.json({ order });
    } catch (error) {
      return mobileGroupError(error instanceof Error ? error.message : "create-order", 409);
    }
  }

  const hostAccessToken = parsed.data.hostAccessToken;
  const { data: session } = await supabase.from("group_order_sessions").select("id,restaurant_id,status,host_qr_url,expires_at").eq("public_token", sessionToken).eq("host_access_token", hostAccessToken).maybeSingle();
  if (!session || session.status === "submitted" || isGroupSessionExpired(session)) return mobileGroupError("closed", 409);

  if (parsed.data.action === "status") {
    const { error } = await supabase.from("group_order_sessions").update({ status: parsed.data.status }).eq("id", session.id);
    if (error) return mobileGroupError("status");
  }

  if (parsed.data.action === "participant") {
    if (!["open", "locked"].includes(session.status)) return mobileGroupError("closed", 409);
    const { error } = await supabase
      .from("group_order_participants")
      .update({
        payment_method: paymentMethodForStatus(parsed.data.paymentStatus),
        payment_status: parsed.data.paymentStatus,
      })
      .eq("session_id", session.id)
      .eq("id", parsed.data.participantId);
    if (error) return mobileGroupError("participant");
  }

  if (parsed.data.action === "settings") {
    if (!["open", "locked"].includes(session.status)) return mobileGroupError("closed", 409);
    const hostQrUrl =
      parsed.data.collectMode === "host_collects" && hostQrFile
        ? await uploadTemporaryPublicImage(hostQrFile, `temporary/group-orders/${session.restaurant_id}/host-qr`, groupTemporaryUploadMaxAgeSeconds)
        : parsed.data.hostQrUrl || null;
    const updatePayload = {
      collect_mode: parsed.data.collectMode,
      host_qr_url: parsed.data.collectMode === "host_collects" ? hostQrUrl : null,
      multisite_enabled: parsed.data.multisiteEnabled,
    };
    const updateResult = await supabase
      .from("group_order_sessions")
      .update(updatePayload)
      .eq("id", session.id);
    const fallbackUpdateResult = isMissingMultisiteColumnError(updateResult.error)
      ? await supabase
          .from("group_order_sessions")
          .update({
            collect_mode: parsed.data.collectMode,
            host_qr_url: parsed.data.collectMode === "host_collects" ? hostQrUrl : null,
          })
          .eq("id", session.id)
      : updateResult;
    const error = fallbackUpdateResult.error;
    if (error) return mobileGroupError("settings");
    if (hostQrFile && session.host_qr_url) {
      await deletePublicFileUrl(session.host_qr_url).catch(() => undefined);
    }
  }

  const payload = await buildGroupOrderPayload({ hostAccessToken, sessionToken, supabase });
  return NextResponse.json(payload);
}
