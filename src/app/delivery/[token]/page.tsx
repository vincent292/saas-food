import { notFound } from "next/navigation";
import { Bike, CheckCircle2, Clock3, MapPinned, MessageCircle, Phone, ReceiptText, Route, ShieldCheck } from "lucide-react";
import type { ReactNode } from "react";
import { markDeliveryArrivedAction, markDeliveryDeliveredAction } from "@/app/delivery/actions";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { deliveryService } from "@/lib/services/delivery.service";
import { formatShortTime } from "@/lib/utils/dates";
import { formatMoney } from "@/lib/utils/money";

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function mapsHref(address: string, mapsUrl?: string) {
  if (mapsUrl?.trim()) {
    return mapsUrl;
  }

  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`;
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
  const mapUrl = mapsHref(order.customerAddress, order.deliveryMapsUrl);
  const phoneDigits = digitsOnly(order.customerPhone);
  const waUrl = whatsappHref(order.customerPhone, order.orderNumber);

  return (
    <main className="min-h-screen bg-[var(--background)] px-4 py-5 text-[var(--text)] sm:px-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <section className="rounded-[1.5rem] bg-slate-950 p-5 text-white shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Badge className="bg-white/10 text-white">
                <Bike className="mr-1.5 h-3.5 w-3.5" />
                Repartidor
              </Badge>
              <h1 className="mt-4 text-3xl font-black leading-tight">Pedido {order.orderNumber}</h1>
              <p className="mt-2 text-sm font-semibold text-white/70">{order.restaurantName}</p>
            </div>
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-white text-slate-950">
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
          <div className="rounded-2xl bg-emerald-50 p-4 text-sm font-black text-emerald-800">
            Pedido marcado como entregado. El cliente ya puede verlo en su seguimiento.
          </div>
        ) : null}

        {status.arrived || order.linkStatus === "arrived" ? (
          <div className="rounded-2xl bg-sky-50 p-4 text-sm font-black text-sky-800">
            Repartidor marcado en la ubicacion {order.arrivedAt ? `a las ${formatShortTime(order.arrivedAt)}` : ""}.
          </div>
        ) : null}

        {status.error ? <div className="rounded-2xl bg-red-50 p-4 text-sm font-black text-red-700">No se pudo actualizar el pedido: {status.error}</div> : null}

        <Card className="space-y-4">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--primary)]">Cliente</p>
            <h2 className="mt-1 text-2xl font-black">{order.customerName}</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--muted)]">{order.customerPhone || "Sin telefono registrado"}</p>
          </div>

          <div className="grid gap-2 sm:grid-cols-3">
            <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--primary)] px-4 text-sm font-black text-white" href={mapUrl} rel="noreferrer" target="_blank">
              <MapPinned className="h-4 w-4" />
              Abrir Maps
            </a>
            {phoneDigits ? (
              <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-800" href={`tel:${phoneDigits}`}>
                <Phone className="h-4 w-4" />
                Llamar
              </a>
            ) : (
              <span className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-400">Sin llamada</span>
            )}
            {waUrl ? (
              <a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-emerald-50 px-4 text-sm font-black text-emerald-700" href={waUrl} rel="noreferrer" target="_blank">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            ) : (
              <span className="inline-flex min-h-12 items-center justify-center rounded-2xl bg-slate-100 px-4 text-sm font-black text-slate-400">Sin WhatsApp</span>
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
              <div className="flex justify-between gap-3 rounded-2xl bg-slate-50 p-3" key={item.id}>
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
          {order.notes ? <p className="mt-3 rounded-2xl bg-amber-50 p-3 text-sm font-bold text-amber-800">{order.notes}</p> : null}
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

        <Card className="sticky bottom-3 z-10 bg-white/95 shadow-xl backdrop-blur">
          {canMarkDelivered ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {canMarkArrived ? (
                <form action={markDeliveryArrivedAction}>
                  <input name="token" type="hidden" value={token} />
                  <Button className="min-h-14 w-full text-base" type="submit" variant="secondary">
                    <MapPinned className="h-5 w-5" />
                    Llegue
                  </Button>
                </form>
              ) : null}
              <form action={markDeliveryDeliveredAction} className={canMarkArrived ? "" : "sm:col-span-2"}>
                <input name="token" type="hidden" value={token} />
                <Button className="min-h-14 w-full text-base" type="submit">
                  <CheckCircle2 className="h-5 w-5" />
                  Entregue
                </Button>
              </form>
            </div>
          ) : (
            <div className="rounded-2xl bg-emerald-50 p-4 text-center text-sm font-black text-emerald-800">
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
    <div className="rounded-2xl bg-white/10 p-3">
      <div className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-white/60">
        {icon}
        {label}
      </div>
      <p className="mt-2 text-sm font-black text-white">{value}</p>
    </div>
  );
}
