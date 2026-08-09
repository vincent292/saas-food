"use client";

import { Eye, ReceiptText, X } from "lucide-react";
import { useState } from "react";
import { ReceiptViewerButton } from "@/components/payments/ReceiptViewerButton";
import { buttonClasses } from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";
import { formatShortDate, formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";
import type { CashMovement } from "@/types/cash.types";
import type { Order } from "@/types/order.types";

const movementLabels: Record<CashMovement["type"], string> = {
  sale: "Venta",
  expense: "Egreso",
  income: "Ingreso",
  adjustment: "Ajuste",
  opening: "Apertura",
  closing: "Cierre",
};

const paymentLabels: Record<CashMovement["paymentMethod"], string> = {
  cash: "Efectivo",
  qr: "QR",
  bank_transfer: "Transferencia",
  card: "Tarjeta",
  other: "Otro",
};

const orderTypeLabels: Record<Order["orderType"], string> = {
  table: "Mesa",
  delivery: "Delivery",
  pickup: "Recojo",
  pos: "POS",
};

const statusLabels: Record<Order["status"], string> = {
  pending: "Pendiente",
  accepted: "Aceptado",
  preparing: "En cocina",
  ready: "Listo",
  delivered: "Entregado",
  cancelled: "Cancelado",
};

export function CashMovementRow({ movement, order }: { movement: CashMovement; order?: Order }) {
  const [open, setOpen] = useState(false);
  const isExpense = movement.type === "expense";
  const isNeutral = movement.type === "opening" || movement.type === "closing";

  return (
    <>
      <div className="grid gap-3 border-b border-[var(--border)] py-3 sm:grid-cols-[1fr_auto] sm:items-center">
        <div className="min-w-0">
          <p className="font-semibold text-[var(--color-heading)]">{movement.description}</p>
          <p className="text-sm text-[var(--color-secondary-text)]">
            {movementLabels[movement.type]} - {paymentLabels[movement.paymentMethod]} - {formatShortTime(movement.createdAt)}
          </p>
          {order ? <p className="mt-1 text-xs font-semibold text-[var(--muted)]">Pedido {order.orderNumber} - {orderTypeLabels[order.orderType]}</p> : null}
        </div>
        <div className="flex items-center justify-between gap-3 sm:justify-end">
          <p
            className={cn(
              "font-black",
              isExpense ? "text-[var(--color-danger)]" : isNeutral ? "text-[var(--color-secondary-text)]" : "text-[var(--color-heading)]",
            )}
          >
            {isExpense ? "-" : isNeutral ? "" : "+"}
            {formatMoney(movement.amount)}
          </p>
          <button className={buttonClasses("secondary", "min-h-9 px-3 text-xs font-black")} onClick={() => setOpen(true)} type="button">
            <Eye className="h-4 w-4" />
            Ver
          </button>
        </div>
      </div>

      {open ? <MovementDetailModal movement={movement} order={order} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function MovementDetailModal({ movement, order, onClose }: { movement: CashMovement; order?: Order; onClose: () => void }) {
  const isQrPayment = movement.paymentMethod === "qr" || order?.paymentMethod === "qr";
  const totalMinutes = order?.deliveredAt ? diffMinutes(order.createdAt, order.deliveredAt) : undefined;
  const kitchenMinutes = order?.readyAt ? diffMinutes(order.acceptedAt ?? order.createdAt, order.readyAt) : undefined;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-[var(--color-overlay)] p-0 text-[var(--text)] backdrop-blur-sm sm:place-items-center sm:p-4">
      <div className="max-h-[94vh] w-full overflow-y-auto rounded-t-[1.5rem] bg-[var(--surface)] shadow-2xl sm:max-w-3xl sm:rounded-[1.5rem]">
        <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[var(--primary)]">Movimiento</p>
            <h2 className="truncate text-2xl font-black text-[var(--color-heading)]">{movement.description}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {formatShortDate(movement.createdAt)} - {formatShortTime(movement.createdAt)}
            </p>
          </div>
          <button className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--color-neutral-100)] hover:bg-[var(--color-neutral-200)]" onClick={onClose} type="button">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid gap-4 p-4">
          <section className="grid gap-3 rounded-[1.25rem] border border-[var(--border)] p-4 sm:grid-cols-3">
            <DetailPill label="Tipo" value={movementLabels[movement.type]} />
            <DetailPill label="Pago" value={paymentLabels[movement.paymentMethod]} />
            <DetailPill label="Monto" value={formatMoney(movement.amount)} strong />
          </section>

          {order ? (
            <>
              <section className="grid gap-3 rounded-[1.25rem] border border-[var(--border)] p-4 sm:grid-cols-2">
                <DetailPill label="Pedido" value={order.orderNumber} strong />
                <DetailPill label="Estado" value={statusLabels[order.status]} />
                <DetailPill label="Canal" value={orderTypeLabels[order.orderType]} />
                <DetailPill label="Cliente" value={order.customerName || "Cliente POS"} />
                <DetailPill label="Telefono" value={order.customerPhone || "Sin telefono"} />
                <DetailPill label="Pago pedido" value={paymentLabels[order.paymentMethod]} />
              </section>

              <section className="rounded-[1.25rem] border border-[var(--border)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-black text-[var(--color-heading)]">Detalle del pedido</h3>
                  <span className="rounded-full bg-[var(--primary-light)] px-3 py-1 text-xs font-black text-[var(--primary-dark)]">{order.items.length} items</span>
                </div>
                <div className="mt-3 divide-y divide-[var(--border)]">
                  {order.items.map((item) => (
                    <div className="grid gap-2 py-3 sm:grid-cols-[1fr_auto] sm:items-center" key={item.id}>
                      <div className="min-w-0">
                        <p className="font-black text-[var(--color-heading)]">
                          {item.quantity}x {item.productName}
                        </p>
                        {item.notes ? <p className="text-sm font-semibold text-[var(--muted)]">{item.notes}</p> : null}
                      </div>
                      <p className="font-black text-[var(--color-heading)]">{formatMoney(item.subtotal)}</p>
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid gap-2 rounded-2xl bg-[var(--color-surface)] p-3 text-sm font-semibold">
                  <div className="flex justify-between gap-3">
                    <span>Subtotal</span>
                    <span>{formatMoney(order.subtotal)}</span>
                  </div>
                  {order.deliveryFee ? (
                    <div className="flex justify-between gap-3">
                      <span>Delivery</span>
                      <span>{formatMoney(order.deliveryFee)}</span>
                    </div>
                  ) : null}
                  {order.discountTotal ? (
                    <div className="flex justify-between gap-3">
                      <span>Descuento</span>
                      <span>-{formatMoney(order.discountTotal)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between gap-3 border-t border-[var(--border)] pt-2 text-lg font-black text-[var(--color-heading)]">
                    <span>Total</span>
                    <span>{formatMoney(order.total)}</span>
                  </div>
                </div>
              </section>

              <section className="grid gap-3 rounded-[1.25rem] border border-[var(--border)] p-4 sm:grid-cols-2 lg:grid-cols-4">
                <DetailPill label="Creado" value={`${formatShortDate(order.createdAt)} ${formatShortTime(order.createdAt)}`} />
                <DetailPill label="Aceptado" value={order.acceptedAt ? formatShortTime(order.acceptedAt) : "Pendiente"} />
                <DetailPill label="Listo" value={order.readyAt ? formatShortTime(order.readyAt) : "Pendiente"} />
                <DetailPill label="Entregado" value={order.deliveredAt ? formatShortTime(order.deliveredAt) : "Pendiente"} />
                <DetailPill label="Tiempo cocina" value={kitchenMinutes !== undefined ? `${kitchenMinutes} min` : "En curso"} />
                <DetailPill label="Tiempo total" value={totalMinutes !== undefined ? `${totalMinutes} min` : "En curso"} />
              </section>
            </>
          ) : (
            <section className="rounded-[1.25rem] border border-[var(--border)] p-4 text-sm font-semibold text-[var(--muted)]">
              Este movimiento no esta vinculado a un pedido de hoy. Puedes revisarlo como registro de caja.
            </section>
          )}

          {isQrPayment ? (
            <section className="rounded-[1.25rem] border border-[var(--border)] p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[var(--primary-light)] text-[var(--primary)]">
                    <ReceiptText className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="font-black text-[var(--color-heading)]">Comprobante QR</h3>
                    <p className="text-sm font-semibold text-[var(--muted)]">{order?.paymentReceiptReference || "Sin referencia registrada"}</p>
                  </div>
                </div>
                {order?.paymentReceiptUrl ? (
                  <ReceiptViewerButton className="min-h-11 px-4" label="Ver comprobante" receiptLabel={`Comprobante ${order.orderNumber}`} subtitle={order.paymentReceiptReference ? `Referencia: ${order.paymentReceiptReference}` : undefined} url={order.paymentReceiptUrl} />
                ) : (
                  <span className="rounded-full bg-[var(--color-warning-soft)] px-4 py-2 text-sm font-black text-[var(--color-warning-strong)]">Sin imagen</span>
                )}
              </div>
            </section>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function DetailPill({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="min-w-0 rounded-2xl bg-[var(--color-surface)] p-3">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      <p className={cn("mt-1 truncate text-sm font-bold text-[var(--color-heading)]", strong && "text-lg font-black")}>{value}</p>
    </div>
  );
}

function diffMinutes(start: string, end: string) {
  return Math.max(0, Math.round((new Date(end).getTime() - new Date(start).getTime()) / 60000));
}
