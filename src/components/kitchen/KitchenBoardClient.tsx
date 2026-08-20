"use client";

import { AlertTriangle, Clock, History, Maximize2, Minimize2, RefreshCw, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  READY_PICKUP_WARNING_MINUTES,
  elapsedLabel,
  groupKitchenOrderItems,
  groupReceiptLinksFromNotes,
  kitchenDueDate,
  kitchenStartDate,
  minutesSince,
  minutesUntil,
} from "@/components/orders/orderPresentation";
import { ReceiptViewerButton } from "@/components/payments/ReceiptViewerButton";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/types/order.types";
import type { Restaurant } from "@/types/restaurant.types";

type KitchenView = "operacion" | "historial";

function KitchenReceiptControls({ order }: { order: Order }) {
  const groupReceipts = groupReceiptLinksFromNotes(order.notes);

  if (!order.paymentReceiptUrl && !groupReceipts.length) {
    return null;
  }

  return (
    <div className="mt-2 grid gap-2">
      {order.paymentReceiptUrl ? <ReceiptViewerButton label="Comprobante final" receiptLabel={`Comprobante final ${order.orderNumber}`} url={order.paymentReceiptUrl} /> : null}
      {groupReceipts.map((receipt) => (
        <ReceiptViewerButton key={`${receipt.label}-${receipt.url}`} label={receipt.label} receiptLabel={`Comprobante de ${receipt.label}`} subtitle={order.orderNumber} url={receipt.url} />
      ))}
    </div>
  );
}

