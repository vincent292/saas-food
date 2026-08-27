"use client";

import Link from "next/link";
import { Bell, CheckCircle2, CircleAlert, Clock3, Info, X } from "lucide-react";
import { useMemo, useState } from "react";
import { stopOrderAlertSound } from "@/lib/client/order-notification-sound";
import { useRestaurantRealtimeRefresh } from "@/lib/client/use-restaurant-realtime-refresh";
import { cn } from "@/lib/utils/cn";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import type { PanelNotification, PanelNotificationTone } from "@/types/notification.types";

function storageKey(scope: string) {
  return `yopido:panel-notifications-seen:${scope}`;
}

function readSeenIds(scope: string) {
  if (typeof window === "undefined") return new Set<string>();

  try {
    const raw = window.localStorage.getItem(storageKey(scope));
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids.filter((id) => typeof id === "string") : []);
  } catch {
    return new Set<string>();
  }
}

function toneClasses(tone: PanelNotificationTone) {
  if (tone === "success") return "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]";
  if (tone === "warning") return "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";
  if (tone === "danger") return "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]";
  return "bg-[var(--primary-light)] text-[var(--primary)]";
}

function ToneIcon({ tone }: { tone: PanelNotificationTone }) {
  if (tone === "success") return <CheckCircle2 className="h-4 w-4" />;
  if (tone === "warning" || tone === "danger") return <CircleAlert className="h-4 w-4" />;
  return <Info className="h-4 w-4" />;
}

export function PanelNotificationBell({
  notifications,
  restaurantId,
  scope,
}: {
  notifications: PanelNotification[];
  restaurantId?: string;
  scope: string;
}) {
  const [open, setOpen] = useState(false);
  const [seenIds, setSeenIds] = useState<Set<string>>(() => readSeenIds(scope));
  useRestaurantRealtimeRefresh({ enabled: Boolean(restaurantId), restaurantId, scope: "notifications" });

  const allNotifications = useMemo(() => {
    return [...notifications].sort((first, second) => second.createdAt.localeCompare(first.createdAt)).slice(0, 20);
  }, [notifications]);

  const unreadCount = allNotifications.filter((notification) => !seenIds.has(notification.id)).length;

  function markVisibleAsSeen() {
    const nextSeenIds = new Set([...seenIds, ...allNotifications.map((notification) => notification.id)]);
    setSeenIds(nextSeenIds);
    try {
      window.localStorage.setItem(storageKey(scope), JSON.stringify(Array.from(nextSeenIds).slice(-120)));
    } catch {
      // Local notification read state is optional.
    }
  }

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        stopOrderAlertSound(restaurantId);
        markVisibleAsSeen();
      }
      return next;
    });
  }

  function closeFromNotification() {
    stopOrderAlertSound(restaurantId);
    setOpen(false);
  }

  return (
    <div className="relative shrink-0">
      <button
        aria-label="Abrir notificaciones"
        className="relative grid h-11 w-11 place-items-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--color-body)] shadow-sm transition hover:bg-[var(--primary-light)] hover:text-[var(--primary)]"
        onClick={toggleOpen}
        type="button"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 grid min-h-5 min-w-5 place-items-center rounded-full bg-[var(--danger)] px-1.5 text-[10px] font-black text-white shadow-sm">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-[3.25rem] z-50 w-[min(92vw,24rem)] overflow-hidden rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] shadow-2xl">
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border)] p-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Notificaciones</p>
              <p className="mt-1 text-sm font-bold text-[var(--color-secondary-text)]">{allNotifications.length} aviso{allNotifications.length === 1 ? "" : "s"} activo{allNotifications.length === 1 ? "" : "s"}</p>
            </div>
            <button className="grid h-9 w-9 place-items-center rounded-full bg-[var(--color-neutral-100)] text-[var(--color-body)]" onClick={() => setOpen(false)} type="button">
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="admin-scrollbar max-h-[min(60dvh,25rem)] overflow-y-auto">
            {allNotifications.length ? (
              allNotifications.map((notification) => (
                <Link
                  className="grid min-h-20 grid-cols-[auto_minmax(0,1fr)] gap-3 border-b border-[var(--border)] p-3 transition last:border-b-0 hover:bg-[var(--color-surface)]"
                  href={notification.href}
                  key={notification.id}
                  onClick={closeFromNotification}
                  prefetch={false}
                >
                  <span className={cn("grid h-9 w-9 place-items-center rounded-full", toneClasses(notification.tone))}>
                    <ToneIcon tone={notification.tone} />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-black text-[var(--color-heading)]">{notification.title}</span>
                    <span className="mt-1 line-clamp-2 block text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">{notification.description}</span>
                    <span className="mt-2 inline-flex items-center gap-1 text-[11px] font-black uppercase text-[var(--muted)]">
                      <Clock3 className="h-3.5 w-3.5" />
                      {formatShortDate(notification.createdAt)} {formatShortTime(notification.createdAt)}
                    </span>
                  </span>
                </Link>
              ))
            ) : (
              <div className="p-5 text-center text-sm font-bold text-[var(--muted)]">Sin avisos por ahora.</div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
