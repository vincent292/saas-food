"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { NewOrderSoundAlert } from "@/components/orders/NewOrderSoundAlert";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/types/order.types";

export function GlobalOrderSoundAlert({ restaurantId, orders }: { restaurantId: string; orders: Order[] }) {
  const router = useRouter();
  const refreshTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        router.refresh();
        refreshTimeoutRef.current = null;
      }, 250);
    };

    const supabase = createClient();
    const channel = supabase
      .channel(`admin-global-orders-${restaurantId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurantId}` }, refresh)
      .subscribe();

    const refreshOnFocus = () => {
      if (document.visibilityState === "visible") {
        refresh();
      }
    };

    window.addEventListener("focus", refreshOnFocus);
    document.addEventListener("visibilitychange", refreshOnFocus);

    return () => {
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      window.removeEventListener("focus", refreshOnFocus);
      document.removeEventListener("visibilitychange", refreshOnFocus);
      supabase.removeChannel(channel);
    };
  }, [restaurantId, router]);

  return (
    <NewOrderSoundAlert
      actionLabel="Ir a aprobar"
      className="fixed inset-x-3 bottom-20 z-[88] shadow-2xl sm:bottom-6 sm:left-auto sm:right-6 sm:max-w-xl"
      description="Hay un pedido nuevo esperando aprobacion. Entra a Pedidos para revisarlo y cobrarlo si corresponde."
      idleClassName="fixed bottom-20 right-3 z-[70] sm:bottom-6 sm:right-6"
      onOpenAlerts={() => router.push(`/admin/restaurantes/${restaurantId}/pedidos?tab=nuevos`)}
      orders={orders}
      title="Pedido nuevo"
      watchOrderTypes={["table", "delivery", "pickup"]}
    />
  );
}
