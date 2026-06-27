"use client";

import { CreditCard, ImageIcon, Settings2, Store, Clock3 } from "lucide-react";
import { useMemo, useState } from "react";
import { updateRestaurantConfigurationAction } from "@/app/admin/actions";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { ModuleToggle } from "@/components/settings/ModuleToggle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/utils/cn";
import type { BusinessHour, ModuleKey, Restaurant, RestaurantSettings, SubscriptionPlan } from "@/types/restaurant.types";

const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const tabs = [
  { key: "general", label: "General", icon: Store },
  { key: "pagos", label: "Pagos", icon: CreditCard },
  { key: "operacion", label: "Operación", icon: Settings2 },
  { key: "horarios", label: "Horarios", icon: Clock3 },
] as const;

type SettingsTab = (typeof tabs)[number]["key"];

function normalizeTab(value?: string): SettingsTab {
  return tabs.some((tab) => tab.key === value) ? (value as SettingsTab) : "general";
}

function isImageUrl(value: string | undefined) {
  return Boolean(value && (value.startsWith("http") || value.startsWith("/")));
}

export function RestaurantSettingsFormClient({
  restaurant,
  settings,
  businessHours,
  plans,
  saved,
  error,
  initialTab,
}: {
  restaurant: Restaurant;
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  plans: SubscriptionPlan[];
  saved?: string;
  error?: string;
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => normalizeTab(initialTab));
  const [selectedPlanKey, setSelectedPlanKey] = useState(() => restaurant.planKey ?? plans[0]?.key ?? "basic");
  const selectedPlan = useMemo(() => plans.find((plan) => plan.key === selectedPlanKey), [plans, selectedPlanKey]);
  const planModules = useMemo(() => new Set<ModuleKey>(selectedPlan?.modules ?? []), [selectedPlan]);
  const canUseModule = (moduleKey: ModuleKey) => planModules.has(moduleKey);
  const hoursByDay = new Map(businessHours.map((hour) => [hour.dayOfWeek, hour]));
  const logoIsImage = isImageUrl(restaurant.logoUrl);
  const bannerIsImage = isImageUrl(restaurant.bannerUrl);
  const qrIsImage = isImageUrl(settings?.qrPaymentUrl);

  return (
    <form action={updateRestaurantConfigurationAction} className="space-y-6">
      <input name="restaurantId" type="hidden" value={restaurant.id} />
      <input name="currentSlug" type="hidden" value={restaurant.slug} />
      <input name="currentQrPaymentUrl" type="hidden" value={settings?.qrPaymentUrl ?? ""} />
      <input name="tab" type="hidden" value={activeTab} />

      {saved ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Configuración guardada en Supabase.</div> : null}
      {error ? <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">No se pudo guardar la configuración: {error}.</div> : null}

      <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-white p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-black transition",
              activeTab === tab.key ? "bg-[var(--primary)] text-white" : "text-[var(--muted)] hover:bg-[var(--primary-light)]",
            )}
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            type="button"
          >
            <tab.icon className="h-4 w-4" />
            {tab.label}
          </button>
        ))}
      </div>

      <div className={cn(activeTab === "general" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle title="Identidad" description="Lo visible en el menú público y en los paneles operativos." />
            <div className="md:col-span-2" />
            <Input defaultValue={restaurant.name} name="name" placeholder="Nombre" required />
            <Input defaultValue={restaurant.slug} name="slug" placeholder="Slug" required />
            <Input defaultValue={restaurant.primaryColor} name="primaryColor" type="color" />
            <Input defaultValue={restaurant.secondaryColor} name="secondaryColor" type="color" />
            <Input defaultValue={restaurant.whatsapp} name="whatsapp" placeholder="WhatsApp" />
            <Input defaultValue={restaurant.city} name="city" placeholder="Ciudad" />
            <Input className="md:col-span-2" defaultValue={restaurant.address} name="address" placeholder="Dirección" />
            <Select defaultValue={restaurant.status} name="status">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="suspended">Suspendido</option>
            </Select>
            <Select name="planKey" onChange={(event) => setSelectedPlanKey(event.target.value as typeof selectedPlanKey)} value={selectedPlanKey}>
              {plans.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name} - Bs {plan.priceMonthly}/mes
                </option>
              ))}
            </Select>
            <div className="rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
              El menú público de <strong>/r/{restaurant.slug}</strong> solo responde cuando el restaurante está en estado <strong>Activo</strong>.
            </div>
            <Textarea className="md:col-span-2" defaultValue={restaurant.description} name="description" placeholder="Descripción" />
            <CompressedImageInput label="Logo" name="logoFile" />
            <CompressedImageInput label="Banner" name="bannerFile" />
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Vista previa" description="Identidad actual guardada en Supabase Storage." />
            <PreviewMedia label="Logo" title={restaurant.name} url={logoIsImage ? restaurant.logoUrl : ""} fallback={restaurant.name.slice(0, 2).toUpperCase()} square />
            <PreviewMedia label="Banner" title={`${restaurant.name} banner`} url={bannerIsImage ? restaurant.bannerUrl : ""} fallback="Sin banner" />
            <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              <p>Menu: /r/{restaurant.slug}</p>
              <p className="mt-2">Cocina: /cocina/{restaurant.slug}</p>
              <p className="mt-2">Caja: /caja/{restaurant.slug}</p>
            </div>
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "pagos" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle title="Pedidos y pagos" description="Delivery, pedido mínimo y QR real del restaurante." />
            <div className="md:col-span-2" />
            <Input defaultValue={settings?.deliveryFee ?? 0} min="0" name="deliveryFee" placeholder="Costo delivery" step="0.01" type="number" />
            <Input defaultValue={settings?.freeDeliveryFrom || ""} min="0" name="freeDeliveryFrom" placeholder="Envío gratis desde" step="0.01" type="number" />
            <Input defaultValue={settings?.minOrderAmount ?? 0} min="0" name="minOrderAmount" placeholder="Pedido mínimo" step="0.01" type="number" />
            <Select defaultValue={settings?.currency ?? "BOB"} name="currency">
              <option value="BOB">BOB</option>
              <option value="USD">USD</option>
            </Select>
            <div className="md:col-span-2">
              <CompressedImageInput label="QR de pago" name="qrPaymentFile" />
            </div>
            <div className="md:col-span-2 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              Este QR se muestra en el pedido publico y en mesa para que el cliente pueda pagar y luego subir su comprobante.
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="QR actual" description="El equipo y los clientes verán este QR al elegir pago QR." />
            <PreviewMedia label="QR de pago" title="QR de pago" url={qrIsImage ? settings?.qrPaymentUrl ?? "" : ""} fallback="Sin QR" square />
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "operacion" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <SectionTitle title="Módulos" description="El plan elegido define qué herramientas puede usar el restaurante." />
            <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 p-4">
              <p className="text-sm font-black text-slate-950">{selectedPlan?.name ?? "Sin plan"}</p>
              <p className="mt-1 text-sm font-semibold text-slate-600">{selectedPlan?.description ?? "Selecciona un plan activo."}</p>
              <p className="mt-2 text-xs font-black uppercase text-emerald-700">{selectedPlan?.modules.length ?? 0} módulos incluidos</p>
            </div>
            <div className="mt-4 space-y-3">
              <ModuleToggle enabled={settings?.deliveryEnabled ?? true} label="Envío a domicilio" name="deliveryEnabled" />
              <ModuleToggle enabled={settings?.pickupEnabled ?? true} label="Recojo" name="pickupEnabled" />
              <ModuleToggle
                disabled={!canUseModule("table_qr")}
                enabled={(settings?.tableOrdersEnabled ?? true) && canUseModule("table_qr")}
                key={`table_qr-${selectedPlanKey}`}
                label="Pedidos en mesa"
                name="tableOrdersEnabled"
              />
              <ModuleToggle
                disabled={!canUseModule("inventory")}
                enabled={(settings?.inventoryEnabled ?? true) && canUseModule("inventory")}
                key={`inventory-${selectedPlanKey}`}
                label="Inventario"
                name="inventoryEnabled"
              />
              <ModuleToggle disabled={!canUseModule("cash")} enabled={(settings?.cashEnabled ?? true) && canUseModule("cash")} key={`cash-${selectedPlanKey}`} label="Caja / POS" name="cashEnabled" />
              <ModuleToggle
                disabled={!canUseModule("kitchen")}
                enabled={(settings?.kitchenEnabled ?? true) && canUseModule("kitchen")}
                key={`kitchen-${selectedPlanKey}`}
                label="Cocina"
                name="kitchenEnabled"
              />
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="grid gap-4">
              <SectionTitle title="Impresión" description="Formato por defecto para ticket de caja y cocina." />
              <Select defaultValue={settings?.printFormat ?? "thermal_80"} name="printFormat">
                <option value="thermal_58">Ticket térmico 58 mm</option>
                <option value="thermal_80">Ticket térmico 80 mm</option>
                <option value="large">Formato grande</option>
              </Select>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
                Imprimir automáticamente en cocina
                <input defaultChecked={settings?.autoPrintKitchen ?? false} name="autoPrintKitchen" type="checkbox" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
                Mostrar logo en ticket
                <input defaultChecked={settings?.printLogo ?? true} name="printLogo" type="checkbox" />
              </label>
            </Card>

            <Card className="space-y-3">
              <SectionTitle title="Publicación" description="Estado operativo actual del restaurante." />
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                {restaurant.status === "active"
                  ? "El menú público está habilitado mientras el restaurante siga activo."
                  : "El menú público está cerrado porque el restaurante no está activo."}
              </div>
            </Card>
          </div>
        </div>
      </div>

      <div className={cn(activeTab === "horarios" ? "block" : "hidden")}>
        <Card>
          <SectionTitle title="Horarios" description="Horario operativo asociado al restaurante." />
          <div className="mt-4 grid gap-3">
            {days.map((day, dayOfWeek) => {
              const hour = hoursByDay.get(dayOfWeek);
              return (
                <div className="grid gap-3 rounded-2xl border border-slate-200 p-3 md:grid-cols-[140px_1fr_1fr_120px]" key={day}>
                  <p className="font-bold text-slate-900">{day}</p>
                  <Input defaultValue={hour?.opensAt || "09:00"} name={`day_${dayOfWeek}_opensAt`} type="time" />
                  <Input defaultValue={hour?.closesAt || "22:00"} name={`day_${dayOfWeek}_closesAt`} type="time" />
                  <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <input defaultChecked={hour?.isClosed ?? false} name={`day_${dayOfWeek}_isClosed`} type="checkbox" />
                    Cerrado
                  </label>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      <div className="sticky bottom-4 z-10 flex justify-end">
        <Button type="submit">Guardar configuracion</Button>
      </div>
    </form>
  );
}

function PreviewMedia({
  label,
  title,
  url,
  fallback,
  square = false,
}: {
  label: string;
  title: string;
  url: string;
  fallback: string;
  square?: boolean;
}) {
  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-slate-700">{label}</p>
      <div className={cn("overflow-hidden rounded-2xl border border-slate-200 bg-slate-50", square ? "aspect-square max-w-[180px]" : "aspect-[16/9]")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={title} className="h-full w-full object-cover" src={url} />
        ) : (
          <div className="grid h-full w-full place-items-center p-4 text-center text-sm font-semibold text-slate-500">
            <div className="space-y-2">
              <ImageIcon className="mx-auto h-6 w-6" />
              <p>{fallback}</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
