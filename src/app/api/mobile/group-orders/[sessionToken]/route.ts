import { NextResponse } from "next/server";
import { buildGroupOrderPayload, getMobileGroupAdmin, mobileGroupError } from "../_shared";

export async function GET(request: Request, { params }: { params: Promise<{ sessionToken: string }> }) {
  const { sessionToken } = await params;
  const url = new URL(request.url);
  const participantToken = url.searchParams.get("participantToken") || undefined;
  const hostAccessToken = url.searchParams.get("hostAccessToken") || undefined;
  const supabase = await getMobileGroupAdmin();
  if (!supabase) return mobileGroupError("service-role-required", 500);

  const payload = await buildGroupOrderPayload({ hostAccessToken, participantToken, sessionToken, supabase });
  if (!payload) return mobileGroupError("not-found", 404);

  return NextResponse.json(payload);
}
