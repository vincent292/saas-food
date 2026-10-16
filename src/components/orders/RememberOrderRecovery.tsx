"use client";
import { useEffect } from "react";
import { markOrderRecovered } from "@/lib/client/order-recovery";
export function RememberOrderRecovery({ requestId, terminal }: { requestId?: string | null; terminal: boolean }) {
  useEffect(() => {
    if (requestId) { try { markOrderRecovered(requestId, terminal); } catch { /* Tracking URL and server lookup remain usable. */ } }
  }, [requestId, terminal]);
  return null;
}
