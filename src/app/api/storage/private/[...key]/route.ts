import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPrivateFileSignedUrl } from "@/lib/supabase/storage";

export const runtime = "nodejs";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key?: string[] }> }) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();

  if (!data.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const path = key?.join("/");

  if (!path) {
    return NextResponse.json({ error: "Missing file key" }, { status: 400 });
  }

  const signedUrl = await getPrivateFileSignedUrl(path);
  if (!signedUrl) {
    return NextResponse.json({ error: "Private storage is not configured" }, { status: 503 });
  }

  return NextResponse.redirect(signedUrl);
}
