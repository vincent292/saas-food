import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { hasSupabaseEnv } from "@/lib/supabase/env";
import { perfLog, perfNow } from "@/lib/utils/perf";

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

    const totalStartedAt = perfNow();
    const supabase = await createClient();
    const { ipAddress, userAgent } = await requestFingerprint();
    const rpcStartedAt = perfNow();
    const { data, error } = await supabase.rpc("claim_restaurant_access_session", {
      p_restaurant_id: restaurantId,
      p_ip_address: ipAddress,
      p_user_agent: userAgent,
    });
    perfLog("[restaurantAccessService.claim] rpc", rpcStartedAt, { restaurantId, allowed: Boolean(data?.[0]?.allowed), error: Boolean(error) });

    if (error || !data?.[0]) {
      perfLog("[restaurantAccessService.claim] total", totalStartedAt, { restaurantId, allowed: false });
      return {
        allowed: false,
        restaurantId,
        restaurantName: "Restaurante",
        message: error?.message ?? "restaurant-session-error",
      };
    }

    const claim = data[0];
    const mappedClaim = {
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
    perfLog("[restaurantAccessService.claim] total", totalStartedAt, { restaurantId, allowed: mappedClaim.allowed });
    return mappedClaim;
  },

  async claimOrRedirect(
    restaurantId: string,
    returnTo?: string,
    preloadedRestaurant?: { name?: string; status?: string; deletedAt?: string | null; skipRestaurantLookup?: boolean },
  ) {
    void returnTo;
    const totalStartedAt = perfNow();
    const supabase = await createClient();
    const userStartedAt = perfNow();
    const { data: userData, error: userError } = await supabase.auth.getUser();
    perfLog("[restaurantAccessService.claimOrRedirect] auth.getUser", userStartedAt, { restaurantId, found: Boolean(userData.user), error: Boolean(userError) });

    if (userError || !userData.user) {
      redirect("/admin/login?error=session");
    }

    const profileStartedAt = perfNow();
    const { data: profile, error: profileError } = await supabase.from("profiles").select("global_role").eq("id", userData.user.id).maybeSingle();
    perfLog("[restaurantAccessService.claimOrRedirect] profile-query", profileStartedAt, { restaurantId, error: Boolean(profileError), role: profile?.global_role });

    if (profileError) {
      redirect("/admin/login?error=access-check");
    }

    const isSuperadmin = profile?.global_role === "superadmin";
    let restaurantName = preloadedRestaurant?.name;

    if (preloadedRestaurant?.skipRestaurantLookup) {
      restaurantName = preloadedRestaurant.name;
    } else if (preloadedRestaurant) {
      if (preloadedRestaurant.deletedAt || (!isSuperadmin && preloadedRestaurant.status !== "active")) {
        redirect("/admin/login?error=no-access");
      }
    } else {
      const restaurantStartedAt = perfNow();
      let restaurantQuery = supabase.from("restaurants").select("id,name").eq("id", restaurantId).is("deleted_at", null);
      if (!isSuperadmin) {
        restaurantQuery = restaurantQuery.eq("status", "active");
      }

      const { data: restaurant, error: restaurantError } = await restaurantQuery.maybeSingle();
      perfLog("[restaurantAccessService.claimOrRedirect] restaurant-query", restaurantStartedAt, { restaurantId, found: Boolean(restaurant), error: Boolean(restaurantError) });
      if (restaurantError) {
        redirect("/admin/login?error=access-check");
      }

      if (!restaurant) {
        redirect("/admin/login?error=no-access");
      }

      restaurantName = restaurant.name;
    }

    if (isSuperadmin) {
      perfLog("[restaurantAccessService.claimOrRedirect] total", totalStartedAt, { restaurantId, superadmin: true });
      return {
        allowed: true,
        restaurantId,
        restaurantName: restaurantName ?? "Restaurante",
        message: "superadmin-access-authorized",
      } satisfies RestaurantAccessClaim;
    }

    const membershipStartedAt = perfNow();
    const { data: membership, error: membershipError } = await supabase
      .from("restaurant_memberships")
      .select("id")
      .eq("restaurant_id", restaurantId)
      .eq("user_id", userData.user.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    perfLog("[restaurantAccessService.claimOrRedirect] membership-query", membershipStartedAt, { restaurantId, found: Boolean(membership), error: Boolean(membershipError) });

    if (membershipError) {
      redirect("/admin/login?error=access-check");
    }

    if (!membership) {
      redirect("/admin/login?error=no-access");
    }

    const claim = await this.claim(restaurantId);

    if (claim?.allowed) {
      perfLog("[restaurantAccessService.claimOrRedirect] total", totalStartedAt, { restaurantId, allowed: true, monitored: true });
      return claim;
    }

    perfLog("[restaurantAccessService.claimOrRedirect] total", totalStartedAt, { restaurantId, allowed: true, monitored: false });
    return {
      allowed: true,
      restaurantId,
      restaurantName: restaurantName ?? "Restaurante",
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