export function KitchenBoardClient({
  restaurant,
  orders,
}: {
  restaurant: Restaurant;
  orders: Order[];
}) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<KitchenView>("operacion");
  const [now, setNow] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const refreshTimeoutRef = useRef<number | null>(null);
  const realtimeConnectedRef = useRef(false);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        setIsRefreshing(true);
        lastRefreshAtRef.current = Date.now();
        router.refresh();
        window.setTimeout(() => setIsRefreshing(false), 800);
        refreshTimeoutRef.current = null;
      }, 250);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`cocina-${restaurant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` }, refresh)
      .subscribe((status) => {
        realtimeConnectedRef.current = status === "SUBSCRIBED";
      });

    return () => {
      realtimeConnectedRef.current = false;
      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }
      supabase.removeChannel(channel);
    };
  }, [restaurant.id, router]);

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }
      setIsRefreshing(true);
      lastRefreshAtRef.current = Date.now();
      router.refresh();
      window.setTimeout(() => setIsRefreshing(false), 800);
    };

    const refreshFallback = () => {
      if (realtimeConnectedRef.current && Date.now() - lastRefreshAtRef.current < 120000) return;
      refreshIfVisible();
    };

    const interval = window.setInterval(refreshFallback, 30000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  const groups = useMemo(() => {
    const activeOrders = orders.filter((order) => order.status === "accepted" || order.status === "preparing");
    const sortByDueTime = (left: Order, right: Order) => kitchenDueDate(left).getTime() - kitchenDueDate(right).getTime();
    const sortByReadyTime = (left: Order, right: Order) => new Date(left.readyAt ?? kitchenStartDate(left)).getTime() - new Date(right.readyAt ?? kitchenStartDate(right)).getTime();
    return {
      cocina: activeOrders.filter((order) => minutesUntil(kitchenDueDate(order), now) > 0).sort(sortByDueTime),
      vencidos: activeOrders.filter((order) => minutesUntil(kitchenDueDate(order), now) <= 0).sort(sortByDueTime),
      despacho: orders.filter((order) => order.status === "ready").sort(sortByReadyTime),
      historial: orders.filter((order) => order.status === "delivered").slice(0, 40),
    };
  }, [now, orders]);

  const activeOrdersCount = groups.cocina.length + groups.vencidos.length + groups.despacho.length;

  return (
    <main className={cn("min-h-screen bg-[var(--background)] px-4 sm:px-6 lg:px-8", focusMode ? "py-3" : "py-6")}>
      <div className={cn("mx-auto space-y-6", focusMode ? "max-w-none" : "max-w-7xl")}>
        <section className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", focusMode && "hidden")}>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Cocina</p>
            <h1 className="text-3xl font-black text-[var(--text)]">{restaurant.name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Pantalla pasiva para cocina: prepara mirando tiempos y avisa el numero de pedido; caja o despacho actualizan listo y entregado.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[var(--primary)] px-4 text-sm font-black text-[var(--color-on-primary)] shadow-sm"
              onClick={() => {
                setActiveView("operacion");
                setFocusMode(true);
              }}
              type="button"
            >
              <Maximize2 className="h-4 w-4" />
              Pantalla grande
            </button>
            <div className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-black text-[var(--muted)] shadow-sm">
              <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin text-[var(--primary)]")} />
              {isRefreshing ? "Actualizando" : "En vivo"}
            </div>
          </div>
        </section>

        {focusMode ? (
          <section className="flex items-center justify-between gap-3 rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Cocina en pantalla grande</p>
              <p className="truncate text-lg font-black text-[var(--text)]">{restaurant.name}</p>
            </div>
            <button className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full border border-[var(--border)] px-4 text-sm font-black text-[var(--text)]" onClick={() => setFocusMode(false)} type="button">
              <Minimize2 className="h-4 w-4" />
              Salir
            </button>
          </section>
        ) : null}

        <section className={cn("grid grid-cols-2 gap-3 lg:grid-cols-4", focusMode && "hidden")}>
          <KitchenSummary icon={<Clock className="h-5 w-5" />} label="En cocina" value={groups.cocina.length} />
          <KitchenSummary icon={<AlertTriangle className="h-5 w-5" />} label="Tiempo cumplido" value={groups.vencidos.length} />
          <KitchenSummary icon={<Truck className="h-5 w-5" />} label="Preparados" value={groups.despacho.length} />
          <KitchenSummary icon={<History className="h-5 w-5" />} label="Historial" value={groups.historial.length} />
        </section>

        <div className={cn("flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm", focusMode && "hidden")}>
          <KitchenViewButton active={activeView === "operacion"} count={activeOrdersCount} label="Operacion" onClick={() => setActiveView("operacion")} />
          <KitchenViewButton active={activeView === "historial"} count={groups.historial.length} label="Historial" onClick={() => setActiveView("historial")} />
        </div>

        {activeView === "operacion" ? (
          <div className="-mx-4 overflow-x-auto overscroll-x-contain px-4 pb-3 scroll-px-4 [scrollbar-width:thin] sm:-mx-6 sm:px-6 sm:scroll-px-6 lg:-mx-8 lg:px-8 lg:scroll-px-8 xl:mx-0 xl:overflow-visible xl:px-0">
            <section className="flex w-max snap-x snap-mandatory gap-4 touch-pan-x xl:grid xl:w-auto xl:grid-cols-3 xl:snap-none">
              <KitchenColumn
                description="Pedidos aprobados, contando contra su tiempo estimado."
                emptyDescription="Cuando caja apruebe pedidos apareceran aqui automaticamente."
                emptyTitle="Sin pedidos activos"
                icon={<Clock className="h-5 w-5" />}
                focusMode={focusMode}
                now={now}
                orders={groups.cocina}
                tone="info"
                title="En cocina"
              />
              <KitchenColumn
                description="Ya paso la meta; mantener visible hasta que caja lo marque listo."
                emptyDescription="Los pedidos dentro de tiempo no necesitan atencion extra."
                emptyTitle="Nada vencido"
                icon={<AlertTriangle className="h-5 w-5" />}
                focusMode={focusMode}
                now={now}
                orders={groups.vencidos}
                tone="danger"
                title="Tiempo cumplido"
              />
              <KitchenColumn
                description="Marcados listos desde caja/despacho; vigilar si nadie recoge."
                emptyDescription="Cuando caja marque un pedido listo aparecera aqui."
                emptyTitle="Nada listo"
                icon={<Truck className="h-5 w-5" />}
                focusMode={focusMode}
                now={now}
                orders={groups.despacho}
                tone="success"
                title="Listo para despacho"
              />
            </section>
          </div>
        ) : groups.historial.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.historial.map((order) => (
              <KitchenCard key={order.id} now={now} order={order} />
            ))}
          </section>
        ) : (
          <EmptyState title="Sin historial" description="Los pedidos despachados o completados saldran de la operacion y apareceran aqui." />
        )}
      </div>
    </main>
  );
}

