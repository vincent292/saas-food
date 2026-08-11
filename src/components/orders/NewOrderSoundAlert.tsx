"use client";

import { BellRing, Eye, Volume2, VolumeX } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import type { Order, OrderType } from "@/types/order.types";

const ORDER_ALERT_AUDIO_SRC = "/notificaciones/notificaiones.mp3";

function sameOrderIds(left: Order[], right: Order[]) {
  return left.length === right.length && left.every((order, index) => order.id === right[index]?.id);
}

export function NewOrderSoundAlert({
  orders,
  title = "Pedido nuevo",
  description = "Hay pedidos nuevos esperando revision.",
  watchOrderTypes,
  onOpenAlerts,
  actionLabel = "Ver pedidos",
  className,
  idleClassName,
}: {
  orders: Order[];
  title?: string;
  description?: string;
  watchOrderTypes?: OrderType[];
  onOpenAlerts?: (orders: Order[]) => void;
  actionLabel?: string;
  className?: string;
  idleClassName?: string;
}) {
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [soundBlocked, setSoundBlocked] = useState(false);
  const [unseenOrders, setUnseenOrders] = useState<Order[]>([]);
  const [soundRequestId, setSoundRequestId] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const knownOrderIdsRef = useRef<Set<string> | null>(null);
  const unseenOrdersRef = useRef<Order[]>([]);
  const soundUnlockedRef = useRef(false);
  const unlockingRef = useRef(false);

  const ensureAudio = useCallback(() => {
    if (!audioRef.current) {
      audioRef.current = new Audio(ORDER_ALERT_AUDIO_SRC);
      audioRef.current.preload = "auto";
      audioRef.current.volume = 0.78;
    }
    return audioRef.current;
  }, []);

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
    if (incomingOrders.length) {
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

  const enableSound = useCallback(async () => {
    if (unlockingRef.current) {
      return;
    }

    unlockingRef.current = true;
    const audio = ensureAudio();
    setSoundEnabled(true);
    setSoundBlocked(false);

    try {
      const previousVolume = audio.volume;
      audio.volume = 0.01;
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.volume = previousVolume;
      soundUnlockedRef.current = true;
      setSoundBlocked(false);
    } catch {
      setSoundBlocked(true);
    } finally {
      unlockingRef.current = false;
    }
  }, [ensureAudio]);

  useEffect(() => {
    const unlockFromUserGesture = () => {
      if (soundUnlockedRef.current) {
        return;
      }
      void enableSound();
    };

    window.addEventListener("pointerdown", unlockFromUserGesture, { passive: true });
    window.addEventListener("touchstart", unlockFromUserGesture, { passive: true });
    window.addEventListener("keydown", unlockFromUserGesture);

    return () => {
      window.removeEventListener("pointerdown", unlockFromUserGesture);
      window.removeEventListener("touchstart", unlockFromUserGesture);
      window.removeEventListener("keydown", unlockFromUserGesture);
    };
  }, [enableSound]);

  useEffect(() => {
    if (!soundRequestId || !soundEnabled) {
      return;
    }

    let cancelled = false;
    const audio = ensureAudio();
    audio.currentTime = 0;
    void audio.play().then(
      () => {
        if (cancelled) {
          return;
        }
        soundUnlockedRef.current = true;
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
    unseenOrdersRef.current = [];
    setUnseenOrders([]);
  }

  function openAlerts() {
    const ordersToOpen = unseenOrdersRef.current;
    acknowledge();
    onOpenAlerts?.(ordersToOpen);
  }

  if (!unseenOrders.length) {
    return (
      <div className={cn("flex justify-end", idleClassName)}>
        <button
          className={buttonClasses(
            "secondary",
            cn("min-h-9 px-3 text-xs", soundEnabled && !soundBlocked ? "text-[var(--color-success-strong)]" : "text-[var(--muted)]"),
          )}
          onClick={enableSound}
          type="button"
        >
          {soundEnabled && !soundBlocked ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
          {soundEnabled && !soundBlocked ? "Sonido activo" : "Sonido pendiente"}
        </button>
      </div>
    );
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
          <p className="mt-1 text-sm font-bold leading-5">{soundBlocked ? "El navegador bloqueo el audio hasta la primera interaccion. Toca el panel una vez." : description}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {!soundEnabled || soundBlocked ? (
          <button className={buttonClasses("secondary", "bg-[var(--surface)]")} onClick={enableSound} type="button">
            <Volume2 className="h-4 w-4" />
            Probar sonido
          </button>
        ) : null}
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
