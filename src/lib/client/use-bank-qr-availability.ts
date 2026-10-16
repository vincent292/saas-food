"use client";
import { useEffect, useState } from "react";
export function useBankQrAvailability(restaurantId: string) {
  const [result, setResult] = useState<{ id: string; available: boolean } | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/payments/baneco/availability?restaurantId=${encodeURIComponent(restaurantId)}`, { cache: "no-store", signal: controller.signal })
      .then(async response => { if (response.ok) { const data = await response.json(); setResult({ id: restaurantId, available: data.available === true }); } }).catch(() => {});
    return () => controller.abort();
  }, [restaurantId]);
  return result?.id === restaurantId && result.available;
}
