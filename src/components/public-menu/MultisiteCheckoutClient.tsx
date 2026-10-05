"use client";

import Link from "next/link";
import { AlertTriangle, Bike, ChevronLeft, MapPin, Route, ShoppingBag, Store, WalletCards } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useFormStatus } from "react-dom";
import { createPublicMultisiteOrderAction } from "@/app/pedido/multi/actions";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { Button } from "@/components/ui/Button";
import { planMultisiteGroupOrder } from "@/lib/group-orders/multisite-planner";
import { clearCart, listActiveCarts, type StoredRestaurantCart } from "@/lib/utils/cart";
import { formatDistance } from "@/lib/utils/geo-distance";
import { formatMoney } from "@/lib/utils/money";

type RestaurantLocation = {
  id: string;
  slug: string;
  name: string;
  latitude?: number;
  longitude?: number;
};

type ActiveCart = StoredRestaurantCart & { restaurantId: string };

const errorLabels: Record<string, string> = {
  create: "No se pudo crear el pedido. Revisa los productos e inténtalo nuevamente.",
  "invalid-cart": "Uno de los carritos ya no es válido. Vuelve al menú y revísalo.",
  invalid: "Completa los datos de entrega para continuar.",
  minimum: "Uno de los locales no alcanza su pedido mínimo.",
  "no-open-cash": "Uno de los locales no tiene caja operativa en este momento.",
  "product-not-found": "Un producto cambió o ya no está disponible.",
  "product-configuration": "Revisa las variantes o adicionales de un producto.",
  "restaurant-unavailable": "Uno de los locales ya no recibe pedidos a domicilio.",
  "restaurant-location": "Falta la ubicación de uno de los locales. Prueba con otro carrito.",
  "outside-hours": "Uno de los locales está cerrado en este momento.",
  "route-unavailable": "Estos locales no pueden unirse en una sola ruta segura. Deben estar a menos de 3 km del destino y la ruta debe ser corta.",
  "rider-fee": "La oferta para la moto está fuera del rango sugerido. Revísala e intenta de nuevo.",
  "rate-limit": "Hiciste varios intentos. Espera unos minutos antes de volver a enviar.",
  "service-role-required": "El checkout no está listo en este entorno. Intenta más tarde.",
};

function SubmitButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button className="w-full" disabled={disabled || pending} type="submit">
      <WalletCards className="h-4 w-4" />
      {pending ? "Creando pedido..." : "Confirmar un solo pedido"}
    </Button>
  );
}

