"use client";

import { BellRing, Eye } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import {
  ORDER_ALERT_AUDIO_SRC,
  ORDER_ALERT_SOUND_CHANGE_EVENT,
  ORDER_ALERT_SOUND_STOP_EVENT,
  readOrderAlertSoundEnabled,
} from "@/lib/client/order-notification-sound";
import { cn } from "@/lib/utils/cn";
import type { Order, OrderType } from "@/types/order.types";

function sameOrderIds(left: Order[], right: Order[]) {
  return left.length === right.length && left.every((order, index) => order.id === right[index]?.id);
}

export function NewOrderSoundAlert({
  restaurantId,
  orders,
  title = "Pedido nuevo",
  description = "Hay pedidos nuevos esperando revision.",
  watchOrderTypes,
  onOpenAlerts,
  actionLabel = "Ver pedidos",
  className,
}: {
  restaurantId: string;
  orders: Order[];
  title?: string;
  description?: string;
  watchOrderTypes?: OrderType[];
  onOpenAlerts?: (orders: Order[]) => void;
  actionLabel?: string;
  className?: string;
}) {
  const [soundEnabled, setSoundEnabled] = useState(() => readOrderAlertSoundEnabled(restaurantId));
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [unseenOrders, setUnseenOrders] = useState<Order[]>([]);
  const [soundRequestId, setSoundRequestId] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const soundEnabledRef = useRef(soundEnabled);
  const unseenOrdersRef = useRef<Order[]>([]);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(ORDER_ALERT_AUDIO_SRC);
      audioRef.current.loop = false;
      audioRef.current.preload = "auto";
      audioRef.current.volume = 0.78;
    }
    return audioRef.current;
  }, []);

  const stopSound = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    audio.pause();
    audio.currentTime = 0;
  }, []);

  useEffect(() => {
    const syncSoundPreference = (event: Event) => {
      const detail = (event as CustomEvent<{ restaurantId?: string; enabled?: boolean }>).detail;
      if (detail?.restaurantId !== restaurantId || typeof detail.enabled !== "boolean") {
        return;
      }

      setSoundEnabled(detail.enabled);
      soundEnabledRef.current = detail.enabled;
      if (!detail.enabled) {
        stopSound();
        setSoundBlocked(false);
      }
    };

    const stopFromNotification = (event: Event) => {
      const detail = (event as CustomEvent<{ restaurantId?: string }>).detail;
      if (!detail?.restaurantId || detail.restaurantId === restaurantId) {
        stopSound();
      }
    };

    window.addEventListener(ORDER_ALERT_SOUND_CHANGE_EVENT, syncSoundPreference);
    window.addEventListener(ORDER_ALERT_SOUND_STOP_EVENT, stopFromNotification);
    return () => {
      window.removeEventListener(ORDER_ALERT_SOUND_CHANGE_EVENT, syncSoundPreference);
      window.removeEventListener(ORDER_ALERT_SOUND_STOP_EVENT, stopFromNotification);
      stopSound();
    };
  }, [restaurantId, stopSound]);

  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  const alertCandidates = useMemo(
    () =>
      orders.filter((order) => {
        if (order.status !== "pending") {
          return false;
        }
        return watchOrderTypes?.length ? watchOrderTypes.includes(order.orderType) : true;
      }),
    [orders, watchOrderTypes],
  );

  useEffect(() => {
    const candidateIds = new Set(alertCandidates.map((order) => order.id));

    if (!knownOrderIdsRef.current) {
      knownOrderIdsRef.current = candidateIds;
      return;
    }

    const knownOrderIds = knownOrderIdsRef.current;
    const incomingOrders = alertCandidates.filter((order) => !knownOrderIds.has(order.id));
    alertCandidates.forEach((order) => knownOrderIds.add(order.id));
    if (incomingOrders.length && soundEnabledRef.current) {
      setSoundRequestId((current) => current + 1);
    }

    const stillPending = unseenOrdersRef.current.filter((order) => candidateIds.has(order.id));
    const nextUnseen = [...stillPending, ...incomingOrders].filter((order, index, list) => list.findIndex((item) => item.id === order.id) === index);

    if (sameOrderIds(unseenOrdersRef.current, nextUnseen)) {
      return;
    }

    unseenOrdersRef.current = nextUnseen;
    setUnseenOrders(nextUnseen);
  }, [alertCandidates]);

  useEffect(() => {
    if (!soundRequestId || !soundEnabled) {
      return;
    }

    let cancelled = false;
    const audio = ensureAudio();
    if (!audio.paused && !audio.ended) {
      return;
    }

    audio.currentTime = 0;
    void audio.play().then(
      () => {
        if (cancelled) {
          return;
        }
        setSoundBlocked(false);
      },
      () => {
        if (!cancelled) {
          setSoundBlocked(true);
        }
      },
    );

    return () => {
      cancelled = true;
    };
  }, [ensureAudio, soundEnabled, soundRequestId]);

  function acknowledge() {
    stopSound();
    unseenOrdersRef.current = [];
    setUnseenOrders([]);
  }

  function openAlerts() {
    const ordersToOpen = unseenOrdersRef.current;
    acknowledge();
    onOpenAlerts?.(ordersToOpen);
  }

  if (!unseenOrders.length) {
    return null;
  }

  return (
    <div className={cn("flex flex-col gap-3 rounded-[1.25rem] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-[var(--color-warning-strong)] shadow-sm lg:flex-row lg:items-center lg:justify-between", className)}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--surface)]">
          <BellRing className="h-5 w-5 animate-pulse" />
        </span>
        <div className="min-w-0">
          <p className="text-base font-black">
            {title}: {unseenOrders.length}
          </p>
          <p className="mt-1 text-sm font-bold leading-5">{soundBlocked ? "El navegador bloqueo el audio. Habilitalo en Configuracion > Notificaciones." : description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <button className={buttonClasses("primary")} onClick={openAlerts} type="button">
          <Eye className="h-4 w-4" />
          {actionLabel}
        </button>
        <button className={buttonClasses("ghost")} onClick={acknowledge} type="button">
          Ya lo vi
        </button>
      </div>
    </div>
  );
}
