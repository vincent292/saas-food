import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const [{ data: profile }, { data: customerProfile }, { data: ownedRestaurant }] = await Promise.all([
    supabase.from("profiles").select("id,email,global_role").eq("id", user.id).maybeSingle(),
    supabase.from("customer_profiles").select("id").eq("id", user.id).maybeSingle(),
    supabase.from("restaurants").select("id").eq("owner_user_id", user.id).is("deleted_at", null).limit(1).maybeSingle(),
  ]);

  if (!profile || customerProfile) {
    return NextResponse.json({ error: "business-account-required" }, { status: 403 });
  }

  const canLink = profile.global_role === "superadmin" || Boolean(ownedRestaurant);
  if (!canLink) {
    return NextResponse.json({ error: "owner-or-superadmin-required" }, { status: 403 });
  }

  const identities = user.identities ?? [];
  const googleIdentity = identities.find((identity) => identity.provider === "google");

  return NextResponse.json({
    email: profile.email ?? user.email ?? "",
    googleLinked: Boolean(googleIdentity),
    identityCount: identities.length,
    role: profile.global_role === "superadmin" ? "superadmin" : "owner",
  });
}
