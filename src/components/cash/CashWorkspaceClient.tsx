"use client";

import { CreditCard, History, PackageSearch, ReceiptText, Store, type LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { closeCashSessionAction, openCashSessionAction, registerCashExpenseAction } from "@/app/admin/actions";
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
import type { CashMovement, CashSummary } from "@/types/cash.types";
import type { Order } from "@/types/order.types";
import type { Category, Product, ProductConfiguration } from "@/types/product.types";
import type { Restaurant } from "@/types/restaurant.types";

type CashTab = "venta" | "pedidos" | "movimientos" | "egresos" | "resumen";

function normalizeTab(value: string | undefined): CashTab {
  if (value === "pedidos" || value === "movimientos" || value === "egresos" || value === "resumen") {
    return value;
  }
  return "venta";
}

function statusMessage(status: CashPageStatus) {
  if (status.opened) {
    return { tone: "success", text: "Caja abierta correctamente." };
  }
  if (status.closed) {
    return { tone: "success", text: "Caja cerrada correctamente." };
  }
  if (status.charged) {
    return { tone: "success", text: "Pedido aprobado, cobrado y enviado a cocina." };
  }
  if (status.pos) {
    return { tone: "success", text: "Venta POS cobrada y enviada a cocina." };
  }
  if (status.expense) {
    return { tone: "success", text: "Egreso registrado correctamente." };
  }
  if (status.rejected) {
    return { tone: "success", text: "Pedido rechazado correctamente." };
  }
  if (!status.error) {
    return null;
  }

  const message =
    status.error === "no-open-session"
      ? "Necesitas una caja abierta para operar."
      : status.error === "receipt-required"
        ? "Para pago QR el comprobante es obligatorio."
        : status.error === "already-paid"
          ? "Ese pedido ya fue cobrado."
          : status.error === "cash-required"
            ? "El pedido debe estar cobrado antes de pasar a cocina."
            : `No se pudo completar la accion: ${status.error}.`;

  return { tone: "error", text: message };
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
  orders,
  status,
}: {
  restaurant: Restaurant;
  summary: CashSummary;
  categories: Category[];
  products: Product[];
  configuration: ProductConfiguration;
  movements: CashMovement[];
  orders: Order[];
  status: CashPageStatus;
}) {
  const [activeTab, setActiveTab] = useState<CashTab>(() => normalizeTab(status.tab));

  const pendingOrders = useMemo(() => orders.filter((order) => order.status === "pending"), [orders]);
  const banner = statusMessage(status);
  const tabs: { key: CashTab; label: string; icon: LucideIcon; count?: number }[] = [
    { key: "venta", label: "Venta POS", icon: Store },
    { key: "pedidos", label: "Pedidos", icon: PackageSearch, count: pendingOrders.length },
    { key: "movimientos", label: "Movimientos", icon: History, count: movements.length },
    { key: "egresos", label: "Egresos", icon: CreditCard },
    { key: "resumen", label: "Resumen", icon: ReceiptText },
  ];

  function switchTab(nextTab: CashTab) {
    setActiveTab(nextTab);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", nextTab);
    window.history.replaceState({}, "", url.toString());
  }

  return (
    <div className="space-y-6">
      <section className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
        <Card className="rounded-[1.5rem] p-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--primary)]">Apertura y cierre</p>
              <h2 className="mt-1 text-3xl font-black text-[var(--text)]">{summary.session ? "Caja abierta" : "Caja cerrada"}</h2>
              <p className="mt-2 max-w-2xl text-sm font-semibold text-[var(--muted)]">
                {summary.session
                  ? `Abierta el ${formatShortDate(summary.session.openedAt)} a las ${formatShortTime(summary.session.openedAt)}.`
                  : "Abre la caja primero. Sin caja abierta no se pueden aprobar pedidos ni cobrar POS."}
              </p>
            </div>
            <div className="rounded-2xl bg-[var(--primary-light)] px-4 py-3 text-right">
              <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Apertura</p>
              <p className="text-2xl font-black text-[var(--primary-dark)]">{formatMoney(summary.session?.openingAmount ?? 0)}</p>
            </div>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <SessionMetric amount={summary.salesTotal} detail={`${summary.orderCount} cobros`} label="Ventas del turno" />
            <SessionMetric amount={summary.cashTotal} label="Efectivo" />
            <SessionMetric amount={summary.qrTotal + summary.transferTotal} label="QR / transferencia" />
          </div>
        </Card>

        <Card className="rounded-[1.5rem] p-5">
          <SectionTitle
            title="Control de caja"
            description={
              summary.session
                ? "Registra el cierre cuando termines el turno."
                : "Abre la caja para habilitar pedidos, cobros y ventas POS."
            }
          />

          {summary.session ? (
            <form action={closeCashSessionAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <Input min={0} name="countedAmount" placeholder="Monto contado al cierre" step="0.01" type="number" />
              <Textarea name="notes" placeholder="Notas de cierre" />
              <Button className="w-full" type="submit" variant="danger">
                Cerrar caja
              </Button>
            </form>
          ) : (
            <form action={openCashSessionAction} className="mt-4 space-y-3">
              <input name="restaurantId" type="hidden" value={restaurant.id} />
              <Input min={0} name="openingAmount" placeholder="Monto inicial de apertura" step="0.01" type="number" />
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
          <SectionTitle title="Venta POS" description="Usa el mismo catalogo real del restaurante, con imagenes, variantes y agregados." />
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
          <SectionTitle title="Pedidos pendientes" description="Todo pedido de mesa o de afuera pasa primero por caja. Aqui se aprueba, cobra o rechaza." />
          {pendingOrders.length ? (
            <div className="grid gap-3">
              {pendingOrders.map((order) => (
                <PendingOrderReviewCard context="caja" disabled={!summary.session} key={order.id} order={order} restaurantSlug={restaurant.slug} />
              ))}
            </div>
          ) : (
            <EmptyState title="Sin pedidos pendientes" description="Cuando llegue un pedido nuevo aparecera aqui para cobro y aprobacion." />
          )}
        </section>
      ) : null}

      {activeTab === "movimientos" ? (
        <Card className="rounded-[1.5rem]">
          <SectionTitle title="Movimientos" description="Cobros, egresos, apertura y cierre del turno actual." />
          <div className="mt-4">
            {movements.length ? movements.map((movement) => <CashMovementRow key={movement.id} movement={movement} />) : <EmptyState title="Sin movimientos" description="Los movimientos del turno apareceran aqui." />}
          </div>
        </Card>
      ) : null}

      {activeTab === "egresos" ? (
        <Card className="max-w-2xl rounded-[1.5rem]">
          <SectionTitle title="Registrar egreso" description="Gastos del turno. Si la caja esta cerrada, este formulario queda bloqueado." />
          <form action={registerCashExpenseAction} className="mt-4 space-y-3">
            <input name="restaurantId" type="hidden" value={restaurant.id} />
            <Input disabled={!summary.session} min={0.01} name="amount" placeholder="Monto del egreso" step="0.01" type="number" />
            <Select defaultValue="cash" disabled={!summary.session} name="paymentMethod">
              <option value="cash">Efectivo</option>
              <option value="qr">QR</option>
              <option value="bank_transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="other">Otro</option>
            </Select>
            <Input disabled={!summary.session} name="description" placeholder="Descripcion del egreso" />
            <Button className="w-full" disabled={!summary.session} type="submit" variant="secondary">
              Guardar egreso
            </Button>
          </form>
        </Card>
      ) : null}

      {activeTab === "resumen" ? (
        <section className="space-y-6">
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <CashSummaryCard amount={summary.salesTotal} detail={`${summary.orderCount} pedidos cobrados`} label="Ventas del dia" />
            <CashSummaryCard amount={summary.cashTotal} label="Efectivo" />
            <CashSummaryCard amount={summary.qrTotal + summary.transferTotal} label="QR / transferencia" />
            <CashSummaryCard amount={summary.netTotal} detail="Ventas menos egresos" label="Neto" />
          </div>
          <Card className="rounded-[1.5rem]">
            <SectionTitle title="Lectura rapida" description="Vista compacta del turno para cajero y encargado." />
            <div className="mt-4 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-500">Ventas</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(summary.salesTotal)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-500">Egresos</p>
                <p className="mt-1 text-2xl font-black text-red-600">{formatMoney(summary.expenses)}</p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-500">Ticket promedio</p>
                <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(summary.averageTicket)}</p>
              </div>
            </div>
          </Card>
        </section>
      ) : null}
    </div>
  );
}

function SessionMetric({ label, amount, detail }: { label: string; amount: number; detail?: string }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-4">
      <p className="text-sm font-semibold text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-black text-slate-950">{formatMoney(amount)}</p>
      {detail ? <p className="mt-1 text-xs font-bold text-slate-500">{detail}</p> : null}
    </div>
  );
}
