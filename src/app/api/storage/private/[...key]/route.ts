import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getPrivateFileSignedUrl } from "@/lib/supabase/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest, { params }: { params: Promise<{ key?: string[] }> }) {
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

  const restaurantId = restaurantIdFromPath(key);
  if (key?.[0] === "restaurants" && !restaurantId) {
    return NextResponse.json({ error: "Invalid restaurant file key" }, { status: 400 });
  }

  if (restaurantId) {
    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Storage access is not configured" }, { status: 503 });
    }

    const canRead = await canReadRestaurantStorage(admin, data.user.id, restaurantId);
    if (!canRead) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const signedUrl = await getPrivateFileSignedUrl(path, {
    downloadFileName: request.nextUrl.searchParams.get("download") === "1" ? path.split("/").pop() : undefined,
  });
  if (!signedUrl) {
    return NextResponse.json({ error: "Private storage is not configured" }, { status: 503 });
  }

  return NextResponse.redirect(signedUrl, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

function restaurantIdFromPath(key?: string[]) {
  if (key?.[0] !== "restaurants") {
    return null;
  }

  return key[1]?.trim() || null;
}

async function canReadRestaurantStorage(admin: NonNullable<ReturnType<typeof createAdminClient>>, userId: string, restaurantId: string) {
  const [profileResult, restaurantResult, membershipResult] = await Promise.all([
    admin.from("profiles").select("global_role").eq("id", userId).maybeSingle(),
    admin.from("restaurants").select("owner_user_id").eq("id", restaurantId).maybeSingle(),
    admin
      .from("restaurant_memberships")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", userId)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle(),
  ]);

  return (
    profileResult.data?.global_role === "superadmin" ||
    restaurantResult.data?.owner_user_id === userId ||
    Boolean(membershipResult.data)
  );
}
