"use client";

import { ChefHat, CheckCircle2, Clock, Flame, History, Maximize2, Minimize2, Printer, RefreshCw, Truck, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatusAction } from "@/app/admin/actions";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { elapsedLabel, kitchenStartDate, minutesSince, orderSourceLabel, paymentMethodLabels, timerTone } from "@/components/orders/orderPresentation";
import { printOrderTicket, type PrintFormat } from "@/components/orders/printOrder";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { formatShortTime } from "@/lib/utils/dates";
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderStatus } from "@/types/order.types";
import type { Restaurant, RestaurantSettings } from "@/types/restaurant.types";

type KitchenView = "operacion" | "historial";

export function KitchenBoardClient({
  restaurant,
  settings,
  orders,
}: {
  restaurant: Restaurant;
  settings: RestaurantSettings | null;
  orders: Order[];
}) {
  const router = useRouter();
  const [activeView, setActiveView] = useState<KitchenView>("operacion");
  const [now, setNow] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  const refreshTimeoutRef = useRef<number | null>(null);

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
        router.refresh();
        window.setTimeout(() => setIsRefreshing(false), 800);
        refreshTimeoutRef.current = null;
      }, 250);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`cocina-${restaurant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` }, refresh)
      .subscribe();

    return () => {
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
      router.refresh();
      window.setTimeout(() => setIsRefreshing(false), 800);
    };

    const interval = window.setInterval(refreshIfVisible, 5000);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [router]);

  const groups = useMemo(() => {
    const sortByTime = (left: Order, right: Order) => new Date(kitchenStartDate(left)).getTime() - new Date(kitchenStartDate(right)).getTime();
    return {
      cola: orders.filter((order) => order.status === "accepted").sort(sortByTime),
      preparando: orders.filter((order) => order.status === "preparing").sort(sortByTime),
      despacho: orders.filter((order) => order.status === "ready").sort(sortByTime),
      historial: orders.filter((order) => order.status === "delivered").slice(0, 40),
    };
  }, [orders]);

  const activeOrdersCount = groups.cola.length + groups.preparando.length + groups.despacho.length;

  return (
    <main className={cn("min-h-screen bg-[var(--background)] px-4 sm:px-6 lg:px-8", focusMode ? "py-3" : "py-6")}>
      <div className={cn("mx-auto space-y-6", focusMode ? "max-w-none" : "max-w-7xl")}>
        <section className={cn("flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between", focusMode && "hidden")}>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Cocina</p>
            <h1 className="text-3xl font-black text-[var(--text)]">{restaurant.name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Solo aparecen pedidos del dia aprobados por caja. Cocina prepara y marca listo; el despacho se maneja en Caja.</p>
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
          <KitchenSummary icon={<Clock className="h-5 w-5" />} label="En cola" value={groups.cola.length} />
          <KitchenSummary icon={<Flame className="h-5 w-5" />} label="Preparando" value={groups.preparando.length} />
          <KitchenSummary icon={<Truck className="h-5 w-5" />} label="Listos para despacho" value={groups.despacho.length} />
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
                defaultPrintFormat={settings?.printFormat ?? "thermal_80"}
                description="Pedidos aprobados, listos para iniciar."
                emptyDescription="Cuando caja apruebe pedidos apareceran aqui."
                emptyTitle="Sin pedidos en cola"
                icon={<Clock className="h-5 w-5" />}
                focusMode={focusMode}
                now={now}
                orders={groups.cola}
                restaurant={restaurant}
                tone="info"
                title="En cola"
              />
              <KitchenColumn
                defaultPrintFormat={settings?.printFormat ?? "thermal_80"}
                description="Pedidos que ya se estan preparando."
                emptyDescription="Al iniciar un pedido se movera a esta columna."
                emptyTitle="Nada en preparacion"
                icon={<Flame className="h-5 w-5" />}
                focusMode={focusMode}
                now={now}
                orders={groups.preparando}
                restaurant={restaurant}
                tone="warning"
                title="Preparando"
              />
              <KitchenColumn
                defaultPrintFormat={settings?.printFormat ?? "thermal_80"}
                description="Producto terminado; caja o despacho continuan."
                emptyDescription="Cuando cocina marque preparado aparecera aqui."
                emptyTitle="Nada listo"
                icon={<Truck className="h-5 w-5" />}
                focusMode={focusMode}
                now={now}
                orders={groups.despacho}
                restaurant={restaurant}
                tone="success"
                title="Listo para despacho"
              />
            </section>
          </div>
        ) : groups.historial.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {groups.historial.map((order) => (
              <KitchenCard defaultPrintFormat={settings?.printFormat ?? "thermal_80"} key={order.id} now={now} order={order} restaurant={restaurant} />
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
  restaurant,
  now,
  defaultPrintFormat,
}: {
  title: string;
  description: string;
  emptyTitle: string;
  emptyDescription: string;
  icon: ReactNode;
  focusMode: boolean;
  tone: "info" | "warning" | "success";
  orders: Order[];
  restaurant: Restaurant;
  now: Date;
  defaultPrintFormat: PrintFormat;
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
            <KitchenCard defaultPrintFormat={defaultPrintFormat} key={order.id} now={now} order={order} restaurant={restaurant} />
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
  restaurant,
  now,
  defaultPrintFormat,
}: {
  order: Order;
  restaurant: Restaurant;
  now: Date;
  defaultPrintFormat: PrintFormat;
}) {
  const elapsedMinutes = minutesSince(kitchenStartDate(order), now);
  const isReady = order.status === "ready";
  const isDelivered = order.status === "delivered";
  const tone = isReady || isDelivered ? { label: isDelivered ? "Completado" : "Preparado", className: "border-[var(--color-success-soft)] bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" } : timerTone(elapsedMinutes);
  const nextStatus = order.status === "accepted" ? "preparing" : order.status === "preparing" ? "ready" : null;
  const actionLabel = order.status === "accepted" ? "Iniciar preparacion" : "Producto terminado";

  return (
    <Card className={cn("overflow-hidden rounded-[1.15rem] p-0", elapsedMinutes >= 30 && order.status !== "ready" && order.status !== "delivered" && "border-[var(--color-danger-strong)]")}>
      <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-3", tone.className)}>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em]">{isReady ? "Terminado" : isDelivered ? "Historial" : "Tiempo"}</p>
          <p className="text-2xl font-black">{isReady ? (order.readyAt ? formatShortTime(order.readyAt) : "Listo") : isDelivered ? (order.deliveredAt ? formatShortTime(order.deliveredAt) : "Completado") : elapsedLabel(elapsedMinutes)}</p>
        </div>
        <span className="rounded-full bg-[var(--color-card-soft)] px-3 py-1 text-xs font-black text-[var(--color-heading)]">{tone.label}</span>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">Pedido {order.orderNumber}</p>
            <h2 className="text-xl font-black text-[var(--text)]">{orderSourceLabel(order)}</h2>
            <p className="mt-1 text-xs font-bold text-[var(--muted)]">{paymentMethodLabels[order.paymentMethod]}</p>
            {order.paymentReceiptReference ? <p className="mt-1 text-xs font-black text-[var(--color-body)]">Referencia: {order.paymentReceiptReference}</p> : null}
            {order.paymentReceiptUrl ? (
              <a className="mt-2 inline-flex rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-black text-[var(--color-body)]" href={order.paymentReceiptUrl} rel="noreferrer" target="_blank">
                Ver comprobante
              </a>
            ) : null}
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="space-y-2">
          {order.items.map((item) => (
            <div className="rounded-2xl bg-[var(--color-surface)] p-3" key={item.id}>
              <p className="font-black text-[var(--text)]">
                {item.quantity}x {item.productName}
              </p>
              {item.notes ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{item.notes}</p> : null}
            </div>
          ))}
        </div>

        {order.notes ? <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-semibold text-[var(--color-warning-strong)]">{order.notes}</p> : null}

        <div className="grid grid-cols-2 gap-2">
          <button className={buttonClasses("secondary", "min-h-10 px-3 text-xs")} onClick={() => printOrderTicket({ order, restaurantName: restaurant.name, format: defaultPrintFormat })} type="button">
            <Printer className="h-4 w-4" />
            Ticket
          </button>
          <button className={buttonClasses("secondary", "min-h-10 px-3 text-xs")} onClick={() => printOrderTicket({ order, restaurantName: restaurant.name, format: "large" })} type="button">
            <Printer className="h-4 w-4" />
            Grande
          </button>
        </div>

        {nextStatus ? (
          <form action={updateOrderStatusAction}>
            <input name="restaurantId" type="hidden" value={order.restaurantId} />
            <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
            <input name="orderId" type="hidden" value={order.id} />
            <input name="source" type="hidden" value="kitchen" />
            <Button className="min-h-12 w-full text-base font-black" name="status" type="submit" value={nextStatus as OrderStatus}>
              {order.status === "accepted" ? <ChefHat className="h-4 w-4" /> : order.status === "preparing" ? <Utensils className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {actionLabel}
            </Button>
          </form>
        ) : order.status === "ready" ? (
          <div className="rounded-2xl bg-[var(--primary-light)] p-3 text-center text-sm font-black text-[var(--primary-dark)]">
            Listo para caja/despacho
          </div>
        ) : (
          <div className="rounded-2xl bg-[var(--color-neutral-100)] p-3 text-center text-sm font-black text-[var(--color-body)]">
            En historial
          </div>
        )}
      </div>
    </Card>
  );
}
