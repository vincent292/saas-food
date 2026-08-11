import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGroupOrderPayload, getMobileGroupAdmin, groupItemSchema, groupMaxItems, groupMaxItemsPerParticipant, isGroupSessionExpired, mobileGroupError, resolveGroupCartItems } from "../../_shared";

const removeSchema = z.object({
  itemId: z.string().uuid(),
  participantToken: z.string().min(12).optional(),
  hostAccessToken: z.string().min(12).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileGroupError("invalid-json");
  }
  const parsed = groupItemSchema.safeParse(body);
  if (!parsed.success) return mobileGroupError("invalid");

  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);
  const { data: session } = await supabase.from("group_order_sessions").select("id,restaurant_id,status,expires_at").eq("public_token", sessionToken).maybeSingle();
  if (!session || session.status !== "open" || new Date(session.expires_at).getTime() <= Date.now()) return mobileGroupError("closed", 409);

  const { data: participant } = await supabase.from("group_order_participants").select("id").eq("session_id", session.id).eq("participant_token", parsed.data.participantToken).maybeSingle();
  if (!participant) return mobileGroupError("participant", 404);

  const [{ count: groupItemCount }, { count: participantItemCount }] = await Promise.all([
    supabase.from("group_order_items").select("id", { count: "exact", head: true }).eq("session_id", session.id),
    supabase.from("group_order_items").select("id", { count: "exact", head: true }).eq("session_id", session.id).eq("participant_id", participant.id),
  ]);
  if ((groupItemCount ?? 0) >= groupMaxItems) return mobileGroupError("group-item-limit", 409);
  if ((participantItemCount ?? 0) >= groupMaxItemsPerParticipant) return mobileGroupError("participant-item-limit", 409);

  let resolved;
  try {
    [resolved] = await resolveGroupCartItems(supabase, session.restaurant_id, [{ ...parsed.data, quantity: 1 }]);
  } catch (error) {
    return mobileGroupError(error instanceof Error ? error.message : "product-not-found");
  }

  const { error } = await supabase.from("group_order_items").insert({
    notes: resolved.notes ?? null,
    option_ids: resolved.optionIds,
    participant_id: participant.id,
    product_id: resolved.productId,
    product_name: resolved.name,
    quantity: resolved.quantity,
    session_id: session.id,
    subtotal: resolved.subtotal,
    unit_price: resolved.price,
    variant_id: resolved.variantId ?? null,
  });
  if (error) return mobileGroupError("add");

  const payload = await buildGroupOrderPayload({ participantToken: parsed.data.participantToken, sessionToken, supabase });
  return NextResponse.json(payload);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileGroupError("invalid-json");
  }
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) return mobileGroupError("invalid");

  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);
  const { data: session } = await supabase.from("group_order_sessions").select("id,status,host_access_token,expires_at").eq("public_token", sessionToken).maybeSingle();
  if (!session || !["open", "locked"].includes(session.status) || isGroupSessionExpired(session)) return mobileGroupError("closed", 409);

  const { data: item } = await supabase.from("group_order_items").select("id,participant_id").eq("session_id", session.id).eq("id", parsed.data.itemId).maybeSingle();
  if (!item) return mobileGroupError("item", 404);

  const isHost = Boolean(parsed.data.hostAccessToken && parsed.data.hostAccessToken === session.host_access_token);
  if (!isHost) {
    const { data: participant } = await supabase.from("group_order_participants").select("id").eq("session_id", session.id).eq("participant_token", parsed.data.participantToken ?? "").maybeSingle();
    if (!participant || participant.id !== item.participant_id) return mobileGroupError("forbidden", 403);
  }

  const { error } = await supabase.from("group_order_items").delete().eq("id", item.id).eq("session_id", session.id);
  if (error) return mobileGroupError("remove");

  const payload = await buildGroupOrderPayload({
    hostAccessToken: parsed.data.hostAccessToken,
    participantToken: parsed.data.participantToken,
    sessionToken,
    supabase,
  });
  return NextResponse.json(payload);
}
