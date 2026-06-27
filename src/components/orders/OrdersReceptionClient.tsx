"use client";

import { CheckCircle2, Clock, Printer, RefreshCw, Truck } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PendingOrderReviewCard } from "@/components/orders/PendingOrderReviewCard";
import { elapsedLabel, minutesSince, orderSourceLabel, orderStatusLabels, orderTypeLabels, paymentMethodLabels } from "@/components/orders/orderPresentation";
import { printOrderTicket, type PrintFormat } from "@/components/orders/printOrder";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { createClient } from "@/lib/supabase/client";
import type { Order } from "@/types/order.types";
import type { Restaurant, RestaurantSettings } from "@/types/restaurant.types";

type ReceptionTab = "nuevos" | "cocina" | "historial";

type ReceptionStatus = {
  updated?: string;
  charged?: string;
  rejected?: string;
  error?: string;
};

function statusMessage(status: ReceptionStatus) {
  if (status.charged) {
    return { tone: "success", text: "Pedido aprobado, cobrado y enviado a cocina." };
  }
  if (status.rejected) {
    return { tone: "success", text: "Pedido rechazado correctamente." };
  }
  if (status.updated) {
    return { tone: "success", text: "Pedido actualizado." };
  }
  if (!status.error) {
    return null;
  }

  const message =
    status.error === "no-open-session"
      ? "Abre caja antes de aprobar pedidos."
      : status.error === "receipt-required"
        ? "Para aprobar un pago QR, el comprobante es obligatorio."
        : status.error === "order-cancelled"
          ? "Ese pedido ya fue rechazado."
          : status.error === "already-paid"
            ? "Ese pedido ya fue cobrado."
            : status.error.startsWith("negative-stock")
              ? "No hay stock suficiente para aprobar el pedido. Revisa inventario o ajusta el insumo."
              : `No se pudo completar la acción: ${status.error}.`;

  return { tone: "error", text: message };
}