function KitchenSummary({ label, value, icon }: { label: string; value: number; icon: ReactNode }) {
  return (
    <Card className="flex items-center justify-between rounded-[1.25rem]">
      <div>
        <p className="text-sm font-semibold text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-3xl font-black text-[var(--text)]">{value}</p>
      </div>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
    </Card>
  );
}

function KitchenViewButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button className={cn("h-11 shrink-0 rounded-full px-4 text-sm font-black", active ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "text-[var(--muted)] hover:bg-[var(--primary-light)]")} onClick={onClick} type="button">
      {label} ({count})
    </button>
  );
}

function KitchenColumn({
  title,
  description,
  emptyTitle,
  emptyDescription,
  icon,
  focusMode,
  tone,
  orders,
  now,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: ReactNode;
  focusMode: boolean;
  tone: "info" | "warning" | "success" | "danger";
  orders: Order[];
  now: Date;
}) {
  return (
    <section
      className={cn(
        "min-h-[28rem] w-[86vw] min-w-[19rem] max-w-[25rem] shrink-0 snap-start overflow-y-auto overscroll-contain rounded-[1.35rem] border border-[var(--border)] bg-[var(--color-surface)] p-3 shadow-[var(--shadow-card)] [scrollbar-width:thin] sm:w-[21rem] xl:w-auto xl:max-w-none",
        focusMode ? "max-h-[calc(100vh-7rem)] xl:max-h-[calc(100vh-7rem)]" : "max-h-[calc(100vh-18rem)] xl:max-h-none xl:min-h-0 xl:overflow-visible",
      )}
    >
      <div className="sticky top-0 z-10 mb-3 rounded-[1.1rem] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm xl:static xl:shadow-none">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-lg font-black leading-tight text-[var(--text)]">{title}</p>
            <p className="mt-1 text-xs font-semibold leading-5 text-[var(--muted)]">{description}</p>
          </div>
          <span
            className={cn(
              "grid h-11 w-11 shrink-0 place-items-center rounded-2xl",
              tone === "success" && "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]",
              tone === "warning" && "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
              tone === "danger" && "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]",
              tone === "info" && "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]",
            )}
          >
            {icon}
          </span>
        </div>
        <div className="mt-3 rounded-full bg-[var(--primary-light)] px-3 py-1 text-center text-xs font-black text-[var(--primary)]">
          {orders.length} pedidos
        </div>
      </div>

      {orders.length ? (
        <div className="grid gap-3">
          {orders.map((order) => (
            <KitchenCard key={order.id} now={now} order={order} />
          ))}
        </div>
      ) : (
        <div className="rounded-[1.1rem] border border-dashed border-[var(--border)] bg-[var(--surface)] p-5">
          <p className="text-sm font-black text-[var(--text)]">{emptyTitle}</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--muted)]">{emptyDescription}</p>
        </div>
      )}
    </section>
  );
}

