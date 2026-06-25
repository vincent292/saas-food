"use client";

import { useEffect } from "react";
import { clearCart } from "@/lib/utils/cart";

export function ClearCartOnOrderSuccess({ enabled }: { enabled: boolean }) {
  useEffect(() => {
    if (enabled) {
      clearCart();
    }
  }, [enabled]);

  return null;
}
