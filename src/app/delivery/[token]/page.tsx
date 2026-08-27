import { notFound } from "next/navigation";
import { Bike, CheckCircle2, Clock3, MapPinned, MessageCircle, Phone, ReceiptText, Route, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { markDeliveryArrivedAction, markDeliveryDeliveredAction } from "@/app/delivery/actions";
import { PublicThemeToggle } from "@/components/public-theme/PublicThemeToggle";
import { RealtimeBroadcastRefresh } from "@/components/realtime/RealtimeBroadcastRefresh";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { PendingSubmitButton } from "@/components/ui/PendingSubmitButton";
import { deliveryService } from "@/lib/services/delivery.service";
import { formatShortTime } from "@/lib/utils/dates";
import { directionsToMapsUrl, hasValidCoordinates } from "@/lib/utils/google-maps";
import { formatMoney } from "@/lib/utils/money";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function whatsappHref(phone: string, orderNumber: string) {
  const digits = digitsOnly(phone);
  if (!digits) {
    return "";
  }
  const message = encodeURIComponent(`Hola, estoy con tu pedido ${orderNumber}.`);
  return `https://wa.me/${digits}?text=${message}`;
}

export default async function DeliveryOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ arrived?: string; delivered?: string; error?: string }>;
}) {
  const [{ token }, status] = await Promise.all([params, searchParams]);
  const order = await deliveryService.getByToken(token);

  if (!order) {
    notFound();
  }

  const canMarkArrived = order.orderStatus !== "delivered" && order.linkStatus === "active";
  const canMarkDelivered = order.orderStatus !== "delivered" && ["active", "arrived"].includes(order.linkStatus);
  const deliveryStatusLabel = order.orderStatus === "delivered" ? "Entregado" : order.linkStatus === "arrived" ? "En ubicacion" : "En entrega";
  const mapUrl = hasValidCoordinates(order.deliveryLatitude, order.deliveryLongitude)
    ? directionsToMapsUrl({
        address: order.customerAddress,
        latitude: order.deliveryLatitude,
        longitude: order.deliveryLongitude,
      })
    : order.deliveryMapsUrl?.trim() || directionsToMapsUrl({ address: order.customerAddress });
  const phoneDigits = digitsOnly(order.customerPhone);
  const waUrl = whatsappHref(order.customerPhone, order.orderNumber);

  return (
    <main className="public-brand-theme min-h-screen bg-[var(--background)] px-4 py-5 text-[var(--text)] sm:px-6">
      <RealtimeBroadcastRefresh enabled={order.orderStatus !== "delivered"} topic={`delivery:${token}`} />
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex justify-end">
          <PublicThemeToggle />
        </div>
        <section className="rounded-[1.5rem] bg-[linear-gradient(145deg,var(--primary)_0%,var(--primary-dark)_100%)] p-5 text-[var(--color-on-primary)] shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge className="bg-[var(--surface)]/10 text-[var(--color-on-primary)]">
                <Bike className="mr-1.5 h-3.5 w-3.5" />
                Repartidor
              </Badge>
              <h1 className="mt-4 text-3xl font-black leading-tight">Pedido {order.orderNumber}</h1>
              <p className="mt-2 text-sm font-semibold text-[var(--color-on-primary-muted)]">{order.restaurantName}</p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--accent)] text-[var(--primary)] shadow-[var(--shadow-glow)]">
              <Route className="h-6 w-6" />
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            <InfoPill icon={<Clock3 className="h-4 w-4" />} label="Estado" value={deliveryStatusLabel} />
            <InfoPill icon={<ReceiptText className="h-4 w-4" />} label="Total" value={formatMoney(order.total)} />
            <InfoPill icon={<ShieldCheck className="h-4 w-4" />} label="Acceso" value="Link seguro" />
          </div>
        </section>

        {status.delivered ? (
          <div className="rounded-2xl bg-[var(--color-success-soft)] p-4 text-sm font-black text-[var(--color-success-strong)]">
            Pedido marcado como entregado. El cliente ya puede verlo en su seguimiento.
          </div>
        ) : null}

        {status.arrived || order.linkStatus === "arrived" ? (
          <div className="rounded-2xl bg-[var(--color-info-soft)] p-4 text-sm font-black text-[var(--color-info-strong)]">
            Repartidor marcado en la ubicacion {order.arrivedAt ? `a las ${formatShortTime(order.arrivedAt)}` : ""}.
          </div>
        ) : null}

        {status.error ? <div className="rounded-2xl bg-[var(--color-danger-soft)] p-4 text-sm font-black text-[var(--color-danger-strong)]">No se pudo actualizar el pedido: {status.error}</div> : null}

        <Card className="space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Cliente</p>
            <h2 className="mt-1 text-2xl font-black">{order.customerName}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{order.customerPhone || "Sin telefono registrado"}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--accent)] px-4 text-sm font-black text-[var(--primary)] shadow-[var(--shadow-glow)]" href={mapUrl} rel="noreferrer" target="_blank">
              <MapPinned className="h-4 w-4" />
              Abrir Maps
            </a>
            {phoneDigits ? (
              <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--color-neutral-100)] px-4 text-sm font-black text-[var(--color-body)]" href={`tel:${phoneDigits}`}>
                <Phone className="h-4 w-4" />
                Llamar
              </a>
            ) : (
              <span className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--color-neutral-100)] px-4 text-sm font-black text-[var(--color-placeholder)]">Sin llamada</span>
            )}
            {waUrl ? (
              <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--color-success-soft)] px-4 text-sm font-black text-[var(--color-success-strong)]" href={waUrl} rel="noreferrer" target="_blank">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            ) : (
              <span className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-[var(--color-neutral-100)] px-4 text-sm font-black text-[var(--color-placeholder)]">Sin WhatsApp</span>
            )}
          </div>
        </Card>

        <Card>
          <div className="flex items-start gap-3">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
              <MapPinned className="h-5 w-5" />
            </span>
            <div>
              <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Direccion</p>
              <h2 className="mt-1 text-xl font-black">{order.customerAddress || "Sin direccion registrada"}</h2>
              {order.deliveryAddressDetail ? <p className="mt-2 text-sm font-semibold text-[var(--muted)]">{order.deliveryAddressDetail}</p> : null}
              {order.requestedFulfillmentAt ? (
                <p className="mt-2 text-sm font-bold text-[var(--primary)]">Hora solicitada: {formatShortTime(order.requestedFulfillmentAt)}</p>
              ) : null}
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-xl font-black">Contenido del pedido</h2>
          <div className="mt-4 grid gap-2">
            {order.items.map((item) => (
              <div className="flex justify-between gap-3 rounded-2xl bg-[var(--color-surface)] p-3" key={item.id}>
                <div>
                  <p className="font-black">
                    {item.quantity}x {item.productName}
                  </p>
                  <p className="mt-1 text-xs font-bold text-[var(--muted)]">{formatMoney(item.unitPrice)} c/u</p>
                  {item.notes ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{item.notes}</p> : null}
                </div>
                <span className="shrink-0 text-sm font-black">{formatMoney(item.subtotal)}</span>
              </div>
            ))}
          </div>
          {order.notes ? <p className="mt-3 rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">{order.notes}</p> : null}
          <div className="mt-4 space-y-2 border-t border-[var(--border)] pt-4 text-sm font-bold">
            <div className="flex justify-between">
              <span>Productos</span>
              <span>{formatMoney(order.items.reduce((sum, item) => sum + item.subtotal, 0))}</span>
            </div>
            <div className="flex justify-between text-xl font-black">
              <span>Total a entregar</span>
              <span>{formatMoney(order.total)}</span>
            </div>
          </div>
        </Card>

        <Card className="sticky bottom-3 z-10 bg-[var(--color-card-elevated)] shadow-xl backdrop-blur">
          {canMarkDelivered ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {canMarkArrived ? (
                <form action={markDeliveryArrivedAction}>
                  <input name="token" type="hidden" value={token} />
                  <PendingSubmitButton className="min-h-14 w-full text-base" pendingLabel="Marcando llegada..." variant="secondary">
                    <MapPinned className="h-5 w-5" />
                    Llegue
                  </PendingSubmitButton>
                </form>
              ) : null}
              <form action={markDeliveryDeliveredAction} className={canMarkArrived ? "" : "sm:col-span-2"}>
                <input name="token" type="hidden" value={token} />
                <PendingSubmitButton className="min-h-14 w-full text-base" pendingLabel="Confirmando entrega...">
                  <CheckCircle2 className="h-5 w-5" />
                  Entregue
                </PendingSubmitButton>
              </form>
            </div>
          ) : (
            <div className="rounded-2xl bg-[var(--color-success-soft)] p-4 text-center text-sm font-black text-[var(--color-success-strong)]">
              Pedido entregado {order.deliveredAt ? `a las ${formatShortTime(order.deliveredAt)}` : ""}
            </div>
          )}
        </Card>
      </div>
    </main>
  );
}

function InfoPill({ label, value, icon }: { label: string; value: string; icon: ReactNode }) {
  return (
    <div className="rounded-2xl bg-[var(--surface)]/10 p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--color-on-primary-muted)]">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm font-black text-[var(--color-on-primary)]">{value}</p>
    </div>
  );
}
