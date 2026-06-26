"use client";

import { ChefHat, CheckCircle2, Clock, Flame, History, Printer, RefreshCw, Truck, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { updateOrderStatusAction } from "@/app/admin/actions";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { elapsedLabel, kitchenStartDate, minutesSince, orderSourceLabel, paymentMethodLabels, timerTone } from "@/components/orders/orderPresentation";
import { printOrderTicket, type PrintFormat } from "@/components/orders/printOrder";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { createClient } from "@/lib/supabase/client";
import type { Order, OrderStatus } from "@/types/order.types";
import type { Restaurant, RestaurantSettings } from "@/types/restaurant.types";

type KitchenTab = "cola" | "preparando" | "despacho" | "historial";

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
  const [activeTab, setActiveTab] = useState<KitchenTab>("cola");
  const [now, setNow] = useState(() => new Date());
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const refresh = () => {
      setIsRefreshing(true);
      router.refresh();
      window.setTimeout(() => setIsRefreshing(false), 800);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`cocina-${restaurant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_items" }, refresh)
      .subscribe();

    return () => {
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

  const visibleOrders = groups[activeTab];

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Cocina</p>
            <h1 className="text-3xl font-black text-[var(--text)]">{restaurant.name}</h1>
            <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">Solo aparecen pedidos aprobados. El contador inicia cuando recepcion aprueba el pedido.</p>
          </div>
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[var(--muted)] shadow-sm">
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin text-[var(--primary)]")} />
            {isRefreshing ? "Actualizando" : "En vivo"}
          </div>
        </section>

        <section className="grid gap-3 md:grid-cols-4">
          <KitchenSummary icon={<Clock className="h-5 w-5" />} label="En cola" value={groups.cola.length} />
          <KitchenSummary icon={<Flame className="h-5 w-5" />} label="Preparando" value={groups.preparando.length} />
          <KitchenSummary icon={<Truck className="h-5 w-5" />} label="Listos para despacho" value={groups.despacho.length} />
          <KitchenSummary icon={<History className="h-5 w-5" />} label="Historial" value={groups.historial.length} />
        </section>

        <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-white p-2 shadow-sm">
          <KitchenTabButton active={activeTab === "cola"} count={groups.cola.length} label="En cola" onClick={() => setActiveTab("cola")} />
          <KitchenTabButton active={activeTab === "preparando"} count={groups.preparando.length} label="Preparando" onClick={() => setActiveTab("preparando")} />
          <KitchenTabButton active={activeTab === "despacho"} count={groups.despacho.length} label="Listo para despacho" onClick={() => setActiveTab("despacho")} />
          <KitchenTabButton active={activeTab === "historial"} count={groups.historial.length} label="Historial" onClick={() => setActiveTab("historial")} />
        </div>

        {visibleOrders.length ? (
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {visibleOrders.map((order) => (
              <KitchenCard
                defaultPrintFormat={settings?.printFormat ?? "thermal_80"}
                key={order.id}
                now={now}
                order={order}
                restaurant={restaurant}
              />
            ))}
          </section>
        ) : (
          <EmptyState title="Sin pedidos en esta etapa" description="Cuando recepcion apruebe o cocina avance pedidos apareceran aqui." />
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

function KitchenTabButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button className={cn("h-11 shrink-0 rounded-full px-4 text-sm font-black", active ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-[var(--primary-light)]")} onClick={onClick} type="button">
      {label} ({count})
    </button>
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
  const tone = timerTone(elapsedMinutes);
  const nextStatus = order.status === "accepted" ? "preparing" : order.status === "preparing" ? "ready" : order.status === "ready" ? "delivered" : null;
  const actionLabel = order.status === "accepted" ? "Iniciar" : order.status === "preparing" ? "Marcar preparado" : "Despachar";

  return (
    <Card className={cn("overflow-hidden rounded-[1.25rem] p-0", elapsedMinutes >= 20 && order.status !== "ready" && "border-red-200")}>
      <div className={cn("flex items-center justify-between gap-3 border-b px-4 py-3", tone.className)}>
        <div>
          <p className="text-xs font-black uppercase tracking-[0.12em]">Tiempo</p>
          <p className="text-2xl font-black">{elapsedLabel(elapsedMinutes)}</p>
        </div>
        <span className="rounded-full bg-white/70 px-3 py-1 text-xs font-black text-slate-900">{tone.label}</span>
      </div>

      <div className="space-y-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">Pedido {order.orderNumber}</p>
            <h2 className="text-xl font-black text-[var(--text)]">{orderSourceLabel(order)}</h2>
            <p className="mt-1 text-xs font-bold text-[var(--muted)]">{paymentMethodLabels[order.paymentMethod]}</p>
            {order.paymentReceiptReference ? <p className="mt-1 text-xs font-black text-slate-700">Referencia: {order.paymentReceiptReference}</p> : null}
            {order.paymentReceiptUrl ? (
              <a className="mt-2 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700" href={order.paymentReceiptUrl} rel="noreferrer" target="_blank">
                Ver comprobante
              </a>
            ) : null}
          </div>
          <OrderStatusBadge status={order.status} />
        </div>

        <div className="space-y-2">
          {order.items.map((item) => (
            <div className="rounded-2xl bg-slate-50 p-3" key={item.id}>
              <p className="font-black text-[var(--text)]">
                {item.quantity}x {item.productName}
              </p>
              {item.notes ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{item.notes}</p> : null}
            </div>
          ))}
        </div>

        {order.notes ? <p className="rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{order.notes}</p> : null}

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
            <Button className="w-full" name="status" type="submit" value={nextStatus as OrderStatus}>
              {order.status === "accepted" ? <ChefHat className="h-4 w-4" /> : order.status === "preparing" ? <Utensils className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
              {actionLabel}
            </Button>
          </form>
        ) : (
          <div className="rounded-2xl bg-[var(--primary-light)] p-3 text-center text-sm font-black text-[var(--primary-dark)]">Pedido despachado</div>
        )}
      </div>
    </Card>
  );
}
