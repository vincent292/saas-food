"use client";

import { useEffect, useRef } from "react";
import { createClient } from "@/lib/supabase/client";

type RealtimeBroadcastOptions = {
  enabled?: boolean;
  fallbackIntervalMs?: number;
  onChange: () => void;
  onSync?: () => void;
  topic: string;
};

export function useRealtimeBroadcast({
  enabled = true,
  fallbackIntervalMs = 60_000,
  onChange,
  onSync = onChange,
  topic,
}: RealtimeBroadcastOptions) {
  const connectedRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const onSyncRef = useRef(onSync);
  const changeTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    onSyncRef.current = onSync;
  }, [onChange, onSync]);

  useEffect(() => {
    if (!enabled || !topic) return;

    const scheduleChange = () => {
      if (changeTimeoutRef.current) {
        window.clearTimeout(changeTimeoutRef.current);
      }
      changeTimeoutRef.current = window.setTimeout(() => {
        onChangeRef.current();
        changeTimeoutRef.current = null;
      }, 200);
    };

    const syncIfVisible = () => {
      if (document.visibilityState === "visible") {
        onSyncRef.current();
      }
    };

    const supabase = createClient();
    const channel = supabase
      .channel(topic)
      .on("broadcast", { event: "changed" }, scheduleChange)
      .subscribe((status) => {
        connectedRef.current = status === "SUBSCRIBED";
        if (status === "SUBSCRIBED") {
          syncIfVisible();
        }
      });

    const fallbackInterval = window.setInterval(() => {
      if (!connectedRef.current) {
        syncIfVisible();
      }
    }, fallbackIntervalMs);

    window.addEventListener("focus", syncIfVisible);
    document.addEventListener("visibilitychange", syncIfVisible);

    return () => {
      connectedRef.current = false;
      if (changeTimeoutRef.current) {
        window.clearTimeout(changeTimeoutRef.current);
      }
      window.clearInterval(fallbackInterval);
      window.removeEventListener("focus", syncIfVisible);
      document.removeEventListener("visibilitychange", syncIfVisible);
      void supabase.removeChannel(channel);
    };
  }, [enabled, fallbackIntervalMs, topic]);
}
