import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bucket = "whatsapp-payment-receipts";

export async function GET(_request: NextRequest, { params }: { params: Promise<{ key?: string[] }> }) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { key } = await params;
  const restaurantId = key?.[0] === "restaurants" ? key[1] : null;
  const path = key?.join("/");
  if (!restaurantId || !path) {
    return NextResponse.json({ error: "Invalid receipt path" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Storage is not configured" }, { status: 503 });
  }

  const [profileResult, restaurantResult, membershipResult] = await Promise.all([
    admin.from("profiles").select("global_role").eq("id", authData.user.id).maybeSingle(),
    admin.from("restaurants").select("owner_user_id").eq("id", restaurantId).maybeSingle(),
    admin
      .from("restaurant_memberships")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", authData.user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);
  const canRead =
    profileResult.data?.global_role === "superadmin" ||
    restaurantResult.data?.owner_user_id === authData.user.id ||
    Boolean(membershipResult.data);
  if (!canRead) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { data, error } = await admin.storage.from(bucket).createSignedUrl(path, 5 * 60);
  if (error || !data?.signedUrl) {
    return NextResponse.json({ error: "Receipt not found" }, { status: 404 });
  }

  return NextResponse.redirect(data.signedUrl, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

