import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGroupOrderPayload, getMobileGroupAdmin, groupCollectModeSchema, groupPaymentStatusSchema, mobileGroupError, paymentMethodForStatus, submitGroupSchema, submitMobileGroupOrder } from "../../_shared";

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
  }),
  z.object({
    action: z.literal("submit"),
    payload: submitGroupSchema,
  }),
]);

export async function POST(request: Request, { params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileGroupError("invalid-json");
  }
  const parsed = hostSchema.safeParse(body);
  if (!parsed.success) return mobileGroupError("invalid");

  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);

  if (parsed.data.action === "submit") {
    try {
      const order = await submitMobileGroupOrder(supabase, sessionToken, parsed.data.payload);
      return NextResponse.json({ order });
    } catch (error) {
      return mobileGroupError(error instanceof Error ? error.message : "create-order", 409);
    }
  }

  const hostAccessToken = parsed.data.hostAccessToken;
  const { data: session } = await supabase.from("group_order_sessions").select("id,status").eq("public_token", sessionToken).eq("host_access_token", hostAccessToken).maybeSingle();
  if (!session || session.status === "submitted") return mobileGroupError("closed", 409);

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
    const { error } = await supabase
      .from("group_order_sessions")
      .update({
        collect_mode: parsed.data.collectMode,
        host_qr_url: parsed.data.collectMode === "host_collects" ? parsed.data.hostQrUrl || null : null,
      })
      .eq("id", session.id);
    if (error) return mobileGroupError("settings");
  }

  const payload = await buildGroupOrderPayload({ hostAccessToken, sessionToken, supabase });
  return NextResponse.json(payload);
}
