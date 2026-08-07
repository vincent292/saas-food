"use client";

import { ChefHat, CheckCircle2, Clock, ExternalLink, Printer, RefreshCw, Truck, Utensils } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { refundOrderAction, updateOrderStatusAction } from "@/app/admin/actions";
import { OrderStatusBadge } from "@/components/orders/OrderStatusBadge";
import { PendingOrderReviewCard } from "@/components/orders/PendingOrderReviewCard";
import { elapsedLabel, minutesSince, orderSourceLabel, orderTypeLabels, paymentMethodLabels } from "@/components/orders/orderPresentation";
import { printOrderTicket, type PrintFormat } from "@/components/orders/printOrder";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Textarea } from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";
import { isSameBusinessDay } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import { createClient } from "@/lib/supabase/client";
import {
  businessOrderAdvanceLabel,
  businessOrderReadyLabel,
  businessOrderStatusLabel,
  businessQueueEmptyLabel,
  businessQueueLabel,
  businessTypeSupportsKitchen,
} from "@/lib/restaurant-directory-options";
import type { Order } from "@/types/order.types";
import type { Restaurant, RestaurantSettings } from "@/types/restaurant.types";

type ReceptionTab = "todos" | "nuevos" | "cocina" | "historial";

type ReceptionStatus = {
  updated?: string;
  charged?: string;
  rejected?: string;
  refunded?: string;
  error?: string;
  tab?: string;
};

function normalizeReceptionTab(value?: string): ReceptionTab {
  return value === "todos" || value === "cocina" || value === "historial" || value === "nuevos" ? value : "todos";
}

