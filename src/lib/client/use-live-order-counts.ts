"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { businessDayKey } from "@/lib/utils/dates";
import type { Order } from "@/types/order.types";

type CountableOrder = Pick<Order, "createdAt" | "orderType" | "status">;

export type LiveOrderCounts = {
  deliveryActive: number;
  kitchenActive: number;
  operationalTotal: number;
  pendingReview: number;
  pickupActive: number;
  tableActive: number;
};

const emptyCounts: LiveOrderCounts = {
  deliveryActive: 0,
  kitchenActive: 0,
  operationalTotal: 0,
  pendingReview: 0,
  pickupActive: 0,
  tableActive: 0,
};

const activeStatuses = ["pending", "accepted", "preparing", "ready"] as const;
const kitchenStatuses = ["accepted", "preparing", "ready"] as const;
const tableStatuses = ["accepted", "preparing", "ready"] as const;

function startOfBusinessDayIso() {
  const [year, month, day] = businessDayKey(new Date()).split("-");
  return new Date(`${year}-${month}-${day}T00:00:00-04:00`).toISOString();
}

function countsFromOrders(orders: CountableOrder[]): LiveOrderCounts {
  const todayOrders = orders.filter((order) => businessDayKey(order.createdAt) === businessDayKey(new Date()));
  const pendingReview = todayOrders.filter((order) => order.status === "pending").length;
  const tableActive = todayOrders.filter((order) => order.orderType === "table" && tableStatuses.includes(order.status as (typeof tableStatuses)[number])).length;
  const deliveryActive = todayOrders.filter((order) => order.orderType === "delivery" && activeStatuses.includes(order.status as (typeof activeStatuses)[number])).length;
  const pickupActive = todayOrders.filter((order) => order.orderType === "pickup" && activeStatuses.includes(order.status as (typeof activeStatuses)[number])).length;
  const kitchenActive = todayOrders.filter((order) => kitchenStatuses.includes(order.status as (typeof kitchenStatuses)[number])).length;

  return {
    deliveryActive,
    kitchenActive,
    operationalTotal: pendingReview + tableActive + deliveryActive + pickupActive,
    pendingReview,
    pickupActive,
    tableActive,
  };
}

export function useLiveOrderCounts({
  enabled = true,
  initialOrders = [],
  restaurantId,
}: {
  enabled?: boolean;
  initialOrders?: Order[];
  restaurantId?: string;
}) {
  const channelId = useId().replaceAll(":", "");
  const initialCounts = useMemo(() => countsFromOrders(initialOrders), [initialOrders]);
  const [counts, setCounts] = useState<LiveOrderCounts>(initialCounts);

  const refreshCounts = useCallback(async () => {
    if (!enabled || !restaurantId) {
      setCounts(emptyCounts);
      return;
    }

    const since = startOfBusinessDayIso();
    const supabase = createClient();
    const { data, error } = await supabase
      .from("orders")
      .select("created_at,order_type,status")
      .eq("restaurant_id", restaurantId)
      .gte("created_at", since)
      .in("status", activeStatuses);

    if (error) return;

    setCounts(countsFromOrders((data ?? []).map((order) => ({
      createdAt: order.created_at,
      orderType: order.order_type,
      status: order.status,
    }))));
  }, [enabled, restaurantId]);

  useEffect(() => {
    const timer = window.setTimeout(() => setCounts(initialCounts), 0);
    return () => window.clearTimeout(timer);
  }, [initialCounts]);

  useEffect(() => {
    if (!enabled || !restaurantId) return;

    let cancelled = false;
    const refreshSafely = () => {
      if (cancelled || document.visibilityState !== "visible") return;
      void refreshCounts();
    };

    refreshSafely();

    const supabase = createClient();
    const channel = supabase
      .channel(`yopido-order-counts-${restaurantId}-${channelId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          filter: `restaurant_id=eq.${restaurantId}`,
          schema: "public",
          table: "orders",
        },
        refreshSafely,
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          refreshSafely();
        }
      });

    const fallbackInterval = window.setInterval(refreshSafely, 60_000);
    window.addEventListener("focus", refreshSafely);
    document.addEventListener("visibilitychange", refreshSafely);

    return () => {
      cancelled = true;
      window.clearInterval(fallbackInterval);
      window.removeEventListener("focus", refreshSafely);
      document.removeEventListener("visibilitychange", refreshSafely);
      void supabase.removeChannel(channel);
    };
  }, [channelId, enabled, refreshCounts, restaurantId]);

  return counts;
}