function KitchenCard({
  order,
  now,
}: {
  order: Order;
  now: Date;
}) {
  const dueAt = kitchenDueDate(order);
  const remainingMinutes = minutesUntil(dueAt, now);
  const isReady = order.status === "ready";
  const isDelivered = order.status === "delivered";
  const readyWaitMinutes = isReady ? minutesSince(order.readyAt ?? kitchenStartDate(order), now) : 0;
  const readyWaitingTooLong = isReady && readyWaitMinutes >= READY_PICKUP_WARNING_MINUTES;
  const isOverdue = !isReady && !isDelivered && remainingMinutes <= 0;
  const groupedItems = useMemo(() => groupKitchenOrderItems(order.items), [order.items]);
  const tone = kitchenCardTone({
    isDelivered,
    isOverdue,
    isReady,
    readyWaitingTooLong,
    readyWaitMinutes,
    remainingMinutes,
  });

  return (
    <Card className={cn("overflow-hidden rounded-[1rem] p-0", (isOverdue || readyWaitingTooLong) && "border-[var(--color-danger-strong)]")}>
      <div className="border-b border-[var(--border)] bg-[var(--surface)] px-3 py-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">Pedido</p>
            <h2 className="truncate text-3xl font-black leading-none text-[var(--text)]">{order.orderNumber}</h2>
          </div>
          <span className={cn("shrink-0 rounded-full border px-2.5 py-1 text-xs font-black", tone.className)}>
            {tone.value}
          </span>
        </div>
      </div>

      <div className="space-y-2 p-3">
        <div className="space-y-1.5">
          {groupedItems.map((item) => (
            <div className="rounded-xl bg-[var(--color-surface)] px-2.5 py-2" key={item.productName}>
              <div className="flex items-start gap-2">
                <span className="grid h-7 min-w-7 shrink-0 place-items-center rounded-lg bg-[var(--primary)] px-1 text-sm font-black text-[var(--color-on-primary)]">{item.quantity}x</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start justify-between gap-2">
                    <p className="break-words text-sm font-black leading-5 text-[var(--text)]">{item.productName}</p>
                    <span className="shrink-0 rounded-full bg-[var(--surface)] px-2 py-0.5 text-[10px] font-black text-[var(--muted)]">{item.prepMinutes} min</span>
                  </div>
                  {item.details.length ? (
                    <div className="mt-1 grid gap-0.5">
                      {item.details.map((detail) => (
                        <p className="text-xs font-bold leading-4 text-[var(--muted)]" key={detail.label}>
                          {detail.quantity}x {detail.label}
                        </p>
                      ))}
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>

        {order.paymentReceiptUrl || groupReceiptLinksFromNotes(order.notes).length ? (
          <details className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2">
            <summary className="cursor-pointer text-xs font-black text-[var(--muted)]">Comprobantes</summary>
            <KitchenReceiptControls order={order} />
          </details>
        ) : null}
      </div>
    </Card>
  );
}

function kitchenCardTone({
  isDelivered,
  isOverdue,
  isReady,
  readyWaitingTooLong,
  readyWaitMinutes,
  remainingMinutes,
}: {
  isDelivered: boolean;
  isOverdue: boolean;
  isReady: boolean;
  readyWaitingTooLong: boolean;
  readyWaitMinutes: number;
  remainingMinutes: number;
}) {
  if (isDelivered) {
    return {
      eyebrow: "Historial",
      label: "Completado",
      value: "Cerrado",
      className: "border-[var(--color-neutral-100)] bg-[var(--color-neutral-100)] text-[var(--color-body)]",
    };
  }

  if (readyWaitingTooLong) {
    return {
      eyebrow: "Sin recoger",
      label: "Atencion",
      value: `+${elapsedLabel(readyWaitMinutes)}`,
      className: "border-[var(--color-danger-strong)] bg-[var(--color-danger-strong)] text-[var(--color-on-primary)]",
    };
  }

  if (isReady) {
    return {
      eyebrow: "Preparado",
      label: "Esperando",
      value: "Listo",
      className: "border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]",
    };
  }

  if (isOverdue) {
    return {
      eyebrow: "Tiempo cumplido",
      label: "Rojo",
      value: `+${elapsedLabel(Math.abs(remainingMinutes))}`,
      className: "border-[var(--color-danger-strong)] bg-[var(--color-danger-strong)] text-[var(--color-on-primary)]",
    };
  }

  if (remainingMinutes <= 3) {
    return {
      eyebrow: "Por salir",
      label: "Atento",
      value: `${Math.max(remainingMinutes, 1)} min`,
      className: "border-[var(--color-warning-soft)] bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]",
    };
  }

  return {
    eyebrow: "En cocina",
    label: "En tiempo",
    value: `${remainingMinutes} min`,
    className: "border-[var(--color-info-soft)] bg-[var(--color-info-soft)] text-[var(--color-info-strong)]",
  };
}