function statusMessage(status: ReceptionStatus, restaurant: Restaurant, settings: RestaurantSettings | null) {
  const hasKitchenFlow = businessTypeSupportsKitchen(restaurant.businessType) && (settings?.kitchenEnabled ?? true);

  if (status.charged) {
    return { tone: "success", text: hasKitchenFlow ? "Pedido aprobado, cobrado y enviado a cocina." : "Pedido aprobado, cobrado y marcado listo." };
  }
  if (status.rejected) {
    return { tone: "success", text: "Pedido rechazado correctamente." };
  }
  if (status.updated) {
    return { tone: "success", text: "Pedido actualizado." };
  }
  if (status.refunded) {
    return { tone: "success", text: "Reembolso registrado y pedido actualizado correctamente." };
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
            : status.error === "invalid-order-transition"
              ? "Ese cambio no corresponde al estado actual del pedido."
              : status.error === "refund-required"
                ? "El pedido ya fue pagado. Usa la opcion Cancelar y reembolsar."
                : status.error === "refund-reason-required"
                  ? "Escribe un motivo de al menos 5 caracteres para el reembolso."
                  : status.error === "already-refunded"
                    ? "Ese pedido ya fue reembolsado."
                    : status.error === "order-not-paid"
                      ? "Solo se pueden reembolsar pedidos pagados."
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
  const [activeTab, setActiveTab] = useState<ReceptionTab>(() => normalizeReceptionTab(status.tab));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const refreshTimeoutRef = useRef<number | null>(null);

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
      .channel(`pedidos-recepcion-${restaurant.id}`)
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

  const todayOrders = useMemo(() => orders.filter((order) => isSameBusinessDay(order.createdAt)), [orders]);
  const groups = useMemo(
    () => ({
      todos: todayOrders,
      nuevos: todayOrders.filter((order) => order.status === "pending"),
      cocina: todayOrders.filter((order) => ["accepted", "preparing", "ready"].includes(order.status)),
      historial: todayOrders.filter((order) => ["delivered", "cancelled"].includes(order.status)).slice(0, 40),
    }),
    [todayOrders],
  );

  const banner = statusMessage(status, restaurant, settings);
  const visibleOrders = groups[activeTab];
  const hasKitchenFlow = businessTypeSupportsKitchen(restaurant.businessType) && (settings?.kitchenEnabled ?? true);
  const queueLabel = businessQueueLabel(restaurant.businessType);

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Recepcion</p>
          <h1 className="text-3xl font-black text-[var(--text)]">Pedidos en tiempo real</h1>
          <p className="mt-1 max-w-3xl text-sm text-[var(--muted)]">
            {hasKitchenFlow
              ? "Aqui llegan los pedidos de mesa y de afuera. Caja o recepcion los aprueba, valida el comprobante y los manda a cocina."
              : "Aqui llegan pedidos web, POS, celular y plataformas externas. Caja o recepcion los aprueba y quedan listos para entregar."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasKitchenFlow ? (
            <a className={buttonClasses("secondary", "min-h-10 px-4 text-sm")} href={`/cocina/${restaurant.slug}`} rel="noreferrer" target="_blank">
              <ExternalLink className="h-4 w-4" />
              Abrir cocina
            </a>
          ) : null}
          <div className="flex items-center gap-2 rounded-full bg-[var(--surface)] px-4 py-2 text-sm font-black text-[var(--muted)] shadow-sm">
            <RefreshCw className={cn("h-4 w-4", isRefreshing && "animate-spin text-[var(--primary)]")} />
            {isRefreshing ? "Actualizando" : "En vivo"}
          </div>
        </div>
      </section>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold leading-6 text-[var(--muted)] shadow-sm">
        {hasKitchenFlow ? (
          <>
            Si el negocio no tiene pantalla en cocina, usa la pestaña <strong className="text-[var(--text)]">En cocina</strong> para iniciar preparacion y marcar pedidos listos desde este mismo panel.
          </>
        ) : (
          <>
            Usa la pestaña <strong className="text-[var(--text)]">{queueLabel}</strong> para alistar pedidos, marcarlos listos y continuar con recojo o despacho.
          </>
        )}
      </div>

      {!hasOpenSession ? (
        <div className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">
          La caja está cerrada. Puedes revisar pedidos, pero para aprobarlos y sumarlos al día primero debes abrir caja.
        </div>
      ) : null}

      {banner ? (
        <div className={cn("rounded-2xl p-3 text-sm font-semibold", banner.tone === "success" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]")}>{banner.text}</div>
      ) : null}

      <section className="grid gap-3 md:grid-cols-3">
        <SummaryCard count={groups.nuevos.length} icon={<Clock className="h-5 w-5" />} label="Nuevos por aprobar" />
        <SummaryCard count={groups.cocina.length} icon={<CheckCircle2 className="h-5 w-5" />} label={queueLabel} />
        <SummaryCard count={groups.todos.length} icon={<Truck className="h-5 w-5" />} label="Todos hoy" />
      </section>

      <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm">
        <TabButton active={activeTab === "todos"} count={groups.todos.length} label="Todos" onClick={() => setActiveTab("todos")} />
        <TabButton active={activeTab === "nuevos"} count={groups.nuevos.length} label="Nuevos" onClick={() => setActiveTab("nuevos")} />
        <TabButton active={activeTab === "cocina"} count={groups.cocina.length} label={queueLabel} onClick={() => setActiveTab("cocina")} />
        <TabButton active={activeTab === "historial"} count={groups.historial.length} label="Historial" onClick={() => setActiveTab("historial")} />
      </div>

      {visibleOrders.length ? (
        <section className="grid gap-4">
          {activeTab === "nuevos"
            ? groups.nuevos.map((order) => <PendingOrderReviewCard businessType={restaurant.businessType} context="pedidos" disabled={!hasOpenSession} key={order.id} order={order} restaurantSlug={restaurant.slug} />)
            : visibleOrders.map((order) =>
                order.status === "pending" ? (
                  <PendingOrderReviewCard businessType={restaurant.businessType} context="pedidos" disabled={!hasOpenSession} key={order.id} order={order} restaurantSlug={restaurant.slug} />
                ) : (
                  <ReceptionOrderCard defaultPrintFormat={settings?.printFormat ?? "thermal_80"} hasKitchenFlow={hasKitchenFlow} key={order.id} order={order} restaurant={restaurant} />
                ),
              )}
        </section>
      ) : (
        <EmptyState
          title={activeTab === "todos" ? "Sin pedidos hoy" : activeTab === "nuevos" ? "Sin pedidos nuevos" : activeTab === "cocina" ? businessQueueEmptyLabel(restaurant.businessType) : "Sin historial reciente"}
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
    <button className={cn("h-11 shrink-0 rounded-full px-4 text-sm font-black", active ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "text-[var(--muted)] hover:bg-[var(--primary-light)]")} onClick={onClick} type="button">
      {label} ({count})
    </button>
  );
}

function ReceptionOrderCard({
  order,
  restaurant,
  defaultPrintFormat,
  hasKitchenFlow,
}: {
  order: Order;
  restaurant: Restaurant;
  defaultPrintFormat: PrintFormat;
  hasKitchenFlow: boolean;
}) {
  const minutes = minutesSince(order.createdAt, new Date());
  const nextKitchenStatus = !hasKitchenFlow && order.status === "accepted" ? "ready" : order.status === "accepted" ? "preparing" : order.status === "preparing" ? "ready" : null;
  const nextKitchenLabel = !hasKitchenFlow && order.status === "accepted" ? "Marcar listo" : businessOrderAdvanceLabel(order.status, restaurant.businessType);
  const readyLabel = businessOrderReadyLabel(order.orderType, restaurant.businessType);

  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black text-[var(--text)]">Pedido {order.orderNumber}</h2>
            <OrderStatusBadge businessType={restaurant.businessType} status={order.status} />
            {order.paymentStatus === "refunded" ? <span className="rounded-full bg-[var(--color-danger-soft)] px-3 py-1 text-xs font-black text-[var(--color-danger-strong)]">Reembolsado</span> : null}
            <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-black text-[var(--color-body)]">{orderSourceLabel(order)}</span>
          </div>

          <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
            {order.customerName || "Cliente"} | {orderTypeLabels[order.orderType]} | {paymentMethodLabels[order.paymentMethod]} | hace {elapsedLabel(minutes)}
          </p>

          <div className="mt-4 grid gap-2">
            {order.items.map((item) => (
              <div className="rounded-2xl bg-[var(--color-surface)] p-3" key={item.id}>
                <p className="font-black text-[var(--text)]">
                  {item.quantity}x {item.productName}
                </p>
                {item.notes ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{item.notes}</p> : null}
              </div>
            ))}
          </div>

          {order.notes ? <p className="mt-3 rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-semibold text-[var(--color-warning-strong)]">{order.notes}</p> : null}
          {order.cancellationReason ? <p className="mt-3 rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger-strong)]">{order.paymentStatus === "refunded" ? "Motivo del reembolso" : "Motivo de rechazo"}: {order.cancellationReason}</p> : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl bg-[var(--primary-light)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Resumen</p>
            <p className="mt-1 text-2xl font-black text-[var(--primary-dark)]">{formatMoney(order.total)}</p>
            <p className="mt-1 text-xs font-semibold text-[var(--muted)]">{businessOrderStatusLabel(order.status, restaurant.businessType)}</p>
            {order.paymentReceiptReference ? <p className="mt-2 text-xs font-black text-[var(--primary-dark)]">Referencia: {order.paymentReceiptReference}</p> : null}
            {order.paymentReceiptUrl ? (
              <a className="mt-3 inline-flex rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-black text-[var(--primary)]" href={order.paymentReceiptUrl} rel="noreferrer" target="_blank">
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

          {nextKitchenStatus ? (
            <form action={updateOrderStatusAction} className="rounded-2xl border border-[var(--border)] p-3">
              <input name="restaurantId" type="hidden" value={order.restaurantId} />
              <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
              <input name="orderId" type="hidden" value={order.id} />
              <input name="source" type="hidden" value="pedidos" />
              <p className="mb-3 text-xs font-bold leading-5 text-[var(--muted)]">{hasKitchenFlow ? "Avance rapido para locales sin pantalla de cocina separada." : "Avance rapido para alistar y marcar pedidos listos desde recepcion."}</p>
              <Button className="w-full" name="status" type="submit" value={nextKitchenStatus}>
                {order.status === "accepted" ? <ChefHat className="h-4 w-4" /> : <Utensils className="h-4 w-4" />}
                {nextKitchenLabel}
              </Button>
            </form>
          ) : order.status === "ready" ? (
            <div className="rounded-2xl bg-[var(--primary-light)] p-3 text-center text-sm font-black text-[var(--primary-dark)]">{readyLabel}</div>
          ) : null}
          {order.paymentStatus === "paid" ? (
            <details className="rounded-2xl border border-[var(--color-danger-soft)] p-3">
              <summary className="cursor-pointer text-sm font-black text-[var(--color-danger-strong)]">Cancelar y reembolsar</summary>
              <form action={refundOrderAction} className="mt-3 grid gap-3">
                <input name="restaurantId" type="hidden" value={order.restaurantId} />
                <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
                <input name="orderId" type="hidden" value={order.id} />
                <input name="source" type="hidden" value="pedidos" />
                <Textarea name="reason" placeholder="Motivo del reembolso" required />
                <Button className="w-full" type="submit" variant="danger">Confirmar reembolso</Button>
              </form>
            </details>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
