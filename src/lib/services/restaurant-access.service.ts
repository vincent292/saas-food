import { headers } from "next/headers";
import { redirect } from "next/navigation";
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

function blockUrl(claim: RestaurantAccessClaim, targetRestaurantId: string, returnTo?: string) {
  const params = new URLSearchParams({
    restaurantId: targetRestaurantId,
    restaurantName: claim.restaurantName,
    message: claim.message,
  });

  if (claim.activeRestaurantId) {
    params.set("activeRestaurantId", claim.activeRestaurantId);
  }

  if (claim.activeRestaurantName) {
    params.set("activeRestaurantName", claim.activeRestaurantName);
  }

  if (claim.activeIpAddress) {
    params.set("activeIpAddress", claim.activeIpAddress);
  }

  if (claim.activeLastSeenAt) {
    params.set("activeLastSeenAt", claim.activeLastSeenAt);
  }

  if (returnTo) {
    params.set("returnTo", returnTo);
  }

  return `/admin/acceso-bloqueado?${params.toString()}`;
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
    const claim = await this.claim(restaurantId);

    if (claim && !claim.allowed) {
      redirect(blockUrl(claim, restaurantId, returnTo));
    }

    return claim;
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
