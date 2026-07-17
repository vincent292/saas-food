"use client";

import { Banknote, Bike, Calculator, Copy, CreditCard, ExternalLink, FileText, History, MessageCircle, PackageSearch, ReceiptText, ShoppingBag, Store, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { closeCashSessionAction, openCashSessionAction, registerCashMovementAction, updateOrderStatusAction } from "@/app/admin/actions";
import { CashMovementRow } from "@/components/cash/CashMovementRow";
import { CashSummaryCard } from "@/components/cash/CashSummaryCard";
import { POSProductGrid } from "@/components/cash/POSProductGrid";
import { DeliveryDispatchPanel } from "@/components/delivery/DeliveryDispatchPanel";
import { NewOrderSoundAlert } from "@/components/orders/NewOrderSoundAlert";
import { PendingOrderReviewCard } from "@/components/orders/PendingOrderReviewCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { businessCatalogLabelTitle, businessOrderStatusLabel, businessPreparationAreaLabel, businessTypeSupportsKitchen } from "@/lib/restaurant-directory-options";
import { formatShortDate, formatShortTime, isSameBusinessDay } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import { createClient } from "@/lib/supabase/client";
import type { CashMovement, CashSessionReport, CashSummary } from "@/types/cash.types";
import type { Order } from "@/types/order.types";
import type { Category, Product, ProductConfiguration } from "@/types/product.types";
import type { Restaurant } from "@/types/restaurant.types";

type CashTab = "venta" | "pedidos" | "delivery" | "recojo" | "movimientos" | "egresos" | "cierre" | "reportes";

function normalizeTab(value: string | undefined): CashTab {
  if (value === "pedidos" || value === "delivery" || value === "recojo" || value === "movimientos" || value === "egresos" || value === "cierre" || value === "reportes") {
    return value;
  }
  return "venta";
}

function statusMessage(status: CashPageStatus, businessType: Restaurant["businessType"]) {
  const preparationArea = businessPreparationAreaLabel(businessType);
  const hasKitchenFlow = businessTypeSupportsKitchen(businessType);

  if (status.opened) {
    return { tone: "success", text: "Caja abierta correctamente." };
  }
  if (status.closed) {
    return { tone: "success", text: "Caja cerrada correctamente. El reporte quedó guardado." };
  }
  if (status.charged) {
    return { tone: "success", text: hasKitchenFlow ? "Pedido aprobado, cobrado y enviado a cocina." : `Pedido aprobado, cobrado y enviado a ${preparationArea}.` };
  }
  if (status.pos) {
    return { tone: "success", text: hasKitchenFlow ? "Venta POS cobrada y enviada a cocina." : `Venta POS cobrada y enviada a ${preparationArea}.` };
  }
  if (status.expense) {
    return { tone: "success", text: "Movimiento registrado correctamente." };
  }
  if (status.rejected) {
    return { tone: "success", text: "Pedido rechazado correctamente." };
  }
  if (!status.error) {
    return null;
  }

  const messages: Record<string, string> = {
    "no-open-session": "Necesitas una caja abierta para operar.",
    "receipt-required": "Para pago QR el comprobante o referencia es obligatorio.",
    "already-paid": "Ese pedido ya fue cobrado.",
    "cash-required": hasKitchenFlow ? "El pedido debe estar cobrado antes de pasar a cocina." : `El pedido debe estar cobrado antes de pasar a ${preparationArea}.`,
    "session-open": "Ya existe una caja abierta para este restaurante.",
    "order-not-found": "No encontramos ese pedido.",
    "order-cancelled": "Ese pedido fue cancelado.",
    "product-not-found": "Uno de los productos ya no está disponible.",
    "cash-access-denied": "Tu usuario no tiene permiso para operar esta caja.",
  };

  if (status.error.startsWith("negative-stock")) {
    return { tone: "error", text: "No hay stock suficiente para completar la venta. Revisa inventario o ajusta el insumo." };
  }

  return { tone: "error", text: messages[status.error] ?? `No se pudo completar la acción: ${status.error}.` };
}

export type CashPageStatus = {
  tab?: string;
  error?: string;
  opened?: string;
  closed?: string;
  charged?: string;
  expense?: string;
  pos?: string;
  rejected?: string;
  posOrderId?: string;
  posOrderNumber?: string;
  posTrackingToken?: string;
  posCustomerPhone?: string;
};

export function CashWorkspaceClient({
  restaurant,
  summary,
  categories,
  products,
  configuration,
  loadedTab,
  movements,
  reports,
  orders,
  status,
}: {
  restaurant: Restaurant;
  summary: CashSummary;
  categories: Category[];
  products: Product[];
  configuration: ProductConfiguration;
  loadedTab: CashTab;
  movements: CashMovement[];
  reports: CashSessionReport[];
  orders: Order[];
  status: CashPageStatus;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CashTab>(() => normalizeTab(status.tab));
  const [isTabPending, startTabTransition] = useTransition();
  const [showPosCreatedModal, setShowPosCreatedModal] = useState(Boolean(status.pos && status.posOrderId && status.posTrackingToken));
  const [posWhatsAppPhone, setPosWhatsAppPhone] = useState(status.posCustomerPhone ?? "");
  const [copied, setCopied] = useState(false);
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
        router.refresh();
        refreshTimeoutRef.current = null;
      }, 250);
    };
    const supabase = createClient();
    const channel = supabase
      .channel(`caja-despacho-${restaurant.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `restaurant_id=eq.${restaurant.id}` }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "order_delivery_links", filter: `restaurant_id=eq.${restaurant.id}` }, refresh)
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
      router.refresh();
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

  const todaysOrders = useMemo(() => orders.filter((order) => isSameBusinessDay(order.createdAt)), [orders]);
  const pendingOrders = useMemo(() => todaysOrders.filter((order) => order.status === "pending" && order.orderType !== "delivery" && order.orderType !== "pickup"), [todaysOrders]);
  const deliveryOrders = useMemo(
    () => todaysOrders.filter((order) => order.orderType === "delivery" && ["pending", "accepted", "preparing", "ready", "delivered"].includes(order.status)),
    [todaysOrders],
  );
  const pickupOrders = useMemo(
    () => todaysOrders.filter((order) => order.orderType === "pickup" && ["pending", "accepted", "preparing", "ready", "delivered"].includes(order.status)),
    [todaysOrders],
  );
  const ordersById = useMemo(() => new Map(todaysOrders.map((order) => [order.id, order])), [todaysOrders]);
  const latestReport = reports[0];
  const banner = statusMessage(status, restaurant.businessType);
  const hasOperationalCounts = true;
  const activeTabIsLoaded = activeTab === loadedTab;
  const catalogLabelTitle = businessCatalogLabelTitle(restaurant.businessType);
  const preparationArea = businessPreparationAreaLabel(restaurant.businessType);
  const hasKitchenFlow = businessTypeSupportsKitchen(restaurant.businessType);
  const trackingUrl =
    status.posOrderId && status.posTrackingToken && typeof window !== "undefined"
      ? `${window.location.origin}${publicRestaurantPath(restaurant.slug, `pedido/${status.posOrderId}`)}?token=${status.posTrackingToken}`
      : "";
  const whatsappHref =
    posWhatsAppPhone.replace(/\D/g, "") && trackingUrl
      ? `https://wa.me/${posWhatsAppPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Tu pedido ${status.posOrderNumber ?? ""} ya fue registrado. Puedes seguirlo aqui: ${trackingUrl}`)}`
      : "";
  const tabs: { key: CashTab; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "venta", label: "Venta POS", icon: Store },
    { key: "pedidos", label: "Pedidos", icon: PackageSearch, count: hasOperationalCounts ? pendingOrders.length : undefined },
    { key: "delivery", label: "Delivery", icon: Bike, count: hasOperationalCounts ? deliveryOrders.length : undefined },
    { key: "recojo", label: "Recojo", icon: ShoppingBag, count: hasOperationalCounts ? pickupOrders.length : undefined },
    { key: "movimientos", label: "Movimientos", icon: History, count: loadedTab === "movimientos" ? movements.length : undefined },
    { key: "egresos", label: "Caja chica", icon: CreditCard },
    { key: "cierre", label: "Cierre", icon: Calculator },
    { key: "reportes", label: "Reportes", icon: FileText, count: loadedTab === "reportes" ? reports.length : undefined },
  ];

  function switchTab(nextTab: CashTab) {
    setActiveTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    startTabTransition(() => {
      router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
    });
  }

  function openAlertOrders(alertOrders: Order[]) {
    const targetTab = alertOrders.some((order) => order.orderType === "delivery")
      ? "delivery"
      : alertOrders.some((order) => order.orderType === "pickup")
        ? "recojo"
        : "pedidos";
    switchTab(targetTab);
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.25fr_0.75fr]">
        <Card className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Estado de caja</p>
              <h2 className="mt-1 text-3xl font-black text-[var(--text)]">{summary.session ? "Caja abierta" : "Caja cerrada"}</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-[var(--muted)]">
                {summary.session
                  ? `Abierta el ${formatShortDate(summary.session.openedAt)} a las ${formatShortTime(summary.session.openedAt)}${summary.session.openedByName ? ` por ${summary.session.openedByName}` : ""}.`
                  : latestReport
                    ? `Último cierre: ${formatShortDate(latestReport.session.closedAt ?? latestReport.session.openedAt)} a las ${formatShortTime(latestReport.session.closedAt ?? latestReport.session.openedAt)}.`
                    : "Abre la caja primero. Sin caja abierta no se pueden aprobar pedidos ni cobrar POS."}
              </p>
            </div>
            <div className={cn("rounded-2xl px-4 py-3 text-right", summary.session ? "bg-[var(--color-success-soft)]" : "bg-[var(--color-neutral-100)]")}>
              <p className={cn("text-xs font-black uppercase tracking-[0.12em]", summary.session ? "text-[var(--color-success-strong)]" : "text-[var(--color-secondary-text)]")}>Efectivo esperado</p>
              <p className={cn("text-2xl font-black", summary.session ? "text-[var(--color-success-strong)]" : "text-[var(--color-body)]")}>{formatMoney(summary.expectedCash)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SessionMetric amount={summary.salesTotal} detail={`${summary.orderCount} cobros`} label="Ventas turno" />
            <SessionMetric amount={summary.cashTotal} label="Ventas efectivo" />
            <SessionMetric amount={summary.digitalTotal} label="Cobros digitales" />
            <SessionMetric amount={summary.cashExpenses} danger label="Egresos efectivo" />
          </div>
        </Card>

        <Card className="p-5">
          <SectionTitle title={summary.session ? "Cierre rápido" : "Apertura"} description={summary.session ? "Cuenta solo el efectivo físico." : "Registra el monto inicial de billetes y monedas."} />
          {summary.session ? (
            <form action={closeCashSessionAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <div className="rounded-2xl bg-[var(--color-surface)] p-3">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Debe haber en efectivo</p>
                <p className="text-2xl font-black text-[var(--color-heading)]">{formatMoney(summary.expectedCash)}</p>
              </div>
              <Input min={0} name="countedAmount" placeholder="Efectivo contado al cierre" required step="0.01" type="number" />
              <Textarea name="notes" placeholder="Notas de cierre" />
              <Button className="w-full" type="submit" variant="danger">
                Cerrar caja
              </Button>
            </form>
          ) : (
            <form action={openCashSessionAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <Input min={0} name="openingAmount" placeholder="Monto inicial de apertura" required step="0.01" type="number" />
              <Textarea name="notes" placeholder="Notas de apertura" />
              <Button className="w-full" type="submit">
                Abrir caja
              </Button>
            </form>
          )}
        </Card>
      </section>

      {banner ? (
        <div className={cn("rounded-2xl p-3 text-sm font-semibold", banner.tone === "success" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]")}>{banner.text}</div>
      ) : null}

      {isTabPending ? <div className="rounded-2xl bg-[var(--color-info-soft)] p-3 text-sm font-bold text-[var(--color-info-strong)]">Actualizando datos de caja...</div> : null}

      <NewOrderSoundAlert
        description="Caja recibio un pedido nuevo. Revisa pedidos, delivery o recojo para aprobarlo."
        onOpenAlerts={openAlertOrders}
        orders={todaysOrders}
        title="Pedido nuevo en caja"
        watchOrderTypes={["table", "pos", "delivery", "pickup"]}
      />

      {showPosCreatedModal && status.posOrderNumber ? (
        <div className="fixed inset-0 z-[85] grid place-items-end bg-[var(--color-overlay)] p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4">
          <div className="w-full max-w-xl rounded-t-[1.5rem] bg-[var(--surface)] shadow-2xl sm:rounded-[1.5rem]">
            <div className="flex items-start justify-between gap-4 border-b border-[var(--border)] p-4">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Venta confirmada</p>
                <h2 className="mt-1 text-2xl font-black text-[var(--color-heading)]">Pedido {status.posOrderNumber}</h2>
                <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
                  {hasKitchenFlow ? "Ya quedo enviado a cocina." : `Ya quedo enviado a ${preparationArea}.`} Puedes compartir el seguimiento al cliente desde aqui.
                </p>
              </div>
              <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-100)]" onClick={() => setShowPosCreatedModal(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="grid gap-4 p-4">
              <div className="rounded-2xl bg-[var(--primary-light)] p-4">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Seguimiento</p>
                <p className="mt-2 break-all text-sm font-semibold text-[var(--color-body)]">{trackingUrl || "Abriendo enlace..."}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                <Input name="posModalPhone" onChange={(event) => setPosWhatsAppPhone(event.target.value)} placeholder="Telefono o WhatsApp del cliente" value={posWhatsAppPhone} />
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 text-sm font-black"
                  onClick={async () => {
                    if (!trackingUrl) return;
                    await navigator.clipboard.writeText(trackingUrl);
                    setCopied(true);
                    window.setTimeout(() => setCopied(false), 1500);
                  }}
                  type="button"
                >
                  <Copy className="h-4 w-4" />
                  {copied ? "Copiado" : "Copiar link"}
                </button>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <a className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 text-sm font-black" href={trackingUrl || "#"} rel="noreferrer" target="_blank">
                  <ExternalLink className="h-4 w-4" />
                  Ver seguimiento
                </a>
                <a
                  className={cn(
                    "inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-4 text-sm font-black",
                    whatsappHref ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]",
                  )}
                  href={whatsappHref || "#"}
                  rel="noreferrer"
                  target="_blank"
                >
                  <MessageCircle className="h-4 w-4" />
                  Enviar por WhatsApp
                </a>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-black transition",
              activeTab === tab.key ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "text-[var(--muted)] hover:bg-[var(--primary-light)]",
            )}
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            type="button"
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count !== undefined ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", activeTab === tab.key ? "bg-[var(--color-on-primary-soft)] text-[var(--color-on-primary)]" : "bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]")}>{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === "venta" ? (
        <section className="space-y-4">
          <SectionTitle title="Venta POS" description={`${catalogLabelTitle} real del negocio, con imagenes, variantes y opciones.`} />
          <POSProductGrid
            businessType={restaurant.businessType}
            categories={categories}
            configuration={configuration}
            disabled={!summary.session}
            products={products}
            restaurantId={restaurant.id}
            restaurantSlug={restaurant.slug}
          />
        </section>
      ) : null}

      {activeTab === "pedidos" ? (
        <section className="space-y-4">
          <SectionTitle title="Pedidos del dia" description={hasKitchenFlow ? "Mesa y POS pendientes para aprobar, cobrar o rechazar." : "Pedidos pendientes para aprobar, cobrar o rechazar."} />
          {!activeTabIsLoaded ? (
            <TabLoadingState />
          ) : pendingOrders.length ? (
            <div className="grid gap-3">
              {pendingOrders.map((order) => (
                <PendingOrderReviewCard businessType={restaurant.businessType} context="caja" disabled={!summary.session} key={order.id} order={order} restaurantSlug={restaurant.slug} />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin pedidos pendientes" description="Cuando llegue un pedido nuevo aparecerá aquí para cobro y aprobación." />
          )}
        </section>
      ) : null}

      {activeTab === "delivery" ? (
        <section className="space-y-4">
          <SectionTitle title="Delivery del dia" description={hasKitchenFlow ? "Pedidos con envio. Caja los aprueba y, cuando cocina marca listo, genera el QR para la moto." : "Pedidos con envio. Caja los aprueba y, cuando el pedido queda listo, habilita el despacho."} />
          {!activeTabIsLoaded ? (
            <TabLoadingState />
          ) : deliveryOrders.length ? (
            <div className="grid gap-3">
              {deliveryOrders.map((order) =>
                order.status === "pending" ? (
                  <PendingOrderReviewCard businessType={restaurant.businessType} context="caja" disabled={!summary.session} key={order.id} order={order} restaurantSlug={restaurant.slug} />
                ) : (
                  <DeliveryOrderCard businessType={restaurant.businessType} key={order.id} order={order} restaurantSlug={restaurant.slug} />
                ),
              )}
            </div>
          ) : (
            <EmptyState title="Sin delivery hoy" description="Cuando el cliente elija envio, el pedido aparecera aqui para caja y despacho." />
          )}
        </section>
      ) : null}

      {activeTab === "recojo" ? (
        <section className="space-y-4">
          <SectionTitle title="Recojo del dia" description="Pedidos para recoger en tienda, separados del delivery para que caja los ubique rapido." />
          {!activeTabIsLoaded ? (
            <TabLoadingState />
          ) : pickupOrders.length ? (
            <div className="grid gap-3">
              {pickupOrders.map((order) =>
                order.status === "pending" ? (
                  <PendingOrderReviewCard businessType={restaurant.businessType} context="caja" disabled={!summary.session} key={order.id} order={order} restaurantSlug={restaurant.slug} />
                ) : (
                  <PickupOrderCard businessType={restaurant.businessType} key={order.id} order={order} restaurantSlug={restaurant.slug} />
                ),
              )}
            </div>
          ) : (
            <EmptyState title="Sin recojos hoy" description="Cuando el cliente elija recojo, el pedido aparecera aqui." />
          )}
        </section>
      ) : null}

      {activeTab === "movimientos" ? (
        <Card>
          <SectionTitle title="Movimientos" description="Cobros, egresos, ingresos, apertura y cierre del turno actual." />
          <div className="mt-4">
            {!activeTabIsLoaded ? (
              <TabLoadingState />
            ) : movements.length ? (
              movements.map((movement) => <CashMovementRow key={movement.id} movement={movement} order={movement.orderId ? ordersById.get(movement.orderId) : undefined} />)
            ) : (
              <EmptyState title="Sin movimientos" description="Los movimientos del turno aparecerán aquí." />
            )}
          </div>
        </Card>
      ) : null}

      {activeTab === "egresos" ? (
        <Card className="max-w-2xl">
          <SectionTitle title="Caja chica" description="Registra salidas, entradas o ajustes del turno." />
          <form action={registerCashMovementAction} className="mt-4 space-y-3">
            <input name="restaurantId" type="hidden" value={restaurant.id} />
            <Select defaultValue="expense" disabled={!summary.session} name="type">
              <option value="expense">Egreso</option>
              <option value="income">Ingreso adicional</option>
              <option value="adjustment">Ajuste</option>
            </Select>
            <Input disabled={!summary.session} min={0.01} name="amount" placeholder="Monto" required step="0.01" type="number" />
            <Select defaultValue="cash" disabled={!summary.session} name="paymentMethod">
              <option value="cash">Efectivo</option>
              <option value="qr">QR</option>
              <option value="bank_transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="other">Otro</option>
            </Select>
            <Input disabled={!summary.session} name="description" placeholder="Descripción" required />
            <Button className="w-full" disabled={!summary.session} type="submit" variant="secondary">
              Guardar movimiento
            </Button>
          </form>
        </Card>
      ) : null}

      {activeTab === "cierre" ? (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CashSummaryCard amount={summary.expectedCash} detail="Apertura + efectivo - egresos" label="Efectivo esperado" />
            <CashSummaryCard amount={summary.cashTotal} label="Ventas efectivo" />
            <CashSummaryCard amount={summary.digitalTotal} detail="QR, transferencia, tarjeta y otros" label="Cobros digitales" />
            <CashSummaryCard amount={summary.netTotal} detail="Ventas + ingresos - egresos" label="Neto turno" />
          </div>
          <Card>
            <SectionTitle title="Guía de cierre" description="Cuenta billetes y monedas; los pagos digitales quedan separados." />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <CloseStep icon={<Banknote className="h-5 w-5" />} label="1. Cuenta efectivo" value={formatMoney(summary.expectedCash)} />
              <CloseStep icon={<CreditCard className="h-5 w-5" />} label="2. Revisa digitales" value={formatMoney(summary.digitalTotal)} />
              <CloseStep icon={<ReceiptText className="h-5 w-5" />} label="3. Registra cierre" value={`${summary.orderCount} cobros`} />
            </div>
          </Card>
        </section>
      ) : null}

      {activeTab === "reportes" ? (
        <section className="space-y-4">
          <SectionTitle title="Reportes de caja" description="Aperturas y cierres guardados con montos, diferencia y usuario." />
          {!activeTabIsLoaded ? (
            <TabLoadingState />
          ) : reports.length ? (
            <div className="grid gap-4">
              {reports.map((report) => (
                <CashReportCard key={report.session.id} report={report} />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin reportes" description="Cuando abras y cierres caja aparecerán los reportes aquí." />
          )}
        </section>
      ) : null}
    </div>
  );
}

function TabLoadingState() {
  return <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-6 text-sm font-bold text-[var(--muted)]">Cargando datos...</div>;
}

function DeliveryOrderCard({ order, restaurantSlug, businessType }: { order: Order; restaurantSlug: string; businessType: Restaurant["businessType"] }) {
  const isReady = order.status === "ready";
  const dispatchStatus = order.status === "delivered" ? "delivered" : order.deliveryDispatch?.status;
  const hasKitchenFlow = businessTypeSupportsKitchen(businessType);

  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <OrderOperationalSummary businessType={businessType} order={order} title="Delivery" />
        {dispatchStatus === "delivered" ? (
          <DispatchStatusPanel label="Entregado" tone="success" value={order.deliveryDispatch?.deliveredAt ?? order.deliveredAt} />
        ) : dispatchStatus === "arrived" ? (
          <DispatchStatusPanel label="La moto ya llego" tone="info" value={order.deliveryDispatch?.arrivedAt} />
        ) : isReady ? (
          <DeliveryDispatchPanel compact order={order} restaurantSlug={restaurantSlug} />
        ) : (
          <div className="rounded-2xl bg-[var(--color-warning-soft)] p-4 text-sm font-bold text-[var(--color-warning-strong)]">
            {hasKitchenFlow ? "Aun esta en cocina." : "Aun esta en preparacion."} El QR de moto se habilita cuando el pedido este listo.
          </div>
        )}
      </div>
    </Card>
  );
}

function DispatchStatusPanel({ label, tone, value }: { label: string; tone: "info" | "success"; value?: string }) {
  return (
    <div className={cn("rounded-2xl p-4 text-sm font-bold", tone === "success" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]")}>
      <p className="text-lg font-black">{label}</p>
      {value ? <p className="mt-1">Actualizado a las {formatShortTime(value)}</p> : null}
    </div>
  );
}

function PickupOrderCard({ order, restaurantSlug, businessType }: { order: Order; restaurantSlug: string; businessType: Restaurant["businessType"] }) {
  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
        <OrderOperationalSummary businessType={businessType} order={order} title="Recojo" />
        {order.status === "ready" ? (
          <form action={updateOrderStatusAction} className="rounded-2xl border border-[var(--border)] p-3">
            <input name="restaurantId" type="hidden" value={order.restaurantId} />
            <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
            <input name="orderId" type="hidden" value={order.id} />
            <input name="source" type="hidden" value="caja" />
            <input name="tab" type="hidden" value="recojo" />
            <p className="mb-3 text-xs font-bold leading-5 text-[var(--muted)]">Confirma cuando el cliente ya retiro el pedido del local.</p>
            <Button className="w-full" name="status" type="submit" value="delivered">
              Marcar retirado
            </Button>
          </form>
        ) : order.status === "delivered" ? (
          <DispatchStatusPanel label="Retirado" tone="success" value={order.deliveredAt} />
        ) : (
          <div className="rounded-2xl bg-[var(--color-warning-soft)] p-4 text-sm font-bold text-[var(--color-warning-strong)]">
            {businessTypeSupportsKitchen(businessType) ? "Aun no esta listo para entregar al cliente." : "Aun no esta listo para retirar o entregar al cliente."}
          </div>
        )}
      </div>
    </Card>
  );
}

function OrderOperationalSummary({ order, title, businessType }: { order: Order; title: string; businessType: Restaurant["businessType"] }) {
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-xl font-black text-[var(--text)]">
          {title} {order.orderNumber}
        </h3>
        <span className="rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-xs font-black text-[var(--color-success-strong)]">{businessOrderStatusLabel(order.status, businessType)}</span>
        {order.deliveryDispatch?.status === "arrived" ? <span className="rounded-full bg-[var(--color-info-soft)] px-3 py-1 text-xs font-black text-[var(--color-info-strong)]">llego</span> : null}
        {order.deliveryDispatch?.status === "delivered" ? <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-black text-[var(--color-body)]">entregado por moto</span> : null}
        <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-black text-[var(--color-body)]">{formatMoney(order.total)}</span>
      </div>
      <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
        {order.customerName || "Cliente"} | {order.customerPhone || "Sin telefono"}
        {order.orderType === "delivery" ? ` | ${order.customerAddress || "Sin direccion"}` : ""}
      </p>
      {order.deliveryAddressDetail ? <p className="mt-2 text-sm font-bold text-[var(--text)]">Referencia: {order.deliveryAddressDetail}</p> : null}
      <div className="mt-3 grid gap-2">
        {order.items.map((item) => (
          <div className="rounded-2xl bg-[var(--color-surface)] p-3" key={item.id}>
            <p className="font-black text-[var(--text)]">
              {item.quantity}x {item.productName}
            </p>
            {item.notes ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{item.notes}</p> : null}
          </div>
        ))}
      </div>
    </div>
  );
}

function SessionMetric({ label, amount, detail, danger }: { label: string; amount: number; detail?: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-4">
      <p className="text-sm font-semibold text-[var(--color-secondary-text)]">{label}</p>
      <p className={cn("mt-1 text-2xl font-black", danger ? "text-[var(--color-danger)]" : "text-[var(--color-heading)]")}>{formatMoney(amount)}</p>
      {detail ? <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">{detail}</p> : null}
    </div>
  );
}

function CloseStep({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-4">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-xl font-black text-[var(--color-heading)]">{value}</p>
    </div>
  );
}

function CashReportCard({ report }: { report: CashSessionReport }) {
  const difference = report.session.differenceAmount ?? 0;
  const closedAt = report.session.closedAt ?? report.session.openedAt;

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">{report.session.status === "open" ? "Turno abierto" : "Turno cerrado"}</p>
          <h3 className="mt-1 text-xl font-black text-[var(--text)]">
            {formatShortDate(report.session.openedAt)} · {formatShortTime(report.session.openedAt)} - {report.session.status === "closed" ? formatShortTime(closedAt) : "en curso"}
          </h3>
          <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
            Abrió: {report.session.openedByName ?? "Usuario registrado"} {report.session.closedByName ? `· Cerró: ${report.session.closedByName}` : ""}
          </p>
        </div>
        <div className={cn("rounded-2xl px-4 py-3 text-right", difference === 0 ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : difference > 0 ? "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]")}>
          <p className="text-xs font-black uppercase tracking-[0.12em]">Diferencia</p>
          <p className="text-2xl font-black">{formatMoney(difference)}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <SessionMetric amount={report.expectedCash} label="Efectivo esperado" />
        <SessionMetric amount={report.session.countedAmount ?? 0} label="Efectivo contado" />
        <SessionMetric amount={report.salesTotal} detail={`${report.orderCount} cobros`} label="Ventas" />
        <SessionMetric amount={report.digitalTotal} label="Digital" />
        <SessionMetric amount={report.expenses} danger label="Egresos" />
      </div>
    </Card>
  );
}