export function MultisiteCheckoutClient({ error, restaurants }: { error?: string; restaurants: RestaurantLocation[] }) {
  const [carts, setCarts] = useState<ActiveCart[]>([]);
  const [deliveryLocation, setDeliveryLocation] = useState<{ latitude: number; longitude: number; mapsUrl: string }>();
  const [riderFee, setRiderFee] = useState("");
  const [requestId] = useState(() => (typeof crypto === "undefined" ? "" : crypto.randomUUID()));
  const restaurantBySlug = useMemo(() => new Map(restaurants.map((restaurant) => [restaurant.slug, restaurant])), [restaurants]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setCarts(
        listActiveCarts()
          .map((cart) => {
            const restaurant = restaurantBySlug.get(cart.restaurantSlug);
            return restaurant ? { ...cart, restaurantId: cart.restaurantId || restaurant.id } : null;
          })
          .filter((cart): cart is ActiveCart => Boolean(cart)),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [restaurantBySlug]);

  const selected = carts.slice(0, 3);
  const tooManyCarts = carts.length > 3;
  const plan = useMemo(() => {
    if (!deliveryLocation || selected.length < 2) return null;
    const candidates = selected.flatMap((cart) => {
      const restaurant = restaurants.find((candidate) => candidate.id === cart.restaurantId);
      if (restaurant?.latitude == null || restaurant.longitude == null) return [];
      return [{
        id: restaurant.id,
        restaurantId: restaurant.id,
        name: restaurant.name,
        location: { latitude: restaurant.latitude, longitude: restaurant.longitude },
        prepTimeMinutes: 16,
      }];
    });
    if (candidates.length !== selected.length) return null;
    return planMultisiteGroupOrder({
      destination: deliveryLocation,
      candidates,
      radiusKm: 3,
      maxPickups: 3,
    });
  }, [deliveryLocation, restaurants, selected]);

  useEffect(() => {
    if (!plan?.feasible) return;
    const timer = window.setTimeout(() => setRiderFee(plan.riderPricing.suggestedRiderFee.toFixed(2)), 0);
    return () => window.clearTimeout(timer);
  }, [plan?.feasible, plan?.riderPricing.suggestedRiderFee]);

  const subtotal = selected.reduce((sum, cart) => sum + cart.items.reduce((itemSum, item) => itemSum + item.price * item.quantity, 0), 0);
  const selectedFee = Number(riderFee);
  const total = subtotal + (Number.isFinite(selectedFee) ? selectedFee : 0);
  const formCarts = selected.map((cart) => ({
    restaurantId: cart.restaurantId,
    restaurantSlug: cart.restaurantSlug,
    items: cart.items.map((item) => ({ productId: item.productId, variantId: item.variantId, optionIds: item.optionIds ?? [], quantity: item.quantity, notes: item.notes })),
  }));
  const canSubmit = !tooManyCarts && selected.length >= 2 && selected.length <= 3 && Boolean(deliveryLocation) && Boolean(plan?.feasible) && Number.isFinite(selectedFee) && selectedFee >= (plan?.riderPricing.customerMinimumFee ?? Infinity) && selectedFee <= (plan?.riderPricing.customerMaximumFee ?? -Infinity);

  function removeCart(slug: string) {
    clearCart(slug);
    setCarts((current) => current.filter((cart) => cart.restaurantSlug !== slug));
  }

  return (
    <main className="public-brand-theme min-h-screen bg-[var(--color-background)] px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-4xl">
        <Link className="inline-flex items-center gap-2 text-sm font-black text-[var(--primary)]" href="/">
          <ChevronLeft className="h-4 w-4" /> Volver a yopido.shop
        </Link>
        <header className="mt-5 rounded-[2rem] bg-[var(--primary)] p-6 text-white shadow-[0_24px_70px_rgb(18_53_91_/_0.2)] sm:p-8">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15"><Route className="h-6 w-6" /></span>
            <div>
              <p className="text-sm font-bold text-white/75">Pedido multi-comercio</p>
              <h1 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">Un solo checkout, una sola moto</h1>
              <p className="mt-2 max-w-2xl text-sm font-semibold leading-6 text-white/80">Agrupamos hasta tres locales cercanos, calculamos el orden de recojo y el cliente paga una sola entrega en efectivo al recibir.</p>
            </div>
          </div>
        </header>

        {error ? <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-bold text-red-800">{errorLabels[error] ?? "Revisa el pedido e inténtalo de nuevo."}</p> : null}

        {!carts.length ? (
          <section className="mt-6 rounded-[2rem] border border-dashed border-[var(--border)] bg-white p-8 text-center">
            <ShoppingBag className="mx-auto h-10 w-10 text-[var(--primary)]" />
            <h2 className="mt-4 text-xl font-black text-[var(--color-heading)]">Todavía no tienes carritos para unir</h2>
            <p className="mt-2 text-sm font-semibold text-[var(--color-secondary-text)]">Agrega productos desde al menos dos menús de yopido.shop y vuelve aquí.</p>
            <Link className="mt-5 inline-flex rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black text-white" href="/">Explorar locales</Link>
          </section>
        ) : (
          <form action={createPublicMultisiteOrderAction} className="mt-6 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
            <input name="requestId" type="hidden" value={requestId} />
            <input name="cartsJson" type="hidden" value={JSON.stringify(formCarts)} />
            <input name="deliveryLatitude" type="hidden" value={deliveryLocation?.latitude ?? ""} />
            <input name="deliveryLongitude" type="hidden" value={deliveryLocation?.longitude ?? ""} />
            <input name="deliveryMapsUrl" type="hidden" value={deliveryLocation?.mapsUrl ?? ""} />

            <div className="space-y-5">
              <section className="rounded-[1.75rem] border border-[var(--border)] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3"><Store className="h-5 w-5 text-[var(--primary)]" /><div><h2 className="font-black text-[var(--color-heading)]">Locales y productos</h2><p className="text-xs font-semibold text-[var(--color-secondary-text)]">Máximo 3 locales en una ruta.</p></div></div>
                <div className="mt-4 space-y-3">
                  {carts.map((cart, index) => {
                    const hidden = index >= 3;
                    return (
                      <article className={`rounded-2xl border p-4 ${hidden ? "border-dashed border-[var(--border)] opacity-60" : "border-[var(--border)] bg-[var(--color-surface)]"}`} key={cart.restaurantSlug}>
                        <div className="flex items-start justify-between gap-3">
                          <div><p className="font-black text-[var(--color-heading)]">{cart.restaurantName}</p><p className="mt-1 text-xs font-semibold text-[var(--color-secondary-text)]">{cart.items.reduce((sum, item) => sum + item.quantity, 0)} productos · {formatMoney(cart.items.reduce((sum, item) => sum + item.price * item.quantity, 0))}</p></div>
                          <button className="text-xs font-black text-[var(--color-danger-strong)]" onClick={() => removeCart(cart.restaurantSlug)} type="button">Quitar</button>
                        </div>
                        {hidden ? <p className="mt-3 text-xs font-bold text-[var(--color-danger-strong)]">Quita un carrito para continuar: se permiten exactamente hasta tres locales.</p> : null}
                      </article>
                    );
                  })}
                </div>
                {carts.length === 1 ? <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold text-amber-800">Para este flujo necesitas productos de dos o más locales.</p> : null}
              </section>

              <section className="rounded-[1.75rem] border border-[var(--border)] bg-white p-5 shadow-sm">
                <div className="flex items-center gap-3"><MapPin className="h-5 w-5 text-[var(--primary)]" /><div><h2 className="font-black text-[var(--color-heading)]">Destino y datos</h2><p className="text-xs font-semibold text-[var(--color-secondary-text)]">La ruta se valida con el punto exacto de entrega.</p></div></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm font-bold text-[var(--color-heading)]">Nombre<input className="min-h-11 rounded-xl border border-[var(--border)] px-3" name="customerName" required /></label>
                  <label className="grid gap-1.5 text-sm font-bold text-[var(--color-heading)]">Celular<input className="min-h-11 rounded-xl border border-[var(--border)] px-3" inputMode="tel" name="customerPhone" required /></label>
                </div>
                <label className="mt-3 grid gap-1.5 text-sm font-bold text-[var(--color-heading)]">Dirección<input className="min-h-11 rounded-xl border border-[var(--border)] px-3" name="customerAddress" placeholder="Calle, zona y número" required /></label>
                <label className="mt-3 grid gap-1.5 text-sm font-bold text-[var(--color-heading)]">Referencia <span className="font-semibold text-[var(--color-secondary-text)]">(opcional)</span><input className="min-h-11 rounded-xl border border-[var(--border)] px-3" name="deliveryAddressDetail" placeholder="Edificio, timbre o indicación" /></label>
                <label className="mt-3 grid gap-1.5 text-sm font-bold text-[var(--color-heading)]">Correo <span className="font-semibold text-[var(--color-secondary-text)]">(opcional)</span><input className="min-h-11 rounded-xl border border-[var(--border)] px-3" inputMode="email" name="customerEmail" /></label>
                <div className="mt-4"><GoogleLocationFields hideCoordinateInputs hideMapsUrlInput label="Marca el punto exacto de entrega" mapHeightClassName="h-64" onCoordinatesChange={setDeliveryLocation} showMapByDefault /></div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-[1.75rem] border border-[var(--border)] bg-white p-5 shadow-sm lg:sticky lg:top-5">
                <div className="flex items-center gap-3"><Bike className="h-5 w-5 text-[var(--primary)]" /><div><h2 className="font-black text-[var(--color-heading)]">Ruta y cobro</h2><p className="text-xs font-semibold text-[var(--color-secondary-text)]">El precio de productos se confirma al enviar.</p></div></div>
                {!deliveryLocation ? <p className="mt-4 rounded-2xl bg-[var(--accent-soft)] p-4 text-sm font-bold text-[var(--primary)]">Marca el destino para calcular una ruta segura y la oferta para la moto.</p> : null}
                {plan && !plan.feasible ? <p className="mt-4 rounded-2xl bg-red-50 p-4 text-sm font-bold text-red-800"><AlertTriangle className="mr-2 inline h-4 w-4" />La ruta no es viable para un solo recojo. Algunos locales están muy lejos o la comida esperaría demasiado.</p> : null}
                {plan?.feasible ? <>
                  <ol className="mt-4 space-y-2">{plan.stops.map((stop, index) => <li className="flex gap-3 rounded-xl bg-[var(--color-surface)] p-3 text-sm" key={stop.id}><span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-xs font-black text-white">{index + 1}</span><span><b className="block text-[var(--color-heading)]">{stop.name}</b><span className="text-xs font-semibold text-[var(--color-secondary-text)]">Listo aprox. en {stop.estimatedReadyInMinutes} min · {formatDistance(stop.distanceToDestinationKm)} al destino</span></span></li>)}</ol>
                  <div className="mt-4 rounded-2xl border border-[var(--border)] p-4"><label className="grid gap-1.5 text-sm font-black text-[var(--color-heading)]">Oferta para la moto (Bs)<input className="min-h-11 rounded-xl border border-[var(--border)] px-3" max={plan.riderPricing.customerMaximumFee} min={plan.riderPricing.customerMinimumFee} name="riderFee" onChange={(event) => setRiderFee(event.target.value)} step="0.5" type="number" value={riderFee} /></label><p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">Sugerido: {formatMoney(plan.riderPricing.suggestedRiderFee)} · permitido de {formatMoney(plan.riderPricing.customerMinimumFee)} a {formatMoney(plan.riderPricing.customerMaximumFee)}.</p></div>
                </> : null}
                <div className="mt-5 space-y-2 border-t border-[var(--border)] pt-4 text-sm font-semibold text-[var(--color-secondary-text)]"><div className="flex justify-between"><span>Productos</span><span>{formatMoney(subtotal)}</span></div><div className="flex justify-between"><span>Entrega única</span><span>{Number.isFinite(selectedFee) ? formatMoney(selectedFee) : "—"}</span></div><div className="flex justify-between pt-2 text-base font-black text-[var(--color-heading)]"><span>Total</span><span>{formatMoney(total)}</span></div></div>
                <p className="mt-4 rounded-xl bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-900">Pago habilitado: efectivo al recibir. El QR único requiere una cuenta de cobro de plataforma y se activará cuando esté configurada.</p>
                <SubmitButton disabled={!canSubmit} />
              </section>
            </aside>
          </form>
        )}
      </div>
    </main>
  );
}
