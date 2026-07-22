import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";

export type RestaurantAccessClaim = {
  allowed: boolean;
  sessionId?: string;
  restaurantId: string;
  restaurantName: string;
  activeRestaurantId?: string;
  activeRestaurantName?: string;
  activeIpAddress?: string;
  activeLastSeenAt?: string;
  message: string;
};

async function requestFingerprint() {
  const headerStore = await headers();
  const forwardedFor = headerStore.get("x-forwarded-for");
  const ipAddress = forwardedFor?.split(",")[0]?.trim() || headerStore.get("x-real-ip") || "unknown";
  const userAgent = headerStore.get("user-agent") || "unknown";

  return { ipAddress, userAgent };
}

export const restaurantAccessService = {
  async claim(restaurantId: string): Promise<RestaurantAccessClaim | null> {
    if (!hasSupabaseEnv()) {
      return null;
    }

    const supabase = await createClient();
    const { ipAddress, userAgent } = await requestFingerprint();
    const { data, error } = await supabase.rpc("claim_restaurant_access_session", {
      p_restaurant_id: restaurantId,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });

    if (error || !data?.[0]) {
      return {
        allowed: false,
        restaurantId,
        restaurantName: "Restaurante",
        message: error?.message ?? "restaurant-session-error",
      };
    }

    const claim = data[0];
    return {
      allowed: claim.allowed,
      sessionId: claim.session_id ?? undefined,
      restaurantId: claim.restaurant_id,
      restaurantName: claim.restaurant_name,
      activeRestaurantId: claim.active_restaurant_id ?? undefined,
      activeRestaurantName: claim.active_restaurant_name ?? undefined,
      activeIpAddress: claim.active_ip_address ?? undefined,
      activeLastSeenAt: claim.active_last_seen_at ?? undefined,
      message: claim.message,
    };
  },

  async claimOrRedirect(restaurantId: string, returnTo?: string) {
    void returnTo;
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      redirect("/admin/login?error=session");
    }

    const accessClient = createAdminClient() ?? supabase;
    const [{ data: profile, error: profileError }, { data: membership, error: membershipError }, { data: restaurant, error: restaurantError }] =
      await Promise.all([
        accessClient.from("profiles").select("global_role").eq("id", userData.user.id).maybeSingle(),
        accessClient
          .from("restaurant_memberships")
          .select("id")
          .eq("restaurant_id", restaurantId)
          .eq("user_id", userData.user.id)
          .eq("is_active", true)
          .limit(1)
          .maybeSingle(),
        accessClient
          .from("restaurants")
          .select("id,name")
          .eq("id", restaurantId)
          .eq("status", "active")
          .is("deleted_at", null)
          .maybeSingle(),
      ]);

    if (profileError || membershipError || restaurantError) {
      redirect("/admin/login?error=access-check");
    }

    const isSuperadmin = profile?.global_role === "superadmin";
    if (!restaurant || (!isSuperadmin && !membership)) {
      redirect("/admin/login?error=no-access");
    }

    const claim = await this.claim(restaurantId);

    if (claim?.allowed) {
      return claim;
    }

    return {
      allowed: true,
      restaurantId,
      restaurantName: restaurant.name,
      message: "restaurant-access-authorized-without-monitoring",
    } satisfies RestaurantAccessClaim;
  },

  async release(restaurantId: string, reason = "Liberada por el usuario") {
    if (!hasSupabaseEnv()) {
      return;
    }

    const supabase = await createClient();
    await supabase.rpc("release_restaurant_access_session", {
      p_restaurant_id: restaurantId,
      p_reason: reason,
    });
  },
};
