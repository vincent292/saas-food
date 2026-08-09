"use client";

import { ChevronDown, Clock3, ReceiptText, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { chargeOrderAction, rejectCashOrderAction } from "@/app/admin/actions";
import { groupReceiptLinksFromNotes, orderSourceLabel, orderTypeLabels, paymentMethodLabels } from "@/components/orders/orderPresentation";
import { ReceiptViewerButton } from "@/components/payments/ReceiptViewerButton";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { formatShortTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import { businessPreparationAreaLabel, businessTypeSupportsKitchen } from "@/lib/restaurant-directory-options";
import type { Order } from "@/types/order.types";
import type { BusinessType } from "@/types/restaurant.types";

type PendingOrderContext = "pedidos" | "caja";

function whatsappHref(order: Order) {
  const phone = order.customerPhone;
  const digits = phone.replace(/\D/g, "");
  const message =
    order.orderType === "table" && order.status === "pending"
      ? encodeURIComponent(`Hola ${order.customerName || ""}, tu pedido ${order.orderNumber} esta pendiente. Para que se procese, por favor acercate a caja y confirma el pago indicando tu numero de pedido.`)
      : encodeURIComponent(`Hola, te escribimos por tu pedido ${order.orderNumber}. No pudimos aprobarlo. Escribenos para ayudarte.`);
  return digits ? `https://wa.me/${digits}?text=${message}` : "";
}

export function PendingOrderReviewCard({
  order,
  restaurantSlug,
  context,
  disabled = false,
  businessType = "food",
}: {
  order: Order;
  restaurantSlug: string;
  context: PendingOrderContext;
  disabled?: boolean;
  businessType?: BusinessType;
}) {
  const [paymentMethod, setPaymentMethod] = useState<Order["paymentMethod"]>(order.paymentMethod);
  const [showReject, setShowReject] = useState(false);
  const whatsappUrl = whatsappHref(order);
  const pendingLabel = context === "pedidos" ? "Pendiente por aprobar" : "Pendiente de caja";
  const hasReceiptEvidence = Boolean(order.paymentReceiptUrl || order.paymentReceiptReference);
  const groupReceipts = groupReceiptLinksFromNotes(order.notes);
  const preparationArea = businessPreparationAreaLabel(businessType);
  const hasKitchenFlow = businessTypeSupportsKitchen(businessType);
  const approvalCopy =
    context === "pedidos"
      ? hasKitchenFlow
        ? "Aprueba aqui para enviarlo directo a cocina."
        : `Aprueba aqui para enviarlo a ${preparationArea}.`
      : hasKitchenFlow
        ? "Cobro y validacion del pedido antes de cocina."
        : `Cobro y validacion del pedido antes de pasarlo a ${preparationArea}.`;

  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-black text-[var(--text)]">{order.orderNumber}</p>
            <span className="rounded-full bg-[var(--color-neutral-100)] px-3 py-1 text-xs font-black text-[var(--color-body)]">{orderSourceLabel(order)}</span>
            <span className="rounded-full bg-[var(--color-warning-soft)] px-3 py-1 text-xs font-black text-[var(--color-warning-strong)]">{pendingLabel}</span>
            {order.paymentReceiptUrl ? <span className="rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-xs font-black text-[var(--color-success-strong)]">Comprobante recibido</span> : null}
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <InfoChip icon={<WalletCards className="h-4 w-4" />} label="Total" value={formatMoney(order.total)} />
            <InfoChip icon={<ReceiptText className="h-4 w-4" />} label="Pago" value={paymentMethodLabels[paymentMethod]} />
            <InfoChip icon={<Clock3 className="h-4 w-4" />} label="Creado" value={formatShortTime(order.createdAt)} />
          </div>

          <p className="mt-3 text-sm font-semibold text-[var(--muted)]">
            {order.customerName || "Cliente"} | {order.customerPhone || "Sin WhatsApp"} | {orderTypeLabels[order.orderType]}
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
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl bg-[var(--primary-light)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Decision de caja</p>
            <p className="mt-1 text-2xl font-black text-[var(--primary-dark)]">{formatMoney(order.total)}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {approvalCopy}
            </p>
            {order.paymentReceiptReference ? <p className="mt-2 text-xs font-black text-[var(--primary-dark)]">Referencia: {order.paymentReceiptReference}</p> : null}
            {order.paymentReceiptUrl ? (
              <div className="mt-3">
                <ReceiptViewerButton label="Ver comprobante final" receiptLabel={`Comprobante final ${order.orderNumber}`} subtitle={order.paymentReceiptReference ? `Referencia: ${order.paymentReceiptReference}` : undefined} url={order.paymentReceiptUrl} />
              </div>
            ) : null}
            {groupReceipts.length ? (
              <div className="mt-3 grid gap-2 rounded-2xl bg-[var(--surface)] p-3">
                <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Comprobantes del grupo</p>
                {groupReceipts.map((receipt) => (
                  <ReceiptViewerButton key={`${receipt.label}-${receipt.url}`} label={receipt.label} receiptLabel={`Comprobante de ${receipt.label}`} subtitle={order.orderNumber} url={receipt.url} />
                ))}
              </div>
            ) : null}
          </div>

          {!disabled ? null : <div className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">Abre caja para aprobar y sumar este pedido al turno actual.</div>}

          <form action={chargeOrderAction} className="grid gap-3 rounded-2xl border border-[var(--border)] p-3">
            <input name="restaurantId" type="hidden" value={order.restaurantId} />
            <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
            <input name="orderId" type="hidden" value={order.id} />
            <input name="source" type="hidden" value={context} />
            <Select name="paymentMethod" onChange={(event) => setPaymentMethod(event.target.value as Order["paymentMethod"])} value={paymentMethod}>
              <option value="cash">Efectivo</option>
              <option value="qr">QR</option>
              <option value="bank_transfer">Transferencia</option>
              <option value="card">Tarjeta</option>
              <option value="other">Otro</option>
            </Select>
            {paymentMethod === "qr" ? (
              <>
                {hasReceiptEvidence ? (
                  <div className="rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]">
                    Comprobante ya recibido. Solo revisa la referencia o abre la imagen antes de aprobar.
                  </div>
                ) : (
                  <>
                    <Input name="paymentReceiptReference" placeholder="Número de comprobante o referencia QR" />
                    <CompressedImageInput acceptPdf help="Sube captura o PDF del pago. Las imagenes se optimizan en WebP." label="Comprobante QR" name="paymentReceiptFile" required />
                  </>
                )}
              </>
            ) : null}
            <Button disabled={disabled} type="submit">
              Aprobar y cobrar
            </Button>
          </form>

          <div className="rounded-2xl border border-[var(--color-danger-soft)] p-3">
            <button
              className="flex w-full items-center justify-between gap-3 text-left text-sm font-black text-[var(--color-danger-strong)]"
              onClick={() => setShowReject((current) => !current)}
              type="button"
            >
              Quitar de vista / cancelar
              <ChevronDown className={cn("h-4 w-4 transition", showReject ? "rotate-180" : "")} />
            </button>
            {showReject ? (
              <form action={rejectCashOrderAction} className="mt-3 grid gap-3">
                <input name="restaurantId" type="hidden" value={order.restaurantId} />
                <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
                <input name="orderId" type="hidden" value={order.id} />
                <input name="source" type="hidden" value={context} />
                <Textarea name="reason" placeholder="Motivo obligatorio para cancelar o quitar de vista" required />
                <Button className="w-full" type="submit" variant="danger">
                  Confirmar cancelacion
                </Button>
              </form>
            ) : null}
          </div>

          {whatsappUrl ? (
            <a className={cn(buttonClasses("secondary"), "w-full")} href={whatsappUrl} rel="noreferrer" target="_blank">
              {order.orderType === "table" && order.status === "pending" ? "Recordar pago por WhatsApp" : "Avisar por WhatsApp"}
            </a>
          ) : (
            <span className="rounded-full bg-[var(--color-neutral-100)] px-4 py-2 text-center text-sm font-bold text-[var(--color-secondary-text)]">Sin WhatsApp</span>
          )}
        </div>
      </div>
    </Card>
  );
}

function InfoChip({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-sm font-black text-[var(--color-heading)]">{value}</p>
    </div>
  );
}
