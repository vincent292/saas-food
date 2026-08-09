import { NextResponse } from "next/server";
import { z } from "zod";
import { buildGroupOrderPayload, createSecretToken, getMobileGroupAdmin, mobileGroupError } from "../../_shared";

const joinSchema = z.object({
  displayName: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional(),
});

export async function POST(request: Request, { params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return mobileGroupError("invalid-json");
  }
  const parsed = joinSchema.safeParse(body);
  if (!parsed.success) return mobileGroupError("invalid-join");

  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);

  const { data: session } = await supabase.from("group_order_sessions").select("id,status,expires_at").eq("public_token", sessionToken).maybeSingle();
  if (!session || session.status !== "open" || new Date(session.expires_at).getTime() <= Date.now()) return mobileGroupError("closed", 409);

  const participantToken = createSecretToken();
  const { error } = await supabase.from("group_order_participants").insert({
    display_name: parsed.data.displayName,
    participant_token: participantToken,
    phone: parsed.data.phone || null,
    role: "guest",
    session_id: session.id,
  });
  if (error) return mobileGroupError("join");

  const payload = await buildGroupOrderPayload({ participantToken, sessionToken, supabase });
  return NextResponse.json({ participantToken, ...payload });
}
