"use client";

import { AlertTriangle, Bike, CheckCircle2, ChevronLeft, ChevronRight, CircleDollarSign, MapPinned, Plus, Trash2 } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select } from "@/components/ui/Input";
import { forecastMultisiteKitchenReadyIn } from "@/lib/group-orders/kitchen-forecast";
import { planMultisiteGroupOrder, type MultisitePickupCandidate } from "@/lib/group-orders/multisite-planner";
import type { MultisiteSimulatorRestaurant } from "@/lib/services/multisite-simulator.service";

type EditablePlace = { latitude: number; longitude: number };
type EditableCandidate = MultisitePickupCandidate;

const initialDestination: EditablePlace = { latitude: -17.7842, longitude: -63.1812 };
const initialRider: EditablePlace = { latitude: -17.7818, longitude: -63.1884 };
const initialCandidates: EditableCandidate[] = [
  { id: "carnes", name: "Carnes del Norte", location: { latitude: -17.7787, longitude: -63.1951 }, prepTimeMinutes: 35, coldRisk: "medium" },
  { id: "pizza", name: "Pizza Central", location: { latitude: -17.786, longitude: -63.1893 }, prepTimeMinutes: 22, coldRisk: "low" },
  { id: "hamburguesa", name: "Burger Express", location: { latitude: -17.7897, longitude: -63.1776 }, prepTimeMinutes: 18, coldRisk: "high" },
];

const initialSettings = {
  radiusKm: 3,
  maxPickups: 3,
  baseFee: 6,
  feePerKm: 2.2,
  extraPickupFee: 3,
  maxCustomerDiscount: 3,
  maxCustomerIncrease: 5,
  maxRouteKm: 8,
  maxFirstPickupToDeliveryMinutes: 25,
  averageSpeedKmh: 22,
};

const wizardSteps = [
  { number: 1, label: "Mapa" },
  { number: 2, label: "Comercios" },
  { number: 3, label: "Oferta" },
  { number: 4, label: "Ruta final" },
];

function money(value: number) {
  return new Intl.NumberFormat("es-BO", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value);
}

function minutes(value: number) {
  return value === 1 ? "1 min" : `${value} min`;
}

function NumberField({ label, value, onChange, min, step = 0.1 }: { label: string; value: number; onChange: (value: number) => void; min?: number; step?: number }) {
  return <label className="grid gap-1.5 text-xs font-bold text-[var(--color-secondary-text)]">{label}<Input min={min} onChange={(event) => onChange(Number(event.target.value) || 0)} step={step} type="number" value={value} /></label>;
}

function applyKitchenSnapshot(candidate: EditableCandidate, kitchenSnapshot: MultisiteSimulatorRestaurant["kitchenSnapshot"]) {
  const forecast = forecastMultisiteKitchenReadyIn(kitchenSnapshot, candidate.prepTimeMinutes);
  const demandLabel = forecast.demandLevel === "busy" ? "Alta demanda" : forecast.demandLevel === "calm" ? "Horario tranquilo" : "Demanda normal";
  return {
    ...candidate,
    kitchenSnapshot,
    queueConfidence: forecast.confidence,
    queueDelayMinutes: forecast.queueDelayMinutes,
    queueLabel: `${demandLabel} · cola estimada ${forecast.queueDelayMinutes} min`,
  };
}

