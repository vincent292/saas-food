"use client";

import { CreditCard, ImageIcon, MapPin, Palette, Printer, Settings2, Store, Clock3 } from "lucide-react";
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
const defaultPalette = {
  primaryColor: "#1d8844",
  secondaryColor: "#f59e0b",
  backgroundColor: "#f7faf7",
  surfaceColor: "#ffffff",
  textColor: "#142018",
  mutedColor: "#68766c",
  borderColor: "#dfe8e2",
  navBackgroundColor: "#ffffff",
  navTextColor: "#142018",
};
const colorPalettes = [
  { name: "Verde limpio", colors: defaultPalette },
  {
    name: "Urbano",
    colors: {
      primaryColor: "#0f766e",
      secondaryColor: "#f97316",
      backgroundColor: "#f8fafc",
      surfaceColor: "#ffffff",
      textColor: "#111827",
      mutedColor: "#64748b",
      borderColor: "#e2e8f0",
      navBackgroundColor: "#ffffff",
      navTextColor: "#111827",
    },
  },
  {
    name: "Nocturno",
    colors: {
      primaryColor: "#22c55e",
      secondaryColor: "#facc15",
      backgroundColor: "#101714",
      surfaceColor: "#18211d",
      textColor: "#f8fafc",
      mutedColor: "#b6c4bc",
      borderColor: "#2b3a33",
      navBackgroundColor: "#121a16",
      navTextColor: "#f8fafc",
    },
  },
  {
    name: "Calido",
    colors: {
      primaryColor: "#b45309",
      secondaryColor: "#15803d",
      backgroundColor: "#fff7ed",
      surfaceColor: "#ffffff",
      textColor: "#1c1917",
      mutedColor: "#78716c",
      borderColor: "#fed7aa",
      navBackgroundColor: "#ffffff",
      navTextColor: "#1c1917",
    },
  },
];
const tabs = [
  { key: "general", label: "General", icon: Store },
  { key: "estilo", label: "Estilo", icon: Palette },
  { key: "pagos", label: "Pagos", icon: CreditCard },
  { key: "operacion", label: "Operación", icon: Settings2 },
  { key: "impresion", label: "ImpresiÃ³n", icon: Printer },
  { key: "ubicacion", label: "UbicaciÃ³n", icon: MapPin },
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
  const [colors, setColors] = useState(() => ({
    primaryColor: restaurant.primaryColor,
    secondaryColor: restaurant.secondaryColor,
    backgroundColor: restaurant.theme.background,
    surfaceColor: restaurant.theme.surface,
    textColor: restaurant.theme.text,
    mutedColor: restaurant.theme.muted,
    borderColor: restaurant.theme.border,
    navBackgroundColor: restaurant.theme.navBackground,
    navTextColor: restaurant.theme.navText,
  }));
  const selectedPlan = useMemo(() => plans.find((plan) => plan.key === selectedPlanKey), [plans, selectedPlanKey]);
  const planModules = useMemo(() => new Set<ModuleKey>(selectedPlan?.modules ?? []), [selectedPlan]);
  const canUseModule = (moduleKey: ModuleKey) => planModules.has(moduleKey);
  const hoursByDay = new Map(businessHours.map((hour) => [hour.dayOfWeek, hour]));
  const logoIsImage = isImageUrl(restaurant.logoUrl);
  const bannerIsImage = isImageUrl(restaurant.bannerUrl);
  const qrIsImage = isImageUrl(settings?.qrPaymentUrl);
  const updateColor = (key: keyof typeof colors, value: string) => setColors((current) => ({ ...current, [key]: value }));

  return (
    <form action={updateRestaurantConfigurationAction} className="space-y-6">
      <input name="restaurantId" type="hidden" value={restaurant.id} />
      <input name="currentSlug" type="hidden" value={restaurant.slug} />
      <input name="currentQrPaymentUrl" type="hidden" value={settings?.qrPaymentUrl ?? ""} />
      <input name="currentMenuBackgroundImageUrl" type="hidden" value={restaurant.menuBackgroundImageUrl} />
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
            <Input name="primaryColor" onChange={(event) => updateColor("primaryColor", event.target.value)} type="color" value={colors.primaryColor} />
            <Input name="secondaryColor" onChange={(event) => updateColor("secondaryColor", event.target.value)} type="color" value={colors.secondaryColor} />
            <Input defaultValue={restaurant.whatsapp} name="whatsapp" placeholder="WhatsApp" />
            <Input defaultValue={restaurant.city} name="city" placeholder="Ciudad" />
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

      <div className={cn(activeTab === "estilo" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle title="Apariencia del menu" description="Colores, fondo y tamaño del banner publico." />
            <div className="md:col-span-2" />
            <div className="grid gap-3 md:col-span-2 md:grid-cols-4">
              {colorPalettes.map((palette) => (
                <button className="rounded-2xl border border-slate-200 bg-white p-3 text-left text-sm font-black text-slate-800 shadow-sm transition hover:-translate-y-0.5" key={palette.name} onClick={() => setColors(palette.colors)} type="button">
                  <span>{palette.name}</span>
                  <span className="mt-2 flex gap-1">
                    {Object.values(palette.colors)
                      .slice(0, 5)
                      .map((color) => (
                        <span className="h-5 w-5 rounded-full border border-slate-200" key={color} style={{ background: color }} />
                      ))}
                  </span>
                </button>
              ))}
            </div>
            <button className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-black text-slate-700 md:col-span-2" onClick={() => setColors(defaultPalette)} type="button">
              Restablecer paleta
            </button>
            <Input name="backgroundColor" onChange={(event) => updateColor("backgroundColor", event.target.value)} type="color" value={colors.backgroundColor} />
            <Input name="surfaceColor" onChange={(event) => updateColor("surfaceColor", event.target.value)} type="color" value={colors.surfaceColor} />
            <Input name="textColor" onChange={(event) => updateColor("textColor", event.target.value)} type="color" value={colors.textColor} />
            <Input name="mutedColor" onChange={(event) => updateColor("mutedColor", event.target.value)} type="color" value={colors.mutedColor} />
            <Input name="borderColor" onChange={(event) => updateColor("borderColor", event.target.value)} type="color" value={colors.borderColor} />
            <Input name="navBackgroundColor" onChange={(event) => updateColor("navBackgroundColor", event.target.value)} type="color" value={colors.navBackgroundColor} />
            <Input name="navTextColor" onChange={(event) => updateColor("navTextColor", event.target.value)} type="color" value={colors.navTextColor} />
            <Select defaultValue={restaurant.publicBannerSize} name="publicBannerSize">
              <option value="compact">Banner compacto</option>
              <option value="standard">Banner medio</option>
              <option value="large">Banner grande</option>
            </Select>
            <div className="md:col-span-2">
              <CompressedImageInput label="Imagen de fondo del menu" name="menuBackgroundImageFile" />
            </div>
            <div className="md:col-span-2 rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
              El banner compacto deja ver antes las categorias y productos, especialmente en celular.
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Vista publica" description="Aproximacion del estilo aplicado." />
            <div className="rounded-2xl border p-4" style={{ background: colors.backgroundColor, borderColor: colors.borderColor, color: colors.textColor }}>
              <div className="flex items-center justify-between rounded-2xl px-3 py-2 text-sm font-black" style={{ background: colors.navBackgroundColor, color: colors.navTextColor }}>
                <span>{restaurant.name}</span>
                <span>Carrito</span>
              </div>
              <div className="mt-3 h-24 overflow-hidden rounded-2xl bg-slate-100">
                {bannerIsImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={restaurant.name} className="h-full w-full object-cover" src={restaurant.bannerUrl} />
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl text-sm font-black text-white" style={{ background: colors.primaryColor }}>
                  {logoIsImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={restaurant.name} className="h-full w-full object-cover" src={restaurant.logoUrl} />
                  ) : (
                    restaurant.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-black">{restaurant.name}</p>
                  <p className="text-sm font-semibold" style={{ color: colors.mutedColor }}>
                    Productos, combos y destacados.
                  </p>
                </div>
              </div>
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
            <Input defaultValue={settings?.qrAccountName} name="qrAccountName" placeholder="Titular de cuenta QR" />
            <Input defaultValue={settings?.qrAccountDocument} name="qrAccountDocument" placeholder="CI / NIT del titular" />
            <Input defaultValue={settings?.qrBankName} name="qrBankName" placeholder="Banco" />
            <Select defaultValue={settings?.qrAccountType || ""} name="qrAccountType">
              <option value="">Tipo de cuenta</option>
              <option value="savings">Caja de ahorro</option>
              <option value="checking">Cuenta corriente</option>
            </Select>
            <Select defaultValue={settings?.qrCurrency ?? settings?.currency ?? "BOB"} name="qrCurrency">
              <option value="BOB">QR en bolivianos</option>
              <option value="USD">QR en dolares</option>
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
              <Select defaultValue={settings?.printFormat ?? "thermal_80"} name="operationPrintFormatPreview">
                <option value="thermal_58">Ticket térmico 58 mm</option>
                <option value="thermal_80">Ticket térmico 80 mm</option>
                <option value="large">Formato grande</option>
              </Select>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
                Imprimir automáticamente en cocina
                <input defaultChecked={settings?.autoPrintKitchen ?? false} name="operationAutoPrintKitchenPreview" type="checkbox" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
                Mostrar logo en ticket
                <input defaultChecked={settings?.printLogo ?? true} name="operationPrintLogoPreview" type="checkbox" />
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

      <div className={cn(activeTab === "impresion" ? "block" : "hidden")}>
        <Card className="grid gap-4 md:grid-cols-2">
          <SectionTitle title="Impresion" description="Tamaño y formato por defecto para pedidos de caja y cocina." />
          <div className="md:col-span-2" />
          <Select defaultValue={settings?.printFormat ?? "thermal_80"} name="printFormat">
            <option value="thermal_58">Ticket termico 58 mm</option>
            <option value="thermal_80">Ticket termico 80 mm</option>
            <option value="large">Hoja normal / formato grande</option>
          </Select>
          <div className="rounded-2xl bg-slate-50 p-4 text-sm font-semibold text-slate-700">
            Usa 58/80 mm para impresora termica y hoja normal para impresion A4 o carta.
          </div>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
            Imprimir automaticamente en cocina
            <input defaultChecked={settings?.autoPrintKitchen ?? false} name="autoPrintKitchen" type="checkbox" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-slate-200 p-4 text-sm font-semibold text-slate-700">
            Mostrar logo en ticket
            <input defaultChecked={settings?.printLogo ?? true} name="printLogo" type="checkbox" />
          </label>
        </Card>
      </div>

      <div className={cn(activeTab === "ubicacion" ? "block" : "hidden")}>
        <Card className="grid gap-4 md:grid-cols-2">
          <SectionTitle title="Ubicacion" description="Direccion del local, referencia y enlace de Google Maps para recojo." />
          <div className="md:col-span-2" />
          <Input className="md:col-span-2" defaultValue={restaurant.address} name="address" placeholder="Direccion del local" />
          <Input className="md:col-span-2" defaultValue={restaurant.addressReference} name="addressReference" placeholder="Referencia, piso, zona o indicaciones" />
          <Input defaultValue={restaurant.latitude ?? ""} name="latitude" placeholder="Latitud" step="0.0000001" type="number" />
          <Input defaultValue={restaurant.longitude ?? ""} name="longitude" placeholder="Longitud" step="0.0000001" type="number" />
          <Input className="md:col-span-2" defaultValue={restaurant.mapsUrl} name="mapsUrl" placeholder="Link de Google Maps" />
          {restaurant.mapsUrl ? (
            <a className="font-black text-[var(--primary)] md:col-span-2" href={restaurant.mapsUrl} rel="noreferrer" target="_blank">
              Abrir ubicacion actual
            </a>
          ) : null}
        </Card>
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