export function OrdersReceptionClient({
  restaurant,
  settings,
  orders,
  hasOpenSession,
  status,
}: {
  restaurant: Restaurant;
  settings: RestaurantSettings | null;
  orders: Order[];
  hasOpenSession: boolean;
  status: ReceptionStatus;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<ReceptionTab>("nuevos");
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    const refresh = () => {
      setIsRefreshing(true);
      router.refresh();
      window.setTimeout(() => setIsRefreshing(false), 800);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`pedidos-recepcion-${restaurant.id}`)
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

  const groups = useMemo(
    () => ({
      nuevos: orders.filter((order) => order.status === "pending"),
      cocina: orders.filter((order) => ["accepted", "preparing", "ready"].includes(order.status)),
      historial: orders.filter((order) => ["delivered", "cancelled"].includes(order.status)).slice(0, 40),
    }),
    [orders],
  );

  const banner = statusMessage(status);
  const visibleOrders = groups[activeTab];

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Recepcion</p>
          <h1 className="text-3xl font-black text-[var(--text)]">Pedidos en tiempo real</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            Aquí llegan los pedidos de mesa y de afuera. Caja o recepción los aprueba, valida el comprobante y los manda a cocina.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-black text-[var(--muted)] shadow-sm">
          <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin text-[var(--primary)]")} />
          {isRefreshing ? "Actualizando" : "En vivo"}
        </div>
      </section>

      {!hasOpenSession ? (
        <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">
          La caja está cerrada. Puedes revisar pedidos, pero para aprobarlos y sumarlos al día primero debes abrir caja.
        </div>
      ) : null}

      {banner ? (
        <div className={cn("rounded-2xl p-3 text-sm font-semibold", banner.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{banner.text}</div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard count={groups.nuevos.length} icon={<Clock className="h-5 w-5" />} label="Nuevos por aprobar" />
        <SummaryCard count={groups.cocina.length} icon={<CheckCircle2 className="h-5 w-5" />} label="En cocina" />
        <SummaryCard count={groups.historial.length} icon={<Truck className="h-5 w-5" />} label="Cerrados recientes" />
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-white p-2 shadow-sm">
        <TabButton active={activeTab === "nuevos"} count={groups.nuevos.length} label="Nuevos" onClick={() => setActiveTab("nuevos")} />
        <TabButton active={activeTab === "cocina"} count={groups.cocina.length} label="En cocina" onClick={() => setActiveTab("cocina")} />
        <TabButton active={activeTab === "historial"} count={groups.historial.length} label="Historial" onClick={() => setActiveTab("historial")} />
      </div>

      {visibleOrders.length ? (
        <section className="grid gap-4">
          {activeTab === "nuevos"
            ? groups.nuevos.map((order) => <PendingOrderReviewCard context="pedidos" disabled={!hasOpenSession} key={order.id} order={order} restaurantSlug={restaurant.slug} />)
            : visibleOrders.map((order) => <ReceptionOrderCard defaultPrintFormat={settings?.printFormat ?? "thermal_80"} key={order.id} order={order} restaurant={restaurant} />)}
        </section>
      ) : (
        <EmptyState
          title={activeTab === "nuevos" ? "Sin pedidos nuevos" : activeTab === "cocina" ? "Nada enviado a cocina" : "Sin historial reciente"}
          description="Cuando Supabase reciba o actualice pedidos aparecerán aquí automáticamente."
        />
      )}
    </div>
  );
}

function SummaryCard({ label, count, icon }: { label: string; count: number; icon: ReactNode }) {
  return (
    <Card className="flex items-center justify-between gap-4 rounded-[1.25rem]">
      <div>
        <p className="text-sm font-semibold text-[var(--muted)]">{label}</p>
        <p className="mt-1 text-3xl font-black text-[var(--text)]">{count}</p>
      </div>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
    </Card>
  );
}

function TabButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button className={cn("h-11 shrink-0 rounded-full px-4 text-sm font-black", active ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-[var(--primary-light)]")} onClick={onClick} type="button">
      {label} ({count})
    </button>
  );
}

function ReceptionOrderCard({
  order,
  restaurant,
  defaultPrintFormat,
}: {
  order: Order;
  restaurant: Restaurant;
  defaultPrintFormat: PrintFormat;
}) {
  const minutes = minutesSince(order.createdAt, new Date());

  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black text-[var(--text)]">Pedido {order.orderNumber}</h2>
            <OrderStatusBadge status={order.status} />
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{orderSourceLabel(order)}</span>
          </div>

          <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
            {order.customerName || "Cliente"} | {orderTypeLabels[order.orderType]} | {paymentMethodLabels[order.paymentMethod]} | hace {elapsedLabel(minutes)}
          </p>

          <div className="mt-4 grid gap-2">
            {order.items.map((item) => (
              <div className="rounded-2xl bg-slate-50 p-3" key={item.id}>
                <p className="font-black text-[var(--text)]">
                  {item.quantity}x {item.productName}
                </p>
                {item.notes ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{item.notes}</p> : null}
              </div>
            ))}
          </div>

          {order.notes ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{order.notes}</p> : null}
          {order.cancellationReason ? <p className="mt-3 rounded-2xl bg-red-50 p-3 text-sm font-semibold text-red-700">Motivo de rechazo: {order.cancellationReason}</p> : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl bg-[var(--primary-light)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Resumen</p>
            <p className="mt-1 text-2xl font-black text-[var(--primary-dark)]">{formatMoney(order.total)}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{orderStatusLabels[order.status]}</p>
            {order.paymentReceiptReference ? <p className="mt-2 text-xs font-black text-[var(--primary-dark)]">Referencia: {order.paymentReceiptReference}</p> : null}
            {order.paymentReceiptUrl ? (
              <a className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--primary)]" href={order.paymentReceiptUrl} rel="noreferrer" target="_blank">
                Ver comprobante
              </a>
            ) : null}
          </div>

          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
            <button className={buttonClasses("secondary", "min-h-10 px-3 text-xs")} onClick={() => printOrderTicket({ order, restaurantName: restaurant.name, format: defaultPrintFormat })} type="button">
              <Printer className="h-4 w-4" />
              Ticket
            </button>
            <button className={buttonClasses("secondary", "min-h-10 px-3 text-xs")} onClick={() => printOrderTicket({ order, restaurantName: restaurant.name, format: "large" })} type="button">
              <Printer className="h-4 w-4" />
              Grande
            </button>
          </div>
        </div>
      </div>
    </Card>
  );
}
