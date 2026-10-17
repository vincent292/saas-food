"use client";
import { PendingActivityNotice } from "@/components/home/PendingActivityNotice";
export function RecoverOrderNotice({ restaurantId }: { restaurantId?: string }) {
  return <PendingActivityNotice restaurantId={restaurantId} />;
}
