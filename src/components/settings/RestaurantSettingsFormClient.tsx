"use client";

import { CreditCard, ImageIcon, Settings2, Store, Clock3 } from "lucide-react";
import { useState } from "react";
import { updateRestaurantConfigurationAction } from "@/app/admin/actions";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { ModuleToggle } from "@/components/settings/ModuleToggle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { cn } from "@/lib/utils/cn";
import type { BusinessHour, Restaurant, RestaurantSettings } from "@/types/restaurant.types";

const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];
const tabs = [
  { key: "general", label: "General", icon: Store },
  { key: "pagos", label: "Pagos", icon: CreditCard },
  { key: "operacion", label: "Operacion", icon: Settings2 },
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
  saved,
  error,
  initialTab,
}: {
  restaurant: Restaurant;
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  saved?: string;
  error?: string;
  initialTab?: string;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => normalizeTab(initialTab));
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

      {saved ? <div className="rounded-2xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">Configuracion guardada en Supabase.</div> : null}
      {error ? <div className="rounded-2xl bg-red-50 p-3 text-sm font-bold text-red-700">No se pudo guardar la configuracion: {error}.</div> : null}

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
            <SectionTitle title="Identidad" description="Lo visible en el menu publico y en los paneles operativos." />
            <div className="md:col-span-2" />
            <Input defaultValue={restaurant.name} name="name" placeholder="Nombre" required />
            <Input defaultValue={restaurant.slug} name="slug" placeholder="Slug" required />
            <Input defaultValue={restaurant.primaryColor} name="primaryColor" type="color" />
            <Input defaultValue={restaurant.secondaryColor} name="secondaryColor" type="color" />
            <Input defaultValue={restaurant.whatsapp} name="whatsapp" placeholder="WhatsApp" />
            <Input defaultValue={restaurant.city} name="city" placeholder="Ciudad" />
            <Input className="md:col-span-2" defaultValue={restaurant.address} name="address" placeholder="Direccion" />
            <Select defaultValue={restaurant.status} name="status">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="suspended">Suspendido</option>
            </Select>
            <div className="rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
              El menu publico de <strong>/r/{restaurant.slug}</strong> solo responde cuando el restaurante esta en estado <strong>Activo</strong>.
            </div>
            <Textarea className="md:col-span-2" defaultValue={restaurant.description} name="description" placeholder="Descripcion" />
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
            <SectionTitle title="Pedidos y pagos" description="Delivery, pedido minimo y QR real del restaurante." />
            <div className="md:col-span-2" />
            <Input defaultValue={settings?.deliveryFee ?? 0} min="0" name="deliveryFee" placeholder="Costo delivery" step="0.01" type="number" />
            <Input defaultValue={settings?.freeDeliveryFrom || ""} min="0" name="freeDeliveryFrom" placeholder="Envio gratis desde" step="0.01" type="number" />
            <Input defaultValue={settings?.minOrderAmount ?? 0} min="0" name="minOrderAmount" placeholder="Pedido minimo" step="0.01" type="number" />
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
            <SectionTitle title="QR actual" description="El equipo y los clientes veran este QR al elegir pago QR." />
            <PreviewMedia label="QR de pago" title="QR de pago" url={qrIsImage ? settings?.qrPaymentUrl ?? "" : ""} fallback="Sin QR" square />
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "operacion" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <SectionTitle title="Modulos" description="Activa solo lo que este usando el restaurante." />
            <div className="mt-4 space-y-3">
              <ModuleToggle enabled={settings?.deliveryEnabled ?? true} label="Envio a domicilio" name="deliveryEnabled" />
              <ModuleToggle enabled={settings?.pickupEnabled ?? true} label="Recojo" name="pickupEnabled" />
              <ModuleToggle enabled={settings?.tableOrdersEnabled ?? true} label="Pedidos en mesa" name="tableOrdersEnabled" />
              <ModuleToggle enabled={settings?.inventoryEnabled ?? true} label="Inventario" name="inventoryEnabled" />
              <ModuleToggle enabled={settings?.cashEnabled ?? true} label="Caja / POS" name="cashEnabled" />
              <ModuleToggle enabled={settings?.kitchenEnabled ?? true} label="Cocina" name="kitchenEnabled" />
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="grid gap-4">
              <SectionTitle title="Impresion" description="Formato por defecto para ticket de caja y cocina." />
              <Select defaultValue={settings?.printFormat ?? "thermal_80"} name="printFormat">
                <option value="thermal_58">Ticket termico 58 mm</option>
                <option value="thermal_80">Ticket termico 80 mm</option>
                <option value="large">Formato grande</option>
              </Select>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
                Imprimir automaticamente en cocina
                <input defaultChecked={settings?.autoPrintKitchen ?? false} name="autoPrintKitchen" type="checkbox" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
                Mostrar logo en ticket
                <input defaultChecked={settings?.printLogo ?? true} name="printLogo" type="checkbox" />
              </label>
            </Card>

            <Card className="space-y-3">
              <SectionTitle title="Publicacion" description="Estado operativo actual del restaurante." />
              <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
                {restaurant.status === "active"
                  ? "El menu publico esta habilitado mientras el restaurante siga activo."
                  : "El menu publico esta cerrado porque el restaurante no esta activo."}
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
