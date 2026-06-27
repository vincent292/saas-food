"use client";

import { Banknote, Calculator, CreditCard, FileText, History, PackageSearch, ReceiptText, Store, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useMemo, useState } from "react";
import { closeCashSessionAction, openCashSessionAction, registerCashMovementAction } from "@/app/admin/actions";
import { CashMovementRow } from "@/components/cash/CashMovementRow";
import { CashSummaryCard } from "@/components/cash/CashSummaryCard";
import { POSProductGrid } from "@/components/cash/POSProductGrid";
import { PendingOrderReviewCard } from "@/components/orders/PendingOrderReviewCard";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { CashMovement, CashSessionReport, CashSummary } from "@/types/cash.types";
import type { Order } from "@/types/order.types";
import type { Category, Product, ProductConfiguration } from "@/types/product.types";
import type { Restaurant } from "@/types/restaurant.types";

type CashTab = "venta" | "pedidos" | "movimientos" | "egresos" | "cierre" | "reportes";

function normalizeTab(value: string | undefined): CashTab {
  if (value === "pedidos" || value === "movimientos" || value === "egresos" || value === "cierre" || value === "reportes") {
    return value;
  }
  return "venta";
}

function statusMessage(status: CashPageStatus) {
  if (status.opened) {
    return { tone: "success", text: "Caja abierta correctamente." };
  }
  if (status.closed) {
    return { tone: "success", text: "Caja cerrada correctamente. El reporte quedó guardado." };
  }
  if (status.charged) {
    return { tone: "success", text: "Pedido aprobado, cobrado y enviado a cocina." };
  }
  if (status.pos) {
    return { tone: "success", text: "Venta POS cobrada y enviada a cocina." };
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
    "cash-required": "El pedido debe estar cobrado antes de pasar a cocina.",
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
};

export function CashWorkspaceClient({
  restaurant,
  summary,
  categories,
  products,
  configuration,
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
  movements: CashMovement[];
  reports: CashSessionReport[];
  orders: Order[];
  status: CashPageStatus;
}) {
  const [activeTab, setActiveTab] = useState<CashTab>(() => normalizeTab(status.tab));

  const pendingOrders = useMemo(() => orders.filter((order) => order.status === "pending"), [orders]);
  const latestReport = reports[0];
  const banner = statusMessage(status);
  const tabs: { key: CashTab; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "venta", label: "Venta POS", icon: Store },
    { key: "pedidos", label: "Pedidos", icon: PackageSearch, count: pendingOrders.length },
    { key: "movimientos", label: "Movimientos", icon: History, count: movements.length },
    { key: "egresos", label: "Caja chica", icon: CreditCard },
    { key: "cierre", label: "Cierre", icon: Calculator },
    { key: "reportes", label: "Reportes", icon: FileText, count: reports.length },
  ];

  function switchTab(nextTab: CashTab) {
    setActiveTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState({}, "", url.toString());
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
            <div className={cn("rounded-2xl px-4 py-3 text-right", summary.session ? "bg-emerald-50" : "bg-slate-100")}>
              <p className={cn("text-xs font-black uppercase tracking-[0.12em]", summary.session ? "text-emerald-700" : "text-slate-500")}>Efectivo esperado</p>
              <p className={cn("text-2xl font-black", summary.session ? "text-emerald-900" : "text-slate-700")}>{formatMoney(summary.expectedCash)}</p>
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
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-slate-500">Debe haber en efectivo</p>
                <p className="text-2xl font-black text-slate-950">{formatMoney(summary.expectedCash)}</p>
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
        <div className={cn("rounded-2xl p-3 text-sm font-semibold", banner.tone === "success" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-700")}>{banner.text}</div>
      ) : null}

      <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-white p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-black transition",
              activeTab === tab.key ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-[var(--primary-light)]",
            )}
            key={tab.key}
            onClick={() => switchTab(tab.key)}
            type="button"
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
            {tab.count !== undefined ? <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-black", activeTab === tab.key ? "bg-white/15 text-white" : "bg-slate-100 text-slate-600")}>{tab.count}</span> : null}
          </button>
        ))}
      </div>

      {activeTab === "venta" ? (
        <section className="space-y-4">
          <SectionTitle title="Venta POS" description="Catálogo real del restaurante, con imágenes, variantes y agregados." />
          <POSProductGrid
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
          <SectionTitle title="Pedidos pendientes" description="Caja aprueba, cobra o rechaza antes de enviar a cocina." />
          {pendingOrders.length ? (
            <div className="grid gap-3">
              {pendingOrders.map((order) => (
                <PendingOrderReviewCard context="caja" disabled={!summary.session} key={order.id} order={order} restaurantSlug={restaurant.slug} />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin pedidos pendientes" description="Cuando llegue un pedido nuevo aparecerá aquí para cobro y aprobación." />
          )}
        </section>
      ) : null}

      {activeTab === "movimientos" ? (
        <Card>
          <SectionTitle title="Movimientos" description="Cobros, egresos, ingresos, apertura y cierre del turno actual." />
          <div className="mt-4">
            {movements.length ? movements.map((movement) => <CashMovementRow key={movement.id} movement={movement} />) : <EmptyState title="Sin movimientos" description="Los movimientos del turno aparecerán aquí." />}
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
          {reports.length ? (
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

function SessionMetric({ label, amount, detail, danger }: { label: string; amount: number; detail?: string; danger?: boolean }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className={cn("mt-1 text-2xl font-black", danger ? "text-red-600" : "text-slate-950")}>{formatMoney(amount)}</p>
      {detail ? <p className="mt-1 text-xs font-bold text-slate-500">{detail}</p> : null}
    </div>
  );
}

function CloseStep({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
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
        <div className={cn("rounded-2xl px-4 py-3 text-right", difference === 0 ? "bg-emerald-50 text-emerald-800" : difference > 0 ? "bg-blue-50 text-blue-800" : "bg-red-50 text-red-700")}>
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
