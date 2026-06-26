"use client";

import { Clock3, ReceiptText, WalletCards } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { chargeOrderAction, rejectCashOrderAction } from "@/app/admin/actions";
import { orderSourceLabel, orderTypeLabels, paymentMethodLabels } from "@/components/orders/orderPresentation";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { formatShortTime } from "@/lib/utils/dates";
import { cn } from "@/lib/utils/cn";
import { formatMoney } from "@/lib/utils/money";
import type { Order } from "@/types/order.types";

type PendingOrderContext = "pedidos" | "caja";

function whatsappHref(phone: string, orderNumber: string) {
  const digits = phone.replace(/\D/g, "");
  const message = encodeURIComponent(`Hola, te escribimos por tu pedido ${orderNumber}. No pudimos aprobarlo. Escribenos para ayudarte.`);
  return digits ? `https://wa.me/${digits}?text=${message}` : "";
}

export function PendingOrderReviewCard({
  order,
  restaurantSlug,
  context,
  disabled = false,
}: {
  order: Order;
  restaurantSlug: string;
  context: PendingOrderContext;
  disabled?: boolean;
}) {
  const [paymentMethod, setPaymentMethod] = useState<Order["paymentMethod"]>(order.paymentMethod);
  const whatsappUrl = whatsappHref(order.customerPhone, order.orderNumber);
  const pendingLabel = context === "pedidos" ? "Pendiente por aprobar" : "Pendiente de caja";

  return (
    <Card className="rounded-[1.25rem] p-4">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-xl font-black text-[var(--text)]">{order.orderNumber}</p>
            <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700">{orderSourceLabel(order)}</span>
            <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800">{pendingLabel}</span>
            {order.paymentReceiptUrl ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-black text-emerald-700">Comprobante recibido</span> : null}
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
              <div className="rounded-2xl bg-slate-50 p-3" key={item.id}>
                <p className="font-black text-[var(--text)]">
                  {item.quantity}x {item.productName}
                </p>
                {item.notes ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{item.notes}</p> : null}
              </div>
            ))}
          </div>

          {order.notes ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-800">{order.notes}</p> : null}
        </div>

        <div className="space-y-3">
          <div className="rounded-2xl bg-[var(--primary-light)] p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--primary)]">Decision de caja</p>
            <p className="mt-1 text-2xl font-black text-[var(--primary-dark)]">{formatMoney(order.total)}</p>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">
              {context === "pedidos" ? "Aprueba aqui para enviarlo directo a cocina." : "Cobro y validacion del pedido antes de cocina."}
            </p>
            {order.paymentReceiptReference ? <p className="mt-2 text-xs font-black text-[var(--primary-dark)]">Referencia: {order.paymentReceiptReference}</p> : null}
            {order.paymentReceiptUrl ? (
              <a className="mt-3 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-[var(--primary)]" href={order.paymentReceiptUrl} rel="noreferrer" target="_blank">
                Ver comprobante
              </a>
            ) : null}
          </div>

          {!disabled ? null : <div className="rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">Abre caja para aprobar y sumar este pedido al turno actual.</div>}

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
                <Input defaultValue={order.paymentReceiptReference || ""} name="paymentReceiptReference" placeholder="Numero de comprobante o referencia QR" />
                <Input accept="image/*,.pdf" name="paymentReceiptFile" required={!order.paymentReceiptUrl && !order.paymentReceiptReference} type="file" />
              </>
            ) : null}
            <Button disabled={disabled} type="submit">
              Aprobar y cobrar
            </Button>
          </form>

          <form action={rejectCashOrderAction} className="grid gap-3 rounded-2xl border border-red-100 p-3">
            <input name="restaurantId" type="hidden" value={order.restaurantId} />
            <input name="restaurantSlug" type="hidden" value={restaurantSlug} />
            <input name="orderId" type="hidden" value={order.id} />
            <input name="source" type="hidden" value={context} />
            <Textarea name="reason" placeholder="Motivo del rechazo" required />
            <Button className="w-full" type="submit" variant="danger">
              Rechazar pedido
            </Button>
          </form>

          {whatsappUrl ? (
            <a className={cn(buttonClasses("secondary"), "w-full")} href={whatsappUrl} rel="noreferrer" target="_blank">
              Avisar por WhatsApp
            </a>
          ) : (
            <span className="rounded-full bg-slate-100 px-4 py-2 text-center text-sm font-bold text-slate-500">Sin WhatsApp</span>
          )}
        </div>
      </div>
    </Card>
  );
}

function InfoChip({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl bg-slate-50 p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-slate-500">
        {icon}
        <span>{label}</span>
      </div>
      <p className="mt-2 text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}
