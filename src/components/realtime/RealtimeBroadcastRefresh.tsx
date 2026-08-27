"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useRealtimeBroadcast } from "@/lib/client/use-realtime-broadcast";

export function RealtimeBroadcastRefresh({ enabled = true, topic }: { enabled?: boolean; topic: string }) {
  const router = useRouter();
  const refresh = useCallback(() => router.refresh(), [router]);

  useRealtimeBroadcast({ enabled, onChange: refresh, onSync: refresh, topic });

  return null;
}
