"use client";

import { useEffect } from "react";
import { clearCart } from "@/lib/utils/cart";

export function ClearCartOnOrderSuccess({ enabled, restaurantSlug }: { enabled: boolean; restaurantSlug?: string }) {
  useEffect(() => {
    if (enabled) {
      clearCart(restaurantSlug);
    }
  }, [enabled, restaurantSlug]);

  return null;
}
