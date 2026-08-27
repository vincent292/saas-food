"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database.types";

type RealtimeTable = keyof Database["public"]["Tables"] & string;
type RealtimeScope = "cash" | "dashboard" | "kitchen" | "notifications" | "orders" | "owner";

const tablesByScope: Record<RealtimeScope, readonly RealtimeTable[]> = {
  orders: ["orders"],
  kitchen: ["orders"],
  cash: ["orders", "order_delivery_links", "cash_sessions", "cash_movements", "order_cancellation_reviews"],
  notifications: ["orders", "cash_sessions", "order_cancellation_reviews"],
  dashboard: ["orders", "cash_sessions", "cash_movements", "inventory_items", "tables", "products"],
  owner: ["orders", "cash_sessions", "cash_movements", "inventory_items", "order_cancellation_reviews"],
};

export function useRestaurantRealtimeRefresh({
  enabled = true,
  restaurantId,
  scope,
}: {
  enabled?: boolean;
  restaurantId?: string;
  scope: RealtimeScope;
}) {
  const router = useRouter();
  const connectedRef = useRef(false);
  const refreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) return;

    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") return;
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      refreshTimeoutRef.current = window.setTimeout(() => {
        router.refresh();
        refreshTimeoutRef.current = null;
      }, 250);
    };

    const supabase = createClient();
    let channel = supabase.channel(`yopido-${scope}-${restaurantId || "owner"}`);
    for (const table of tablesByScope[scope]) {
      channel = channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          ...(restaurantId ? { filter: `restaurant_id=eq.${restaurantId}` } : {}),
        },
        refreshIfVisible,
      );
    }
    channel.subscribe((status) => {
      connectedRef.current = status === "SUBSCRIBED";
      if (status === "SUBSCRIBED") {
        refreshIfVisible();
      }
    });

    const refreshFallback = () => {
      if (!connectedRef.current) {
        refreshIfVisible();
      }
    };
    const fallbackInterval = window.setInterval(refreshFallback, 60_000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      connectedRef.current = false;
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      window.clearInterval(fallbackInterval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled, restaurantId, router, scope]);
}
