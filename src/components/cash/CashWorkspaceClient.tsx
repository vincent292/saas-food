"use client";

import { AlertTriangle, Banknote, Bike, Calculator, CheckCircle2, Clock3, Copy, CreditCard, ExternalLink, FileText, History, Maximize2, MessageCircle, PackageSearch, Printer, QrCode, ReceiptText, Search, ShoppingBag, Store, X, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import QRCode from "qrcode";
import { closeCashSessionAction, openCashSessionAction, registerCashMovementAction, updateOrderStatusAction } from "@/app/admin/actions";
import { CashMovementRow } from "@/components/cash/CashMovementRow";
import { CashSummaryCard } from "@/components/cash/CashSummaryCard";
import { POSProductGrid } from "@/components/cash/POSProductGrid";
import { DeliveryDispatchPanel } from "@/components/delivery/DeliveryDispatchPanel";
import { PendingOrderReviewCard } from "@/components/orders/PendingOrderReviewCard";
import { READY_PICKUP_WARNING_MINUTES, elapsedLabel, kitchenDueDate, minutesSince, minutesUntil, orderPrepMinutes } from "@/components/orders/orderPresentation";
import { printOrderTicket } from "@/components/orders/printOrder";
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
import type { CashAuditSnapshot, CashMovement, CashSessionReport, CashSummary } from "@/types/cash.types";
import type { Order } from "@/types/order.types";
import type { Category, Product, ProductConfiguration } from "@/types/product.types";
import type { Restaurant, RestaurantPrintConnector, RestaurantSettings } from "@/types/restaurant.types";

type CashTab = "venta" | "pedidos" | "delivery" | "recojo" | "movimientos" | "egresos" | "cierre" | "reportes";

const CASH_REFRESH_FAST_INTERVAL_MS = 15000;
const CASH_REFRESH_QUIET_INTERVAL_MS = 30000;
const CASH_REALTIME_REFRESH_DEBOUNCE_MS = 250;
const CASH_REFRESH_MIN_GAP_MS = 3000;
const operationalTabs = new Set<CashTab>(["pedidos", "delivery", "recojo"]);

function statusMessage(status: CashPageStatus, businessType: Restaurant["businessType"], kitchenEnabled = true) {
  const hasKitchenFlow = businessTypeSupportsKitchen(businessType) && kitchenEnabled;
  const preparationArea = hasKitchenFlow ? businessPreparationAreaLabel(businessType) : "alistado";

  if (status.opened) {
    return { tone: "success", text: "Caja abierta correctamente." };
  }
  if (status.closed) {
    return { tone: "success", text: "Caja cerrada correctamente. El reporte quedó guardado." };
  }
  if (status.charged) {
    return { tone: "success", text: hasKitchenFlow ? "Pedido aprobado, cobrado y enviado a cocina." : "Pedido aprobado, cobrado y marcado listo." };
  }
  if (status.pos) {
    return { tone: "success", text: hasKitchenFlow ? "Venta POS cobrada y enviada a cocina." : "Venta POS cobrada y cerrada." };
  }
  if (status.expense) {
    return { tone: "success", text: "Movimiento registrado correctamente." };
  }
  if (status.rejected) {
    return { tone: "success", text: "Pedido rechazado correctamente." };
  }
  if (status.updated) {
    return { tone: "success", text: "Pedido actualizado correctamente." };
  }
  if (!status.error) {
    return null;
  }

  const messages: Record<string, string> = {
    "no-open-session": "Necesitas una caja abierta para operar.",
    "receipt-required": "Para pago QR el comprobante o referencia es obligatorio.",
    "qr-unavailable": "Esta sucursal no tiene QR configurado para cobrar por QR.",
    "already-paid": "Ese pedido ya fue cobrado.",
    "cash-required": hasKitchenFlow ? "El pedido debe estar cobrado antes de pasar a cocina." : `El pedido debe estar cobrado antes de pasar a ${preparationArea}.`,
    "session-open": "Ya existe una caja abierta para este restaurante.",
    "order-not-found": "No encontramos ese pedido.",
    "order-cancelled": "Ese pedido fue cancelado.",
    "product-not-found": "Uno de los productos ya no está disponible.",
    "cash-access-denied": "Tu usuario no tiene permiso para operar esta caja.",
    "invalid-order-transition": "Ese cambio no corresponde al estado actual del pedido.",
    "refund-required": "El pedido ya fue pagado. Registra el reembolso desde Pedidos.",
    "refund-reason-required": "Escribe un motivo de al menos 5 caracteres para el reembolso.",
    "already-refunded": "Ese pedido ya fue reembolsado.",
    "order-not-paid": "Solo se pueden reembolsar pedidos pagados.",
    "pending-cancellation-review": "Hay anulaciones cobradas pendientes de aprobacion del dueno. Revisa Anulaciones antes de cerrar caja.",
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
  updated?: string;
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
  settings,
  printConnectorLink,
  loadedTab,
  movements,
  reports,
  orders,
  status,
  pendingCancellationReviews,
  cashAudit,
}: {
  restaurant: Restaurant;
  summary: CashSummary;
  categories: Category[];
  products: Product[];
  configuration: ProductConfiguration;
  settings: RestaurantSettings | null;
  printConnectorLink: RestaurantPrintConnector | null;
  loadedTab: CashTab;
  movements: CashMovement[];
  reports: CashSessionReport[];
  orders: Order[];
  status: CashPageStatus;
  pendingCancellationReviews: number;
  cashAudit: CashAuditSnapshot | null;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<CashTab>(loadedTab);
  const [showPosCreatedModal, setShowPosCreatedModal] = useState(Boolean(status.pos && status.posOrderId && status.posTrackingToken));
  const [showLargeTrackingQr, setShowLargeTrackingQr] = useState(false);
  const [posWhatsAppPhone, setPosWhatsAppPhone] = useState(status.posCustomerPhone ?? "");
  const [blockedAutoPrintOrderId, setBlockedAutoPrintOrderId] = useState("");
  const [orderSearch, setOrderSearch] = useState("");
  const [now, setNow] = useState(() => new Date());
  const [copied, setCopied] = useState(false);
  const [trackingQrUrl, setTrackingQrUrl] = useState("");
  const [clientOrigin, setClientOrigin] = useState("");
  const refreshTimeoutRef = useRef<number | null>(null);
  const lastRefreshAtRef = useRef(0);

  useEffect(() => {
    lastRefreshAtRef.current = Date.now();
    const timer = window.setTimeout(() => setClientOrigin(window.location.origin), 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setActiveTab(loadedTab), 0);
    return () => window.clearTimeout(timer);
  }, [loadedTab]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!operationalTabs.has(activeTab)) {
      return;
    }

    const refresh = () => {
      if (document.visibilityState === "hidden") {
        return;
      }

      if (refreshTimeoutRef.current) {
        window.clearTimeout(refreshTimeoutRef.current);
      }

      refreshTimeoutRef.current = window.setTimeout(() => {
        lastRefreshAtRef.current = Date.now();
        router.refresh();
        refreshTimeoutRef.current = null;
      }, CASH_REALTIME_REFRESH_DEBOUNCE_MS);
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
  }, [activeTab, restaurant.id, router]);

  const todaysOrders = useMemo(() => orders.filter((order) => isSameBusinessDay(order.createdAt)), [orders]);
  const pendingOrders = useMemo(() => todaysOrders.filter((order) => order.status === "pending" && order.orderType !== "delivery" && order.orderType !== "pickup"), [todaysOrders]);
  const activeTableOrders = useMemo(() => todaysOrders.filter((order) => order.orderType === "table" && ["accepted", "preparing", "ready"].includes(order.status)), [todaysOrders]);
  const deliveryOrders = useMemo(
    () => todaysOrders.filter((order) => order.orderType === "delivery" && ["pending", "accepted", "preparing", "ready", "delivered"].includes(order.status)),
    [todaysOrders],
  );
  const pickupOrders = useMemo(
    () => todaysOrders.filter((order) => order.orderType === "pickup" && ["pending", "accepted", "preparing", "ready", "delivered"].includes(order.status)),
    [todaysOrders],
  );
  const normalizedOrderSearch = orderSearch.trim().toLowerCase();
  const matchesOrderSearch = useCallback((order: Order) => {
    if (!normalizedOrderSearch) {
      return true;
    }

    const haystack = [order.orderNumber, order.customerName, order.customerPhone, order.notes, order.customerAddress]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return haystack.includes(normalizedOrderSearch);
  }, [normalizedOrderSearch]);
  const visiblePendingOrders = useMemo(() => pendingOrders.filter(matchesOrderSearch), [pendingOrders, matchesOrderSearch]);
  const visibleActiveTableOrders = useMemo(() => activeTableOrders.filter(matchesOrderSearch), [activeTableOrders, matchesOrderSearch]);
  const visibleDeliveryOrders = useMemo(() => deliveryOrders.filter(matchesOrderSearch), [deliveryOrders, matchesOrderSearch]);
  const visiblePickupOrders = useMemo(() => pickupOrders.filter(matchesOrderSearch), [pickupOrders, matchesOrderSearch]);
  const activeDeliveryOrderCount = useMemo(() => deliveryOrders.filter((order) => order.status !== "delivered").length, [deliveryOrders]);
  const activePickupOrderCount = useMemo(() => pickupOrders.filter((order) => order.status !== "delivered").length, [pickupOrders]);
  const activeOperationalOrderCount = useMemo(
    () =>
      pendingOrders.length +
      activeTableOrders.length +
      activeDeliveryOrderCount +
      activePickupOrderCount,
    [activeDeliveryOrderCount, activePickupOrderCount, activeTableOrders.length, pendingOrders.length],
  );
  const fallbackRefreshIntervalMs = operationalTabs.has(activeTab) && activeOperationalOrderCount > 0 ? CASH_REFRESH_FAST_INTERVAL_MS : CASH_REFRESH_QUIET_INTERVAL_MS;
  const ordersById = useMemo(() => new Map(todaysOrders.map((order) => [order.id, order])), [todaysOrders]);
  const latestReport = reports[0];
  const banner = statusMessage(status, restaurant.businessType, settings?.kitchenEnabled ?? true);
  const hasOperationalCounts = loadedTab === "pedidos" || loadedTab === "delivery" || loadedTab === "recojo" || loadedTab === "movimientos";
  const activeTabIsLoaded = activeTab === loadedTab || (operationalTabs.has(activeTab) && operationalTabs.has(loadedTab));
  const hasFullCashSummary = loadedTab === "venta" || loadedTab === "movimientos" || loadedTab === "egresos" || loadedTab === "cierre" || loadedTab === "reportes";
  const catalogLabelTitle = businessCatalogLabelTitle(restaurant.businessType);
  const preparationArea = businessPreparationAreaLabel(restaurant.businessType);
  const hasKitchenFlow = businessTypeSupportsKitchen(restaurant.businessType) && (settings?.kitchenEnabled ?? true);
  const hasDirectPrintConnector = Boolean(printConnectorLink?.linkedAt || printConnectorLink?.lastSeenAt);
  const trackingUrl =
    status.posOrderId && status.posTrackingToken && clientOrigin
      ? `${clientOrigin}${publicRestaurantPath(restaurant.slug, `pedido/${status.posOrderId}`)}?token=${status.posTrackingToken}`
      : "";
  const whatsappHref =
    posWhatsAppPhone.replace(/\D/g, "") && trackingUrl
      ? `https://wa.me/${posWhatsAppPhone.replace(/\D/g, "")}?text=${encodeURIComponent(`Tu pedido ${status.posOrderNumber ?? ""} ya fue registrado. Puedes seguirlo aqui: ${trackingUrl}`)}`
      : "";

  useEffect(() => {
    if (!settings?.autoPrintKitchen || !status.charged || hasDirectPrintConnector) {
      return;
    }

    const order = ordersById.get(status.charged);
    if (!order) {
      return;
    }

    const storageKey = `yopido:auto-print:${restaurant.id}:${status.charged}`;
    if (window.sessionStorage.getItem(storageKey)) {
      return;
    }

    const opened = printOrderTicket({
      order,
      restaurantName: restaurant.name,
      restaurantLogoUrl: restaurant.logoUrl,
      format: settings.printFormat ?? "thermal_80",
      printLogo: settings.printLogo ?? true,
    });

    if (opened) {
      window.sessionStorage.setItem(storageKey, "1");
      window.setTimeout(() => setBlockedAutoPrintOrderId(""), 0);
    } else {
      window.setTimeout(() => setBlockedAutoPrintOrderId(order.id), 0);
    }
  }, [hasDirectPrintConnector, ordersById, restaurant.id, restaurant.logoUrl, restaurant.name, settings?.autoPrintKitchen, settings?.printFormat, settings?.printLogo, status.charged]);

  const blockedAutoPrintOrder = blockedAutoPrintOrderId ? ordersById.get(blockedAutoPrintOrderId) : undefined;

  useEffect(() => {
    let active = true;
    if (!trackingUrl) {
      return;
    }

    QRCode.toDataURL(trackingUrl, { errorCorrectionLevel: "M", margin: 2, width: 320 })
      .then((dataUrl) => {
        if (active) {
          setTrackingQrUrl(dataUrl);
        }
      })
      .catch(() => {
        if (active) {
          setTrackingQrUrl("");
        }
      });

    return () => {
      active = false;
    };
  }, [trackingUrl]);

  const tabs: { key: CashTab; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "venta", label: "Venta POS", icon: Store },
    { key: "pedidos", label: "Pedidos", icon: PackageSearch, count: hasOperationalCounts ? pendingOrders.length + activeTableOrders.length : undefined },
    { key: "delivery", label: "Delivery", icon: Bike, count: hasOperationalCounts ? deliveryOrders.length : undefined },
    { key: "recojo", label: "Recojo", icon: ShoppingBag, count: hasOperationalCounts ? pickupOrders.length : undefined },
    { key: "movimientos", label: "Movimientos", icon: History, count: loadedTab === "movimientos" ? movements.length : undefined },
    { key: "egresos", label: "Caja chica", icon: CreditCard },
    { key: "cierre", label: "Cierre", icon: Calculator },
    { key: "reportes", label: "Reportes", icon: FileText, count: loadedTab === "reportes" ? reports.length : undefined },
  ];

  useEffect(() => {
    const refreshIfVisible = () => {
      if (document.visibilityState !== "visible") {
        return;
      }

      const now = Date.now();
      if (now - lastRefreshAtRef.current < CASH_REFRESH_MIN_GAP_MS) {
        return;
      }

      lastRefreshAtRef.current = now;
      router.refresh();
    };

    const interval = window.setInterval(refreshIfVisible, fallbackRefreshIntervalMs);
    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", refreshIfVisible);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", refreshIfVisible);
    };
  }, [fallbackRefreshIntervalMs, router]);

  function switchTab(nextTab: CashTab) {
    if (nextTab === activeTab) {
      return;
    }

    if (operationalTabs.has(nextTab) && operationalTabs.has(loadedTab)) {
      setActiveTab(nextTab);
      const url = new URL(window.location.href);
      url.searchParams.set("tab", nextTab);
      window.history.replaceState(null, "", `${url.pathname}?${url.searchParams.toString()}`);
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    router.replace(`${url.pathname}?${url.searchParams.toString()}`, { scroll: false });
  }

  const sessionText = summary.session
    ? `Desde ${formatShortTime(summary.session.openedAt)}${summary.session.openedByName ? ` por ${summary.session.openedByName}` : ""}`
    : latestReport
      ? `Ultimo cierre ${formatShortDate(latestReport.session.closedAt ?? latestReport.session.openedAt)}`
      : "Abre caja en Cierre";

  return (
    <div className="space-y-4">
      <section className="rounded-[1.15rem] border border-[var(--border)] bg-[var(--surface)] p-2.5 shadow-sm sm:rounded-[1.25rem] sm:p-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-full sm:h-11 sm:w-11", summary.session ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]")}>
              {summary.session ? <Banknote className="h-4 w-4 sm:h-5 sm:w-5" /> : <Calculator className="h-4 w-4 sm:h-5 sm:w-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Caja / POS</p>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h2 className="text-xl font-black text-[var(--text)] sm:text-2xl">{summary.session ? "Caja abierta" : "Caja cerrada"}</h2>
                <span className="rounded-full bg-[var(--color-neutral-100)] px-2 py-0.5 text-[11px] font-black text-[var(--color-secondary-text)] sm:px-2.5 sm:py-1 sm:text-xs">{sessionText}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:flex lg:items-center">
            {hasFullCashSummary ? (
              <>
                <CompactCashMetric amount={summary.expectedCash} label="Efectivo" tone={summary.session ? "success" : "neutral"} />
                <CompactCashMetric amount={summary.salesTotal} label="Ventas" />
                <CompactCashMetric amount={summary.digitalTotal} label="Digital" />
              </>
            ) : (
              <>
                <CompactCountMetric count={pendingOrders.length + activeTableOrders.length} label="Pedidos" tone={summary.session ? "success" : "neutral"} />
                <CompactCountMetric count={activeDeliveryOrderCount} label="Delivery" />
                <CompactCountMetric count={activePickupOrderCount} label="Recojo" />
              </>
            )}
            <Button className="col-span-3 min-h-10 whitespace-nowrap px-4 text-sm sm:col-span-1 sm:min-h-12" onClick={() => switchTab("cierre")} type="button" variant={summary.session ? "secondary" : "primary"}>
              {summary.session ? "Cerrar turno" : "Abrir caja"}
            </Button>
          </div>
        </div>
      </section>

      {activeTab === "cierre" ? (
      <section className="hidden">
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
              {pendingCancellationReviews > 0 ? (
                <div className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">
                  Hay {pendingCancellationReviews} anulacion{pendingCancellationReviews === 1 ? "" : "es"} cobrada{pendingCancellationReviews === 1 ? "" : "s"} pendiente{pendingCancellationReviews === 1 ? "" : "s"} de aprobacion del dueno.
                </div>
              ) : null}
              <Input min={0} name="countedAmount" placeholder="Efectivo contado al cierre" required step="0.01" type="number" />
              <Textarea name="notes" placeholder="Notas de cierre" />
              <Button className="w-full" disabled={pendingCancellationReviews > 0} type="submit" variant="danger">
                {pendingCancellationReviews > 0 ? "Requiere aprobacion del dueno" : "Cerrar caja"}
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
      ) : null}

      {banner ? (
        <div className={cn("rounded-2xl p-3 text-sm font-semibold", banner.tone === "success" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]")}>{banner.text}</div>
      ) : null}

      {blockedAutoPrintOrder ? (
        <div className="flex flex-col gap-3 rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-semibold text-[var(--color-warning-strong)] sm:flex-row sm:items-center sm:justify-between">
          <span>El navegador bloqueo la ventana de impresion automatica del pedido {blockedAutoPrintOrder.orderNumber}.</span>
          <Button
            className="min-h-10 shrink-0 px-3 text-xs"
            onClick={() => {
              const opened = printOrderTicket({
                order: blockedAutoPrintOrder,
                restaurantName: restaurant.name,
                restaurantLogoUrl: restaurant.logoUrl,
                format: settings?.printFormat ?? "thermal_80",
                printLogo: settings?.printLogo ?? true,
              });
              if (opened) {
                window.sessionStorage.setItem(`yopido:auto-print:${restaurant.id}:${blockedAutoPrintOrder.id}`, "1");
                setBlockedAutoPrintOrderId("");
              }
            }}
            type="button"
            variant="secondary"
          >
            <Printer className="h-4 w-4" />
            Imprimir ticket
          </Button>
        </div>
      ) : null}

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

              <div className="grid gap-3 rounded-2xl border border-[var(--border)] p-3 sm:grid-cols-[auto_1fr] sm:items-center">
                <button
                  className="mx-auto grid h-36 w-36 place-items-center rounded-2xl bg-white p-2 shadow-sm"
                  disabled={!trackingQrUrl}
                  onClick={() => setShowLargeTrackingQr(true)}
                  type="button"
                >
                  {trackingQrUrl ? <Image alt="QR de seguimiento del pedido" className="h-full w-full" height={128} src={trackingQrUrl} unoptimized width={128} /> : <QrCode className="h-12 w-12 text-[var(--color-secondary-text)]" />}
                </button>
                <div>
                  <p className="text-sm font-black text-[var(--color-heading)]">QR para el cliente</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Escanea y abre el seguimiento del pedido directamente.</p>
                  <button
                    className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-full border border-[var(--border)] px-4 text-sm font-black disabled:opacity-50"
                    disabled={!trackingQrUrl}
                    onClick={() => setShowLargeTrackingQr(true)}
                    type="button"
                  >
                    <Maximize2 className="h-4 w-4" />
                    Ver QR grande
                  </button>
                </div>
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

      {showLargeTrackingQr && trackingQrUrl ? (
        <div className="fixed inset-0 z-[95] grid place-items-center bg-[var(--color-overlay)] p-4 backdrop-blur-sm">
          <div className="w-full max-w-lg rounded-[1.5rem] bg-[var(--surface)] p-5 text-center shadow-2xl">
            <div className="flex items-center justify-between gap-3 text-left">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Seguimiento</p>
                <h2 className="text-xl font-black text-[var(--color-heading)]">Pedido {status.posOrderNumber}</h2>
              </div>
              <button className="grid h-11 w-11 place-items-center rounded-full bg-[var(--color-neutral-100)]" onClick={() => setShowLargeTrackingQr(false)} type="button">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="mx-auto mt-5 grid max-w-sm place-items-center rounded-[1.25rem] bg-white p-5">
              <Image alt="QR grande de seguimiento del pedido" className="h-full w-full" height={360} src={trackingQrUrl} unoptimized width={360} />
            </div>
            <p className="mt-4 break-all text-sm font-semibold text-[var(--color-secondary-text)]">{trackingUrl}</p>
          </div>
        </div>
      ) : null}

      <div className="sticky top-[68px] z-20 -mx-3 flex gap-2 overflow-x-auto border-y border-[var(--border)] bg-[var(--color-card-elevated)] px-3 py-2 shadow-sm backdrop-blur sm:top-[73px] sm:mx-0 sm:rounded-[1.25rem] sm:border lg:static lg:bg-[var(--surface)]">
        {tabs.map((tab) => (
          <button
            className={cn(
              "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-full px-3 text-sm font-black transition sm:min-h-11 sm:px-4",
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

      {activeTab === "pedidos" || activeTab === "delivery" || activeTab === "recojo" ? (
        <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-3 shadow-sm">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted)]" />
            <Input className="pl-11" onChange={(event) => setOrderSearch(event.target.value)} placeholder="Buscar por numero de pedido, nombre o WhatsApp" value={orderSearch} />
          </label>
        </div>
      ) : null}

      {activeTab === "venta" ? (
        <section className="space-y-3 sm:space-y-4">
          <div className="min-w-0">
            <h2 className="text-xl font-bold text-[var(--text)] sm:text-2xl">Venta POS</h2>
            <p className="mt-1 hidden text-sm text-[var(--muted)] sm:block">{catalogLabelTitle} real del negocio, con imagenes, variantes y opciones.</p>
          </div>
          {!activeTabIsLoaded ? (
            <TabLoadingState />
          ) : (
            <POSProductGrid
              businessType={restaurant.businessType}
              categories={categories}
              configuration={configuration}
              disabled={!summary.session}
              products={products}
              restaurantId={restaurant.id}
              restaurantSlug={restaurant.slug}
              settings={settings}
            />
          )}
        </section>
      ) : null}

      {activeTab === "pedidos" ? (
        <section className="space-y-4">
          <SectionTitle title="Pedidos del dia" description={hasKitchenFlow ? "Mesa y POS pendientes para aprobar, cobrar o rechazar." : "Pedidos pendientes para aprobar, cobrar o rechazar."} />
          {!activeTabIsLoaded ? (
            <TabLoadingState />
          ) : visiblePendingOrders.length || visibleActiveTableOrders.length ? (
            <div className="grid gap-3">
              {visiblePendingOrders.map((order) => (
                <PendingOrderReviewCard businessType={restaurant.businessType} context="caja" disabled={!summary.session} key={order.id} order={order} restaurantSlug={restaurant.slug} />
              ))}
              {visibleActiveTableOrders.map((order) => (
                <TableServiceOrderCard businessType={restaurant.businessType} key={order.id} now={now} order={order} restaurantSlug={restaurant.slug} />
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
          ) : visibleDeliveryOrders.length ? (
            <div className="grid gap-3">
              {visibleDeliveryOrders.map((order) =>
                order.status === "pending" ? (
                  <PendingOrderReviewCard businessType={restaurant.businessType} context="caja" disabled={!summary.session} key={order.id} order={order} restaurantSlug={restaurant.slug} />
                ) : (
                  <DeliveryOrderCard businessType={restaurant.businessType} key={order.id} now={now} order={order} restaurantSlug={restaurant.slug} />
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
          ) : visiblePickupOrders.length ? (
            <div className="grid gap-3">
              {visiblePickupOrders.map((order) =>
                order.status === "pending" ? (
                  <PendingOrderReviewCard businessType={restaurant.businessType} context="caja" disabled={!summary.session} key={order.id} order={order} restaurantSlug={restaurant.slug} />
                ) : (
                  <PickupOrderCard businessType={restaurant.businessType} key={order.id} now={now} order={order} restaurantSlug={restaurant.slug} />
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
          <CashSessionControl cashAudit={cashAudit} latestReport={latestReport} pendingCancellationReviews={pendingCancellationReviews} restaurantId={restaurant.id} summary={summary} />
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

function CompactCashMetric({ label, amount, tone = "neutral" }: { label: string; amount: number; tone?: "neutral" | "success" }) {
  return (
    <div className={cn("min-w-0 rounded-2xl px-3 py-2", tone === "success" ? "bg-[var(--color-success-soft)]" : "bg-[var(--color-neutral-100)]")}>
      <p className={cn("truncate text-[10px] font-black uppercase tracking-[0.12em]", tone === "success" ? "text-[var(--color-success-strong)]" : "text-[var(--color-secondary-text)]")}>{label}</p>
      <p className={cn("truncate text-sm font-black sm:text-base", tone === "success" ? "text-[var(--color-success-strong)]" : "text-[var(--color-heading)]")}>{formatMoney(amount)}</p>
    </div>
  );
}

function CompactCountMetric({ label, count, tone = "neutral" }: { label: string; count: number; tone?: "neutral" | "success" }) {
  return (
    <div className={cn("min-w-0 rounded-2xl px-3 py-2", tone === "success" ? "bg-[var(--color-success-soft)]" : "bg-[var(--color-neutral-100)]")}>
      <p className={cn("truncate text-[10px] font-black uppercase tracking-[0.12em]", tone === "success" ? "text-[var(--color-success-strong)]" : "text-[var(--color-secondary-text)]")}>{label}</p>
      <p className={cn("truncate text-sm font-black sm:text-base", tone === "success" ? "text-[var(--color-success-strong)]" : "text-[var(--color-heading)]")}>{count}</p>
    </div>
  );
}

function CashSessionControl({
  restaurantId,
  summary,
  latestReport,
  pendingCancellationReviews,
  cashAudit,
}: {
  restaurantId: string;
  summary: CashSummary;
  latestReport?: CashSessionReport;
  pendingCancellationReviews: number;
  cashAudit: CashAuditSnapshot | null;
}) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Control de turno</p>
          <h2 className="mt-1 text-2xl font-black text-[var(--text)]">{summary.session ? "Caja abierta" : "Caja cerrada"}</h2>
          <p className="mt-2 max-w-2xl text-sm font-semibold text-[var(--muted)]">
            {summary.session
              ? `Abierta el ${formatShortDate(summary.session.openedAt)} a las ${formatShortTime(summary.session.openedAt)}${summary.session.openedByName ? ` por ${summary.session.openedByName}` : ""}.`
              : latestReport
                ? `Ultimo cierre: ${formatShortDate(latestReport.session.closedAt ?? latestReport.session.openedAt)} a las ${formatShortTime(latestReport.session.closedAt ?? latestReport.session.openedAt)}.`
                : "Abre la caja primero. Sin caja abierta no se pueden aprobar pedidos ni cobrar POS."}
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <SessionMetric amount={summary.salesTotal} detail={`${summary.orderCount} cobros`} label="Ventas turno" />
            <SessionMetric amount={summary.cashTotal} label="Ventas efectivo" />
            <SessionMetric amount={summary.digitalTotal} label="Cobros digitales" />
            <SessionMetric amount={summary.cashExpenses} danger label="Egresos efectivo" />
          </div>

          {cashAudit ? (
            <div className="mt-4 rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]">
                  <AlertTriangle className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-black text-[var(--text)]">Auditoria del turno</p>
                  <p className="text-xs font-bold text-[var(--muted)]">Revisa anulaciones y reembolsos antes de cuadrar caja.</p>
                </div>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                <AuditMetric label="Reembolsos" value={`${cashAudit.refundCount} / ${formatMoney(cashAudit.refundTotal)}`} />
                <AuditMetric label="Pendientes" tone={cashAudit.pendingCancellationReviews > 0 ? "warning" : "neutral"} value={String(cashAudit.pendingCancellationReviews)} />
                <AuditMetric label="Aprobadas" value={String(cashAudit.approvedCancellationReviews)} />
                <AuditMetric label="Observadas" tone={cashAudit.observedCancellationReviews > 0 ? "warning" : "neutral"} value={String(cashAudit.observedCancellationReviews)} />
                <AuditMetric label="Afectan caja" tone={cashAudit.cashLinkedCancellationReviews > 0 ? "warning" : "neutral"} value={String(cashAudit.cashLinkedCancellationReviews)} />
              </div>
            </div>
          ) : null}
        </div>

        <div className="rounded-[1.25rem] border border-[var(--border)] bg-[var(--color-surface)] p-3">
          <SectionTitle title={summary.session ? "Cierre rapido" : "Apertura"} description={summary.session ? "Cuenta solo el efectivo fisico." : "Registra el monto inicial de billetes y monedas."} />
          {summary.session ? (
            <form action={closeCashSessionAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurantId} />
              <div className="rounded-2xl bg-[var(--surface)] p-3">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Debe haber en efectivo</p>
                <p className="text-2xl font-black text-[var(--color-heading)]">{formatMoney(summary.expectedCash)}</p>
              </div>
              {pendingCancellationReviews > 0 ? (
                <div className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">
                  Hay {pendingCancellationReviews} anulacion{pendingCancellationReviews === 1 ? "" : "es"} cobrada{pendingCancellationReviews === 1 ? "" : "s"} pendiente{pendingCancellationReviews === 1 ? "" : "s"} de aprobacion del dueno.
                </div>
              ) : null}
              <Input min={0} name="countedAmount" placeholder="Efectivo contado al cierre" required step="0.01" type="number" />
              <Textarea name="notes" placeholder="Notas de cierre" />
              <Button className="w-full" disabled={pendingCancellationReviews > 0} type="submit" variant="danger">
                {pendingCancellationReviews > 0 ? "Requiere aprobacion del dueno" : "Cerrar caja"}
              </Button>
            </form>
          ) : (
            <form action={openCashSessionAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurantId} />
              <Input min={0} name="openingAmount" placeholder="Monto inicial de apertura" required step="0.01" type="number" />
              <Textarea name="notes" placeholder="Notas de apertura" />
              <Button className="w-full" type="submit">
                Abrir caja
              </Button>
            </form>
          )}
        </div>
      </div>
    </Card>
  );
}

function DeliveryOrderCard({ order, restaurantSlug, businessType, now }: { order: Order; restaurantSlug: string; businessType: Restaurant["businessType"]; now: Date }) {
  const isReady = order.status === "ready";
  const isActive = order.status === "accepted" || order.status === "preparing";
  const dispatchStatus = order.status === "delivered" ? "delivered" : order.deliveryDispatch?.status;
  const hasKitchenFlow = businessTypeSupportsKitchen(businessType);

  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <OrderOperationalSummary businessType={businessType} now={now} order={order} title="Delivery" />
        {dispatchStatus === "delivered" ? (
          <DispatchStatusPanel label="Entregado" tone="success" value={order.deliveryDispatch?.deliveredAt ?? order.deliveredAt} />
        ) : dispatchStatus === "arrived" ? (
          <DispatchStatusPanel label="La moto ya llego" tone="info" value={order.deliveryDispatch?.arrivedAt} />
        ) : isReady ? (
          <DeliveryDispatchPanel compact order={order} restaurantSlug={restaurantSlug} />
        ) : isActive ? (
          <OrderReadyActionPanel now={now} order={order} restaurantSlug={restaurantSlug} tab="delivery" />
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

function PickupOrderCard({ order, restaurantSlug, businessType, now }: { order: Order; restaurantSlug: string; businessType: Restaurant["businessType"]; now: Date }) {
  const isActive = order.status === "accepted" || order.status === "preparing";

  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
        <OrderOperationalSummary businessType={businessType} now={now} order={order} title="Recojo" />
        {isActive ? (
          <OrderReadyActionPanel now={now} order={order} restaurantSlug={restaurantSlug} tab="recojo" />
        ) : order.status === "ready" ? (
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

function TableServiceOrderCard({ order, restaurantSlug, businessType, now }: { order: Order; restaurantSlug: string; businessType: Restaurant["businessType"]; now: Date }) {
  const isActive = order.status === "accepted" || order.status === "preparing";

  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-start">
        <OrderOperationalSummary businessType={businessType} now={now} order={order} title="Mesa" />
        {isActive ? (
          <OrderReadyActionPanel now={now} order={order} restaurantSlug={restaurantSlug} tab="pedidos" />
        ) : order.status === "ready" ? (
          <form action={updateOrderStatusAction} className="rounded-2xl border border-[var(--border)] p-3">
            <input name="restaurantId" type="hidden" value={order.restaurantId} />
            <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
            <input name="orderId" type="hidden" value={order.id} />
            <input name="source" type="hidden" value="caja" />
            <input name="tab" type="hidden" value="pedidos" />
            <p className="mb-3 text-xs font-bold leading-5 text-[var(--muted)]">Cuando el pedido ya fue entregado a la mesa, marcalo como servido para cerrar el seguimiento.</p>
            <Button className="w-full" name="status" type="submit" value="delivered">
              Marcar servido
            </Button>
          </form>
        ) : (
          <div className="rounded-2xl bg-[var(--color-warning-soft)] p-4 text-sm font-bold text-[var(--color-warning-strong)]">
            {businessTypeSupportsKitchen(businessType) ? "Aun esta en cocina." : "Aun esta en preparacion."} Cuando quede listo podras marcarlo como servido.
          </div>
        )}
      </div>
    </Card>
  );
}

function OrderReadyActionPanel({ order, restaurantSlug, tab, now }: { order: Order; restaurantSlug: string; tab: "delivery" | "recojo" | "pedidos"; now: Date }) {
  const dueAt = kitchenDueDate(order);
  const remainingMinutes = minutesUntil(dueAt, now);
  const overdue = remainingMinutes <= 0;

  return (
    <form action={updateOrderStatusAction} className={cn("rounded-2xl border p-3", overdue ? "border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)]" : "border-[var(--border)]")}>
      <input name="restaurantId" type="hidden" value={order.restaurantId} />
      <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
      <input name="orderId" type="hidden" value={order.id} />
      <input name="source" type="hidden" value="caja" />
      <input name="tab" type="hidden" value={tab} />
      <div className={cn("mb-3 flex items-start gap-2 text-xs font-bold leading-5", overdue ? "text-[var(--color-danger-strong)]" : "text-[var(--muted)]")}>
        {overdue ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <Clock3 className="mt-0.5 h-4 w-4 shrink-0" />}
        <p>{overdue ? `Tiempo cumplido hace ${elapsedLabel(Math.abs(remainingMinutes))}.` : `Meta ${orderPrepMinutes(order)} min, objetivo ${formatShortTime(dueAt)}.`} Marca listo solo cuando cocina avise el numero.</p>
      </div>
      <Button className="w-full" name="status" type="submit" value="ready">
        <CheckCircle2 className="h-4 w-4" />
        Marcar listo
      </Button>
    </form>
  );
}

function OrderOperationalSummary({ order, title, businessType, now }: { order: Order; title: string; businessType: Restaurant["businessType"]; now: Date }) {
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
        <OrderTimingBadge now={now} order={order} />
      </div>
      <p className="mt-2 text-sm font-semibold text-[var(--muted)]">
        {order.customerName || "Cliente"} | {order.customerPhone || "Sin telefono"}
        {order.orderType === "delivery" ? ` | ${order.customerAddress || "Sin direccion"}` : ""}
      </p>
      {order.deliveryAddressDetail ? <p className="mt-2 text-sm font-bold text-[var(--text)]">Referencia: {order.deliveryAddressDetail}</p> : null}
      {order.orderType === "delivery" && order.deliveryDistanceKm != null ? (
        <p className="mt-2 text-sm font-bold text-[var(--primary)]">
          Distancia: {order.deliveryDistanceKm.toFixed(1)} km{order.requiresPrepayment ? " | Prepago QR obligatorio" : ""}
        </p>
      ) : null}
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

function OrderTimingBadge({ order, now }: { order: Order; now: Date }) {
  const dueAt = kitchenDueDate(order);
  const remainingMinutes = minutesUntil(dueAt, now);

  if (order.status === "ready") {
    const readyWait = minutesSince(order.readyAt ?? dueAt.toISOString(), now);
    const late = readyWait >= READY_PICKUP_WARNING_MINUTES;
    return (
      <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black", late ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" : "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]")}>
        <CheckCircle2 className="h-3 w-3" />
        Listo hace {elapsedLabel(readyWait)}
      </span>
    );
  }

  if (order.status === "delivered") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-black text-[var(--color-body)]">
        <CheckCircle2 className="h-3 w-3" />
        Cerrado
      </span>
    );
  }

  if (order.status !== "accepted" && order.status !== "preparing") {
    return null;
  }

  const overdue = remainingMinutes <= 0;
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-black", overdue ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" : "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]")}>
      {overdue ? <AlertTriangle className="h-3 w-3" /> : <Clock3 className="h-3 w-3" />}
      {overdue ? `+${elapsedLabel(Math.abs(remainingMinutes))}` : `${remainingMinutes} min`} cocina
    </span>
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

function AuditMetric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "warning" }) {
  return (
    <div className={cn("rounded-2xl px-3 py-2", tone === "warning" ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--color-surface)] text-[var(--color-heading)]")}>
      <p className="text-[10px] font-black uppercase tracking-[0.12em]">{label}</p>
      <p className="mt-1 truncate text-sm font-black">{value}</p>
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