export function MultisiteSimulatorClient({ operationalRestaurants = [] }: { operationalRestaurants?: MultisiteSimulatorRestaurant[] }) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [destination, setDestination] = useState(initialDestination);
  const [rider, setRider] = useState(initialRider);
  const [useRiderPosition, setUseRiderPosition] = useState(true);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [activeCandidateId, setActiveCandidateId] = useState(initialCandidates[0].id);
  const [settings, setSettings] = useState(initialSettings);

  const effectiveCandidates = useMemo(() => {
    const restaurantById = new Map(operationalRestaurants.map((restaurant) => [restaurant.id, restaurant]));
    return candidates.map((candidate) => {
      const restaurant = candidate.restaurantId ? restaurantById.get(candidate.restaurantId) : null;
      return restaurant ? applyKitchenSnapshot(candidate, restaurant.kitchenSnapshot) : candidate;
    });
  }, [candidates, operationalRestaurants]);
  const plan = useMemo(() => planMultisiteGroupOrder({ destination, candidates: effectiveCandidates, riderStart: useRiderPosition ? rider : undefined, ...settings }), [destination, effectiveCandidates, rider, settings, useRiderPosition]);
  const activeCandidate = effectiveCandidates.find((candidate) => candidate.id === activeCandidateId) ?? effectiveCandidates[0];

  const updateDestination = useCallback(({ latitude, longitude }: { latitude: number; longitude: number }) => setDestination({ latitude, longitude }), []);
  const updateRider = useCallback(({ latitude, longitude }: { latitude: number; longitude: number }) => setRider({ latitude, longitude }), []);
  const updateCandidate = (id: string, update: Partial<EditableCandidate>) => setCandidates((current) => current.map((candidate) => candidate.id === id ? { ...candidate, ...update } : candidate));
  const updateCandidatePrepTime = (id: string, prepTimeMinutes: number) => setCandidates((current) => current.map((candidate) => {
    if (candidate.id !== id) return candidate;
    const next = { ...candidate, prepTimeMinutes };
    const restaurant = next.restaurantId ? operationalRestaurants.find((item) => item.id === next.restaurantId) : null;
    return restaurant ? applyKitchenSnapshot(next, restaurant.kitchenSnapshot) : next;
  }));
  const selectOperationalRestaurant = (id: string, restaurantId: string) => setCandidates((current) => current.map((candidate) => {
    if (candidate.id !== id) return candidate;
    const restaurant = operationalRestaurants.find((item) => item.id === restaurantId);
    if (!restaurant) {
      return { ...candidate, kitchenSnapshot: undefined, queueConfidence: undefined, queueDelayMinutes: 0, queueLabel: undefined, restaurantId: undefined };
    }
    return applyKitchenSnapshot({ ...candidate, restaurantId: restaurant.id, name: restaurant.name, location: restaurant.location }, restaurant.kitchenSnapshot);
  }));
  const updateActiveLocation = useCallback(({ latitude, longitude }: { latitude: number; longitude: number }) => {
    setCandidates((current) => current.map((candidate) => candidate.id === activeCandidateId ? { ...candidate, location: { latitude, longitude } } : candidate));
  }, [activeCandidateId]);

  const addCandidate = () => {
    const id = `local-${Date.now()}`;
    const next = {
      id,
      name: `Local ${candidates.length + 1}`,
      location: { latitude: destination.latitude + 0.003, longitude: destination.longitude + 0.003 },
      prepTimeMinutes: 20,
      coldRisk: "medium" as const,
    };
    setCandidates((current) => [...current, next]);
    setActiveCandidateId(id);
  };

  const removeCandidate = (id: string) => {
    if (candidates.length === 1) return;
    const next = candidates.filter((candidate) => candidate.id !== id);
    setCandidates(next);
    if (activeCandidateId === id) setActiveCandidateId(next[0].id);
  };

  const reset = () => {
    setDestination(initialDestination);
    setRider(initialRider);
    setUseRiderPosition(true);
    setCandidates(initialCandidates);
    setActiveCandidateId(initialCandidates[0].id);
    setSettings(initialSettings);
    setStep(1);
  };

  const googleMapsRouteUrl = useMemo(() => {
    if (!plan.stops.length) return null;
    const origin = useRiderPosition ? rider : plan.stops[0].location;
    const waypointStops = useRiderPosition ? plan.stops : plan.stops.slice(1);
    const query = new URLSearchParams({
      api: "1",
      destination: `${destination.latitude},${destination.longitude}`,
      origin: `${origin.latitude},${origin.longitude}`,
      travelmode: "driving",
    });
    if (waypointStops.length) query.set("waypoints", waypointStops.map((stop) => `${stop.location.latitude},${stop.location.longitude}`).join("|"));
    return `https://www.google.com/maps/dir/?${query.toString()}`;
  }, [destination, plan.stops, rider, useRiderPosition]);

  const nextLabel = step === 1 ? "Continuar con comercios" : step === 2 ? "Definir oferta" : step === 3 ? "Ver ruta propuesta" : "Nuevo escenario";

  return (
    <div className="mx-auto max-w-5xl pb-8">
      <Card className="border-[var(--primary-light)] bg-[linear-gradient(135deg,var(--surface),var(--primary-light))]">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
          <div>
            <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-[var(--surface)] px-3 py-1 text-xs font-black text-[var(--primary-dark)] shadow-sm"><Bike className="h-3.5 w-3.5" /> Simulacion interna</div>
            <h1 className="text-2xl font-black tracking-tight text-[var(--color-heading)] sm:text-3xl">Crear caso multi-comercio</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--color-secondary-text)]">Recorre el mismo flujo que usaremos al crear un pedido real, sin emitir cobros, pedidos ni ofertas a motos.</p>
          </div>
          <button className={buttonClasses("secondary", "shrink-0")} onClick={reset} type="button">Restablecer</button>
        </div>

        <ol aria-label="Pasos del simulador" className="mt-6 grid grid-cols-4 gap-2">
          {wizardSteps.map((item) => (
            <li className="min-w-0" key={item.number}>
              <button className={`flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-xs font-black transition sm:px-3 ${step === item.number ? "bg-[var(--primary)] text-white shadow-[var(--shadow-primary)]" : step > item.number ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--surface)] text-[var(--color-secondary-text)]"}`} onClick={() => setStep(item.number)} type="button">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-black/10 text-[11px]">{step > item.number ? "✓" : item.number}</span>
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          ))}
        </ol>
      </Card>

      <div className="mt-5">
        {step === 1 ? (
          <Card>
            <StepHeading description="Elige en Google Maps la posición actual de la moto y el punto de entrega del cliente. Puedes tocar el mapa, arrastrar el pin o usar GPS." kicker="Paso 1 de 4" title="¿Desde dónde y hasta dónde?" />
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="rounded-[var(--radius-card)] border border-[var(--border)] p-4">
                <div className="flex items-center justify-between gap-3"><div><h3 className="font-black">Origen: moto</h3><p className="mt-1 text-xs leading-5 text-[var(--color-secondary-text)]">Sirve para calcular cuándo despacharla, no para subir la tarifa.</p></div><button className={buttonClasses(useRiderPosition ? "primary" : "secondary", "min-h-8 px-3 text-xs")} onClick={() => setUseRiderPosition((current) => !current)} type="button">{useRiderPosition ? "Usar origen" : "Sin origen"}</button></div>
                {useRiderPosition ? <div className="mt-4"><GoogleLocationFields defaultLatitude={rider.latitude} defaultLongitude={rider.longitude} hideMapsUrlInput label="Ubicacion de la moto" mapHeightClassName="h-64" onCoordinatesChange={updateRider} showMapByDefault /></div> : <p className="mt-4 rounded-xl bg-[var(--color-neutral-100)] p-3 text-xs leading-5 text-[var(--color-secondary-text)]">Si la moto aún no tiene ubicación, el simulador empieza el recorrido en el primer comercio.</p>}
              </section>
              <section className="rounded-[var(--radius-card)] border border-[var(--border)] p-4">
                <h3 className="font-black">Destino: cliente</h3><p className="mt-1 text-xs leading-5 text-[var(--color-secondary-text)]">Este punto define el radio de comercios, la oferta base y el último tramo de entrega.</p>
                <div className="mt-4"><GoogleLocationFields defaultLatitude={destination.latitude} defaultLongitude={destination.longitude} hideMapsUrlInput label="Punto de entrega" mapHeightClassName="h-64" onCoordinatesChange={updateDestination} showMapByDefault /></div>
              </section>
            </div>
          </Card>
        ) : null}

        {step === 2 && activeCandidate ? (
          <Card>
            <StepHeading description="Selecciona comercios reales para tomar su cola virtual actual o crea uno manual. El algoritmo suma la preparación de la canasta a la espera de cocina." kicker="Paso 2 de 4" title="¿Qué comercios se recogen?" />
            <div className="mt-5 grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)]">
              <aside className="grid content-start gap-2">
                {effectiveCandidates.map((candidate, index) => <button className={`rounded-xl border p-3 text-left transition ${candidate.id === activeCandidate.id ? "border-[var(--primary)] bg-[var(--primary-light)]" : "border-[var(--border)] hover:bg-[var(--color-neutral-100)]"}`} key={candidate.id} onClick={() => setActiveCandidateId(candidate.id)} type="button"><span className="block text-[11px] font-bold text-[var(--color-secondary-text)]">Recojo {index + 1}</span><span className="mt-0.5 block truncate text-sm font-black">{candidate.name}</span><span className="mt-1 block text-xs text-[var(--color-secondary-text)]">{minutes(candidate.prepTimeMinutes + (candidate.queueDelayMinutes ?? 0))}</span></button>)}
                <Button className="min-h-10 text-xs" disabled={candidates.length >= 5} onClick={addCandidate} type="button"><Plus className="h-4 w-4" /> Agregar local</Button>
              </aside>
              <section className="rounded-[var(--radius-card)] border border-[var(--border)] p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold text-[var(--primary-dark)]">Editando comercio</p><h3 className="mt-1 font-black">{activeCandidate.name}</h3></div><div className="flex gap-1"><button className={buttonClasses("ghost", "min-h-9 px-2 text-xs")} onClick={() => router.refresh()} title="Actualizar las colas de cocina" type="button">Actualizar colas</button><button aria-label={`Eliminar ${activeCandidate.name}`} className={buttonClasses("ghost", "min-h-9 px-2 text-[var(--color-danger-strong)]")} disabled={candidates.length === 1} onClick={() => removeCandidate(activeCandidate.id)} type="button"><Trash2 className="h-4 w-4" /></button></div></div>
                <div className="mt-4 grid gap-3 sm:grid-cols-3"><label className="grid gap-1.5 text-xs font-bold text-[var(--color-secondary-text)] sm:col-span-2">Comercio de la plataforma<Select onChange={(event) => selectOperationalRestaurant(activeCandidate.id, event.target.value)} value={activeCandidate.restaurantId ?? ""}><option value="">Local manual</option>{operationalRestaurants.map((restaurant) => <option key={restaurant.id} value={restaurant.id}>{restaurant.name}{restaurant.city ? ` · ${restaurant.city}` : ""}</option>)}</Select></label><NumberField label="Preparación de canasta (min)" min={1} onChange={(prepTimeMinutes) => updateCandidatePrepTime(activeCandidate.id, prepTimeMinutes)} step={1} value={activeCandidate.prepTimeMinutes} /></div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-xs font-bold text-[var(--color-secondary-text)]">Nombre visible<Input onChange={(event) => updateCandidate(activeCandidate.id, { name: event.target.value })} value={activeCandidate.name} /></label><label className="grid gap-1.5 text-xs font-bold text-[var(--color-secondary-text)]">Riesgo de enfriar<Select onChange={(event) => updateCandidate(activeCandidate.id, { coldRisk: event.target.value as EditableCandidate["coldRisk"] })} value={activeCandidate.coldRisk ?? "medium"}><option value="low">Bajo</option><option value="medium">Medio</option><option value="high">Alto</option></Select></label></div>
                {activeCandidate.queueLabel ? <p className="mt-3 rounded-xl bg-[var(--color-neutral-100)] px-3 py-2 text-xs font-bold leading-5 text-[var(--color-secondary-text)]">{activeCandidate.queueLabel} · tiempo que usará la ruta: <span className="text-[var(--color-heading)]">{minutes(activeCandidate.prepTimeMinutes + (activeCandidate.queueDelayMinutes ?? 0))}</span>{activeCandidate.queueConfidence ? ` · confianza ${activeCandidate.queueConfidence}` : ""}</p> : <p className="mt-3 rounded-xl bg-[var(--color-neutral-100)] px-3 py-2 text-xs leading-5 text-[var(--color-secondary-text)]">Local manual: el tiempo de preparación ingresado se usa sin cola en vivo.</p>}
                <div className="mt-4 border-t border-[var(--border)] pt-4"><GoogleLocationFields defaultLatitude={activeCandidate.location.latitude} defaultLongitude={activeCandidate.location.longitude} hideMapsUrlInput key={`${activeCandidate.id}-${activeCandidate.restaurantId ?? "manual"}`} label={`Ubicacion de ${activeCandidate.name}`} mapHeightClassName="h-72" onCoordinatesChange={updateActiveLocation} showMapByDefault /></div>
              </section>
            </div>
          </Card>
        ) : null}

        {step === 3 ? (
          <Card>
            <StepHeading description="La tarifa se calcula desde el comercio más lejano al cliente, más un monto por cada recojo adicional. La moto siempre debe aceptar antes de asignarse." kicker="Paso 3 de 4" title="Oferta y límites de reparto" />
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <section className="rounded-[var(--radius-card)] border border-[var(--border)] p-4"><h3 className="font-black">Límites operativos</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><NumberField label="Radio por local (km)" min={0.1} onChange={(radiusKm) => setSettings((current) => ({ ...current, radiusKm }))} value={settings.radiusKm} /><NumberField label="Máx. locales" min={1} onChange={(maxPickups) => setSettings((current) => ({ ...current, maxPickups: Math.round(maxPickups) }))} step={1} value={settings.maxPickups} /><NumberField label="Velocidad promedio (km/h)" min={5} onChange={(averageSpeedKmh) => setSettings((current) => ({ ...current, averageSpeedKmh }))} value={settings.averageSpeedKmh} /><NumberField label="Ruta máxima (km)" min={0.1} onChange={(maxRouteKm) => setSettings((current) => ({ ...current, maxRouteKm }))} value={settings.maxRouteKm} /><NumberField label="Máx. 1er recojo a entrega (min)" min={1} onChange={(maxFirstPickupToDeliveryMinutes) => setSettings((current) => ({ ...current, maxFirstPickupToDeliveryMinutes }))} step={1} value={settings.maxFirstPickupToDeliveryMinutes} /></div></section>
              <section className="rounded-[var(--radius-card)] border border-[var(--border)] p-4"><h3 className="font-black">Regla de negociación</h3><div className="mt-4 grid gap-3 sm:grid-cols-2"><NumberField label="Tarifa base (Bs)" min={0} onChange={(baseFee) => setSettings((current) => ({ ...current, baseFee }))} value={settings.baseFee} /><NumberField label="Bs por km" min={0} onChange={(feePerKm) => setSettings((current) => ({ ...current, feePerKm }))} value={settings.feePerKm} /><NumberField label="Bs por recojo extra" min={0} onChange={(extraPickupFee) => setSettings((current) => ({ ...current, extraPickupFee }))} value={settings.extraPickupFee} /><NumberField label="Cliente puede bajar (Bs)" min={0} onChange={(maxCustomerDiscount) => setSettings((current) => ({ ...current, maxCustomerDiscount }))} value={settings.maxCustomerDiscount} /><NumberField label="Cliente puede subir (Bs)" min={0} onChange={(maxCustomerIncrease) => setSettings((current) => ({ ...current, maxCustomerIncrease }))} value={settings.maxCustomerIncrease} /></div></section>
            </div>
            <div className="mt-5 rounded-[var(--radius-card)] bg-[var(--color-neutral-100)] p-4 text-sm text-[var(--color-secondary-text)]">Previsualización: <strong className="text-[var(--color-heading)]">Bs {money(plan.riderPricing.suggestedRiderFee)}</strong> sugeridos para la moto · cliente puede ofertar entre <strong className="text-[var(--color-heading)]">Bs {money(plan.riderPricing.customerMinimumFee)}</strong> y <strong className="text-[var(--color-heading)]">Bs {money(plan.riderPricing.customerMaximumFee)}</strong>.</div>
          </Card>
        ) : null}

        {step === 4 ? (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <Card>
              <div className="flex items-start gap-3">{plan.feasible ? <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--color-success-strong)]" /> : <AlertTriangle className="mt-0.5 h-6 w-6 shrink-0 text-[var(--color-warning-strong)]" />}<div><p className="text-xs font-bold text-[var(--primary-dark)]">Paso 4 de 4</p><h2 className="mt-1 text-xl font-black">{plan.feasible ? "Ruta lista para validar" : "Ruta con alertas"}</h2><p className="mt-1 text-sm leading-6 text-[var(--color-secondary-text)]">{plan.feasible ? "La propuesta cumple los límites del escenario." : "Ajusta los puntos, tiempos o límites antes de convertirlo en un pedido real."}</p></div></div>
              {plan.warnings.length ? <div className="mt-5 grid gap-2">{plan.warnings.map((warning) => <p className="rounded-xl bg-[var(--color-warning-soft)] px-3 py-2 text-xs font-bold leading-5 text-[var(--color-warning-strong)]" key={warning}>{warning}</p>)}</div> : null}
              <div className="mt-6 grid gap-4"><h3 className="font-black">Secuencia recomendada</h3>{useRiderPosition ? <RouteRow detail={`Despachar ${plan.routeStartDelayMinutes ? `en ${minutes(plan.routeStartDelayMinutes)}` : "ahora"}.`} name="Moto" number="0" /> : null}{plan.stops.map((stop, index) => <RouteRow detail={`Preparación ${minutes(stop.prepTimeMinutes)}${stop.queueDelayMinutes ? ` + cola ${minutes(stop.queueDelayMinutes)}` : ""}. ${stop.orderReleaseDelayMinutes ? `Enviar a cocina en ${minutes(stop.orderReleaseDelayMinutes)}.` : "Enviar a cocina ahora."} Recojo estimado: ${minutes(stop.pickupEtaMinutes)}.`} key={stop.id} name={stop.name} number={String(index + 1)} />)}<RouteRow detail="Final de la ruta y entrega al cliente." name="Cliente" number="✓" /></div>
              {googleMapsRouteUrl ? <a className={buttonClasses("secondary", "mt-6 w-full sm:w-auto")} href={googleMapsRouteUrl} rel="noreferrer" target="_blank"><MapPinned className="h-4 w-4" /> Abrir ruta en Google Maps</a> : null}
            </Card>
            <div className="grid content-start gap-5">
              <Card><h2 className="flex items-center gap-2 font-black"><CircleDollarSign className="h-5 w-5 text-[var(--primary)]" /> Oferta moto</h2><div className="mt-4 rounded-[var(--radius-control)] bg-[var(--primary)] p-4 text-white"><p className="text-xs font-bold text-white/75">Sugerida</p><p className="mt-1 text-3xl font-black">Bs {money(plan.riderPricing.suggestedRiderFee)}</p><p className="mt-1 text-xs text-white/80">Pendiente de aceptación de la moto.</p></div><dl className="mt-4 grid gap-3 text-sm"><div><dt className="text-xs font-bold text-[var(--color-secondary-text)]">Base, local más lejano</dt><dd className="mt-0.5 font-black">Bs {money(plan.riderPricing.baseDeliveryFee)}</dd></div><div><dt className="text-xs font-bold text-[var(--color-secondary-text)]">Recojos adicionales</dt><dd className="mt-0.5 font-black">+ Bs {money(plan.riderPricing.additionalPickupFee)}</dd></div><div><dt className="text-xs font-bold text-[var(--color-secondary-text)]">Rango que puede ofrecer cliente</dt><dd className="mt-0.5 font-black">Bs {money(plan.riderPricing.customerMinimumFee)} – {money(plan.riderPricing.customerMaximumFee)}</dd></div></dl></Card>
              <Card className="text-sm"><p className="font-black">Resumen operativo</p><p className="mt-2 text-[var(--color-secondary-text)]">{plan.totalRouteKm.toFixed(1)} km de recorrido total · {minutes(plan.estimatedPickupWindowMinutes)} para la moto · {minutes(plan.firstPickupToDeliveryMinutes)} desde el primer recojo a la entrega.</p></Card>
            </div>
          </div>
        ) : null}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3"><button className={buttonClasses("secondary", "min-h-11 px-4")} disabled={step === 1} onClick={() => setStep((current) => Math.max(1, current - 1))} type="button"><ChevronLeft className="h-4 w-4" /> Anterior</button><p className="hidden text-sm font-bold text-[var(--color-secondary-text)] sm:block">Paso {step} de 4</p><button className={buttonClasses("primary", "min-h-11 px-4")} onClick={() => step === 4 ? reset() : setStep((current) => Math.min(4, current + 1))} type="button">{nextLabel}{step < 4 ? <ChevronRight className="h-4 w-4" /> : null}</button></div>
    </div>
  );
}

function StepHeading({ kicker, title, description }: { kicker: string; title: string; description: string }) {
  return <div><p className="text-xs font-bold text-[var(--primary-dark)]">{kicker}</p><h2 className="mt-1 text-xl font-black text-[var(--color-heading)]">{title}</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-[var(--color-secondary-text)]">{description}</p></div>;
}

function RouteRow({ number, name, detail }: { number: string; name: string; detail: string }) {
  return <div className="flex gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-xs font-black text-white">{number}</span><div className="min-w-0 border-b border-[var(--border)] pb-4 last:border-0"><p className="font-black text-[var(--color-heading)]">{name}</p><p className="mt-1 text-xs leading-5 text-[var(--color-secondary-text)]">{detail}</p></div></div>;
}
