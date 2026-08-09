import { NextResponse } from "next/server";
import { z } from "zod";
import { uploadTemporaryPublicImage } from "@/lib/supabase/storage";
import {
  buildGroupOrderPayload,
  createSecretToken,
  createShortToken,
  getMobileGroupAdmin,
  groupCollectModeSchema,
  groupPublicImageTypes,
  groupTemporaryUploadMaxAgeSeconds,
  isNonEmptyFile,
  mobileGroupError,
  validateGroupUpload,
} from "./_shared";

const createSchema = z.object({
  restaurantSlug: z.string().min(1),
  hostName: z.string().trim().min(2).max(120),
  hostPhone: z.string().trim().max(40).optional(),
  collectMode: groupCollectModeSchema.default("host_collects"),
  hostQrUrl: z.string().trim().max(700).optional(),
  multisiteEnabled: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  let body: unknown;
  let hostQrFile: File | null = null;
  try {
    if (request.headers.get("content-type")?.includes("multipart/form-data")) {
      const formData = await request.formData();
      body = {
        collectMode: formData.get("collectMode") || undefined,
        hostName: formData.get("hostName") || undefined,
        hostPhone: formData.get("hostPhone") || undefined,
        multisiteEnabled: formData.get("multisiteEnabled") === "true",
        restaurantSlug: formData.get("restaurantSlug") || undefined,
      };
      const file = formData.get("hostQrFile");
      hostQrFile = isNonEmptyFile(file) ? file : null;
    } else {
      body = await request.json();
    }
  } catch {
    return mobileGroupError("invalid-json");
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return mobileGroupError("invalid");
  if (hostQrFile) {
    const uploadError = validateGroupUpload(hostQrFile, groupPublicImageTypes, "qr");
    if (uploadError) return mobileGroupError(uploadError);
  }

  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);

  const { data: restaurant } = await supabase
    .from("restaurants")
    .select("id,slug")
    .eq("slug", parsed.data.restaurantSlug)
    .eq("status", "active")
    .is("deleted_at", null)
    .maybeSingle();

  if (!restaurant) return mobileGroupError("invalid-restaurant", 404);

  const hostQrUrl =
    parsed.data.collectMode === "host_collects" && hostQrFile
      ? await uploadTemporaryPublicImage(hostQrFile, `temporary/group-orders/${restaurant.id}/host-qr`, groupTemporaryUploadMaxAgeSeconds)
      : parsed.data.hostQrUrl || null;

  const sessionToken = createShortToken(12);
  const hostAccessToken = createSecretToken();
  const hostParticipantToken = createSecretToken();
  const { data: session, error: sessionError } = await supabase
    .from("group_order_sessions")
    .insert({
      collect_mode: parsed.data.collectMode,
      host_access_token: hostAccessToken,
      host_name: parsed.data.hostName,
      host_phone: parsed.data.hostPhone || null,
      host_qr_url: parsed.data.collectMode === "host_collects" ? hostQrUrl : null,
      multisite_enabled: parsed.data.multisiteEnabled,
      public_token: sessionToken,
      restaurant_id: restaurant.id,
    })
    .select("id")
    .single();

  if (sessionError || !session) return mobileGroupError("create");

  const { data: participant, error: participantError } = await supabase
    .from("group_order_participants")
    .insert({
      display_name: parsed.data.hostName,
      participant_token: hostParticipantToken,
      payment_method: "other",
      payment_status: "covered_by_host",
      phone: parsed.data.hostPhone || null,
      role: "host",
      session_id: session.id,
    })
    .select("id")
    .single();

  if (participantError || !participant) {
    await supabase.from("group_order_sessions").delete().eq("id", session.id);
    return mobileGroupError("create");
  }

  await supabase.from("group_order_sessions").update({ host_participant_id: participant.id }).eq("id", session.id);
  const payload = await buildGroupOrderPayload({
    hostAccessToken,
    participantToken: hostParticipantToken,
    sessionToken,
    supabase,
  });

  return NextResponse.json({ hostAccessToken, participantToken: hostParticipantToken, sessionToken, ...payload });
}
