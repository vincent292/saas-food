"use client";

import Link from "next/link";
import {
  BellRing,
  CalendarClock,
  CheckCircle2,
  Copy,
  Clock3,
  CreditCard,
  Download,
  ExternalLink,
  Filter,
  ImageIcon,
  Bike,
  KeyRound,
  Link2,
  Megaphone,
  MapPin,
  Power,
  Printer,
  ReceiptText,
  RotateCcw,
  Store,
  Unlink,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { updateRestaurantConfigurationAction } from "@/app/admin/actions";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { QrPaymentViewer } from "@/components/payments/QrPaymentViewer";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { ModuleToggle } from "@/components/settings/ModuleToggle";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  ORDER_ALERT_AUDIO_SRC,
  ORDER_ALERT_SOUND_CHANGE_EVENT,
  readOrderAlertSoundEnabled,
  writeOrderAlertSoundEnabled,
} from "@/lib/client/order-notification-sound";
import {
  businessCatalogLabelTitle,
  categoriesForBusinessType,
  restaurantBusinessTypeOptions,
  restaurantLocationOptions,
} from "@/lib/restaurant-directory-options";
import { cn } from "@/lib/utils/cn";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type {
  BusinessHour,
  Restaurant,
  RestaurantDeliveryZone,
  RestaurantAnnouncement,
  RestaurantPrintConnector,
  RestaurantSettings,
} from "@/types/restaurant.types";
import type { Order } from "@/types/order.types";

const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

const timeOptions = Array.from({ length: 24 * 12 }, (_, index) => {
  const totalMinutes = index * 5;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
});

const tabs = [
  { key: "general", label: "General", icon: Store },
  { key: "estilo", label: "Imagenes", icon: ImageIcon },
  { key: "pagos", label: "Pagos", icon: CreditCard },
  { key: "facturas", label: "Facturas", icon: ReceiptText },
  { key: "impresion", label: "Impresion", icon: Printer },
  { key: "ubicacion", label: "Ubicacion", icon: MapPin },
  { key: "delivery", label: "Delivery", icon: Bike },
  { key: "operacion", label: "Operacion", icon: Power },
  { key: "notificaciones", label: "Notificaciones", icon: BellRing },
  { key: "horarios", label: "Horarios", icon: Clock3 },
  { key: "avisos", label: "Avisos", icon: Megaphone },
] as const;

const saveableTabs = new Set<(typeof tabs)[number]["key"]>(["general", "estilo", "pagos", "impresion", "ubicacion", "delivery", "operacion", "horarios"]);

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para completar esta operacion.",
  "owner-email-required": "Debes indicar un correo para actualizar el acceso principal.",
  "owner-not-found": "No se pudo encontrar o crear el usuario responsable.",
  "restaurant-not-found": "No se encontro el restaurante para guardar la configuracion.",
  "admin-required": "Solo el responsable principal o superadmin puede guardar esta configuracion.",
  "owner-required": "Solo el dueno de la cuenta puede cambiar esta configuracion sensible.",
  "superadmin-required": "Solo superadmin puede cambiar esta configuracion sensible.",
  "invalid-zone": "Revisa los datos de la zona de delivery.",
  "invalid-invoice": "No se pudo marcar la factura.",
  "print-token-generate-failed": "No se pudo generar el token de impresion.",
  "print-token-revoke-failed": "No se pudo revocar el token de impresion.",
};

type SettingsTab = (typeof tabs)[number]["key"];

function normalizeTab(value?: string): SettingsTab {
  return tabs.some((tab) => tab.key === value) ? (value as SettingsTab) : "general";
}

function isImageUrl(value: string | undefined) {
  return Boolean(value && (value.startsWith("http") || value.startsWith("/")));
}

function toDateTimeLocalInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function endOfToday() {
  const date = new Date();
  date.setHours(23, 59, 59, 999);
  return date;
}

function normalizeTime(value?: string | null) {
  return value?.slice(0, 5) ?? "";
}

function timeToMinutes(value?: string | null) {
  const normalized = normalizeTime(value);
  const [hours, minutes] = normalized.split(":").map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
    return null;
  }
  return hours * 60 + minutes;
}

function hourRangeHint(opensAt?: string | null, closesAt?: string | null) {
  const opens = timeToMinutes(opensAt);
  const closes = timeToMinutes(closesAt);

  if (opens === null || closes === null) {
    return "";
  }

  if (opens === closes) {
    return "Abierto 24 horas.";
  }

  if (opens > closes) {
    return "Cruza medianoche: cierra al dia siguiente.";
  }

  return "";
}

function timeSelectOptions(value: string) {
  return timeOptions.includes(value) ? timeOptions : [value, ...timeOptions].filter(Boolean).sort();
}

function timeOptionLabel(value: string) {
  const minutes = timeToMinutes(value);
  if (minutes === null) {
    return value;
  }

  const hour = Math.floor(minutes / 60);
  const minute = minutes % 60;
  const hour12 = hour % 12 || 12;
  const period = hour < 12 ? "a.m." : "p.m.";
  return `${value} (${hour12}:${String(minute).padStart(2, "0")} ${period})`;
}

function BusinessHourTimeSelect({
  disabled,
  name,
  onChange,
  value,
}: {
  disabled: boolean;
  name: string;
  onChange: (value: string) => void;
  value: string;
}) {
  return (
    <Select disabled={disabled} name={name} onChange={(event) => onChange(event.target.value)} value={value}>
      {timeSelectOptions(value).map((time) => (
        <option key={time} value={time}>
          {timeOptionLabel(time)}
        </option>
      ))}
    </Select>
  );
}

function BusinessHourEditorRow({ day, dayOfWeek, hour }: { day: string; dayOfWeek: number; hour?: BusinessHour }) {
  const [opensAt, setOpensAt] = useState(hour?.opensAt || "09:00");
  const [closesAt, setClosesAt] = useState(hour?.closesAt || "22:00");
  const [isClosed, setIsClosed] = useState(hour?.isClosed ?? false);
  const hint = isClosed ? "" : hourRangeHint(opensAt, closesAt);

  return (
    <div className="grid gap-3 rounded-2xl border border-[var(--border)] p-3 md:grid-cols-[140px_1fr_1fr_120px]">
      <p className="font-bold text-[var(--color-heading)]">{day}</p>
      <label className="space-y-1">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">Abre (HH:mm)</span>
        <BusinessHourTimeSelect disabled={isClosed} name={`day_${dayOfWeek}_opensAt`} onChange={setOpensAt} value={opensAt} />
      </label>
      <label className="space-y-1">
        <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[var(--muted)]">Cierra (HH:mm)</span>
        <BusinessHourTimeSelect disabled={isClosed} name={`day_${dayOfWeek}_closesAt`} onChange={setClosesAt} value={closesAt} />
      </label>
      <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-body)]">
        <input checked={isClosed} name={`day_${dayOfWeek}_isClosed`} onChange={(event) => setIsClosed(event.target.checked)} type="checkbox" />
        Cerrado
      </label>
      {hint ? (
        <div className="rounded-2xl border border-[var(--color-warning-border)] bg-[var(--color-warning-soft)] p-3 text-xs font-bold text-[var(--color-warning-strong)] md:col-start-2 md:col-end-5">
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function savedMessage({
  saved,
  announcementCreated,
  closureCreated,
  announcementDisabled,
  zoneSaved,
  invoiceMarked,
  printConnector,
}: {
  saved?: string;
  announcementCreated?: string;
  closureCreated?: string;
  announcementDisabled?: string;
  zoneSaved?: string;
  invoiceMarked?: string;
  printConnector?: string;
}) {
  if (saved) return "Configuracion general guardada.";
  if (announcementCreated === "updated") return "Aviso actualizado.";
  if (announcementCreated) return "Comunicado publicado.";
  if (closureCreated) return "Cierre temporal publicado para hoy.";
  if (announcementDisabled) return "Aviso desactivado.";
  if (zoneSaved) return "Zona de delivery actualizada.";
  if (invoiceMarked) return "Factura marcada como emitida.";
  if (printConnector === "generated") return "Token de impresion generado.";
  if (printConnector === "revoked") return "Token de impresion revocado.";
  return "";
}

export function RestaurantSettingsFormClient({
  restaurant,
  settings,
  businessHours,
  announcements,
  saved,
  error,
  announcementCreated,
  closureCreated,
  announcementDisabled,
  zoneSaved,
  printConnector,
  invoiceMarked,
  deliveryZones,
  printConnectorLink,
  invoiceRequests,
  initialTab,
  canManagePlan,
  canManageDeliverySettings,
  canManageOperationSettings,
  canManagePayments,
  invoiceFilters,
  riderInviteUrl,
}: {
  restaurant: Restaurant;
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  announcements: RestaurantAnnouncement[];
  saved?: string;
  error?: string;
  announcementCreated?: string;
  closureCreated?: string;
  announcementDisabled?: string;
  zoneSaved?: string;
  printConnector?: string;
  invoiceMarked?: string;
  deliveryZones: RestaurantDeliveryZone[];
  printConnectorLink: RestaurantPrintConnector | null;
  invoiceRequests: Order[];
  initialTab?: string;
  canManagePlan: boolean;
  canManageDeliverySettings: boolean;
  canManageOperationSettings: boolean;
  canManagePayments: boolean;
  invoiceFilters: {
    dateFrom: string;
    dateTo: string;
    status: "all" | "pending" | "issued";
  };
  riderInviteUrl?: string;
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => normalizeTab(initialTab));
  const [invoiceDateFromFilter, setInvoiceDateFromFilter] = useState(invoiceFilters.dateFrom);
  const [invoiceDateToFilter, setInvoiceDateToFilter] = useState(invoiceFilters.dateTo);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState(invoiceFilters.status);
  const [riderInviteCopied, setRiderInviteCopied] = useState(false);
  const successMessage = savedMessage({
    saved,
    announcementCreated,
    closureCreated,
    announcementDisabled,
    zoneSaved,
    invoiceMarked,
    printConnector,
  });
  const [showSuccessModal, setShowSuccessModal] = useState(Boolean(successMessage));

  const hoursByDay = new Map(businessHours.map((hour) => [hour.dayOfWeek, hour]));
  const logoIsImage = isImageUrl(restaurant.logoUrl);
  const bannerIsImage = isImageUrl(restaurant.bannerUrl);
  const qrIsImage = isImageUrl(settings?.qrPaymentUrl);
  const catalogLabelTitle = businessCatalogLabelTitle(restaurant.businessType);
  const pendingInvoiceRequests = invoiceRequests.filter((order) => !order.invoiceIssuedAt);
  const moduleReadState = {
    deliveryEnabled: settings?.deliveryEnabled ?? true,
    pickupEnabled: settings?.pickupEnabled ?? true,
    tableOrdersEnabled: settings?.tableOrdersEnabled ?? true,
    inventoryEnabled: settings?.inventoryEnabled ?? true,
    cashEnabled: settings?.cashEnabled ?? true,
    kitchenEnabled: settings?.kitchenEnabled ?? true,
  };
  const nowInputValue = toDateTimeLocalInput(new Date());
  const endOfTodayInputValue = toDateTimeLocalInput(endOfToday());
  const canSaveActiveTab =
    saveableTabs.has(activeTab) &&
    (activeTab !== "pagos" || canManagePayments) &&
    (activeTab !== "delivery" || canManageDeliverySettings) &&
    (activeTab !== "operacion" || canManageOperationSettings);
  const showStickySave = canSaveActiveTab;
  const invoiceFilterHref = useMemo(() => {
    const params = new URLSearchParams({ tab: "facturas" });
    if (invoiceDateFromFilter) params.set("invoiceFrom", invoiceDateFromFilter);
    if (invoiceDateToFilter) params.set("invoiceTo", invoiceDateToFilter);
    if (invoiceStatusFilter !== "all") params.set("invoiceStatus", invoiceStatusFilter);
    return `/admin/restaurantes/${restaurant.id}/configuracion?${params.toString()}`;
  }, [invoiceDateFromFilter, invoiceDateToFilter, invoiceStatusFilter, restaurant.id]);
  const invoiceResetHref = `/admin/restaurantes/${restaurant.id}/configuracion?tab=facturas`;

  async function copyRiderInviteUrl() {
    if (!riderInviteUrl) return;
    await navigator.clipboard.writeText(riderInviteUrl);
    setRiderInviteCopied(true);
    window.setTimeout(() => setRiderInviteCopied(false), 1400);
  }

  useEffect(() => {
    if (!successMessage) {
      return;
    }

    const showTimer = window.setTimeout(() => setShowSuccessModal(true), 0);
    const hideTimer = window.setTimeout(() => setShowSuccessModal(false), 2800);
    return () => {
      window.clearTimeout(showTimer);
      window.clearTimeout(hideTimer);
    };
  }, [successMessage]);

  return (
    <form action={updateRestaurantConfigurationAction} className="space-y-6">
      <SettingsSavingOverlay />
      {showSuccessModal && successMessage ? <SettingsSavedModal message={successMessage} onClose={() => setShowSuccessModal(false)} /> : null}
      <input name="restaurantId" type="hidden" value={restaurant.id} />
      <input name="currentSlug" type="hidden" value={restaurant.slug} />
      <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
      <input name="currentQrPaymentUrl" type="hidden" value={settings?.qrPaymentUrl ?? ""} />
      <input name="currentMenuBackgroundImageUrl" type="hidden" value={restaurant.menuBackgroundImageUrl} />
      <input name="tab" type="hidden" value={activeTab} />
      <input name="invoiceFrom" type="hidden" value={invoiceFilters.dateFrom} />
      <input name="invoiceTo" type="hidden" value={invoiceFilters.dateTo} />
      <input name="invoiceStatus" type="hidden" value={invoiceFilters.status} />
      {moduleReadState.pickupEnabled ? <input name="pickupEnabled" type="hidden" value="on" /> : null}
      {moduleReadState.tableOrdersEnabled ? <input name="tableOrdersEnabled" type="hidden" value="on" /> : null}
      {moduleReadState.inventoryEnabled ? <input name="inventoryEnabled" type="hidden" value="on" /> : null}
      {moduleReadState.cashEnabled ? <input name="cashEnabled" type="hidden" value="on" /> : null}
      {!canManageOperationSettings && moduleReadState.kitchenEnabled ? <input name="kitchenEnabled" type="hidden" value="on" /> : null}

      {saved ? <Banner tone="success">Configuracion general guardada.</Banner> : null}
      {announcementCreated ? <Banner tone="success">{announcementCreated === "updated" ? "Aviso actualizado." : "Comunicado publicado."}</Banner> : null}
      {closureCreated ? <Banner tone="success">Cierre temporal publicado para hoy.</Banner> : null}
      {announcementDisabled ? <Banner tone="success">Aviso desactivado.</Banner> : null}
      {zoneSaved ? <Banner tone="success">Zona de delivery actualizada.</Banner> : null}
      {printConnector === "generated" ? <Banner tone="success">Token de impresion generado.</Banner> : null}
      {printConnector === "revoked" ? <Banner tone="success">Token de impresion revocado.</Banner> : null}
      {invoiceMarked ? <Banner tone="success">Factura marcada como emitida.</Banner> : null}
      {error ? <Banner tone="danger">{errorMessages[error] ?? `No se pudo guardar la configuracion: ${error}.`}</Banner> : null}

      <div className="flex gap-2 overflow-x-auto rounded-[1.25rem] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm">
        {tabs.map((tab) => (
          <button
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-black transition",
              activeTab === tab.key ? "bg-[var(--primary)] text-[var(--color-on-primary)]" : "text-[var(--muted)] hover:bg-[var(--primary-light)]",
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
            <SectionTitle title="Identidad" description={`Lo visible en el ${catalogLabelTitle.toLowerCase()} publico y en los paneles operativos.`} />
            <div className="md:col-span-2" />
            <Input defaultValue={restaurant.name} name="name" placeholder="Nombre comercial" required />
            <Input defaultValue={restaurant.slug} name="slug" placeholder="Slug publico" required />
            <Input defaultValue={restaurant.whatsapp} name="whatsapp" placeholder="WhatsApp" />
            <FieldSelect label="Ciudad">
              <Select defaultValue={restaurant.city || "Cochabamba"} name="city">
                {restaurantLocationOptions.map((location) => (
                  <option key={location} value={location}>
                    {location}
                  </option>
                ))}
              </Select>
            </FieldSelect>
            <FieldSelect label="Rubro principal">
              <Select defaultValue={restaurant.businessType} name="businessType">
                {restaurantBusinessTypeOptions.map((businessType) => (
                  <option key={businessType.value} value={businessType.value}>
                    {businessType.label}
                  </option>
                ))}
              </Select>
            </FieldSelect>
            <FieldSelect label="Subcategoria publica">
              <Select defaultValue={restaurant.publicCategory} name="publicCategory">
                {restaurantBusinessTypeOptions.map((businessType) => (
                  <optgroup key={businessType.value} label={businessType.label}>
                    {categoriesForBusinessType(businessType.value).map((category) => (
                      <option key={category.value} value={category.value}>
                        {category.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </Select>
            </FieldSelect>
            <FieldSelect label="Estado publico">
              {restaurant.status === "suspended" && !canManagePlan ? (
                <div className="rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] px-4 py-3 text-sm font-black text-[var(--color-danger-strong)]">
                  Suspendido por cuenta
                  <input name="status" type="hidden" value="suspended" />
                </div>
              ) : (
                <Select defaultValue={restaurant.status === "suspended" ? "suspended" : restaurant.status} name="status">
                  <option value="active">Activo: visible y recibe pedidos</option>
                  <option value="inactive">Inactivo: visible/cerrado sin recibir pedidos</option>
                  {canManagePlan ? <option value="suspended">Suspendido por cuenta</option> : null}
                </Select>
              )}
            </FieldSelect>
            <Textarea className="md:col-span-2" defaultValue={restaurant.description} name="description" placeholder="Descripcion del negocio" />
            <CompressedImageInput help="Recomendado: cuadrado 800 x 800 px. Se subira optimizado en WebP." label="Logo" name="logoFile" previewClassName="aspect-square" />
            <CompressedImageInput help="Recomendado: 1600 x 900 px o similar. Evita texto pequeno dentro de la imagen." label="Banner" name="bannerFile" />
            <div className="rounded-2xl border border-[var(--border)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
              El {catalogLabelTitle.toLowerCase()} publico <strong>{publicRestaurantPath(restaurant.slug)}</strong> solo recibe pedidos cuando el negocio esta activo.
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Vista previa" description="Identidad actual guardada en Supabase Storage." />
            <PreviewMedia label="Logo" title={restaurant.name} url={logoIsImage ? restaurant.logoUrl : ""} fallback={restaurant.name.slice(0, 2).toUpperCase()} square />
            <PreviewMedia label="Banner" title={`${restaurant.name} banner`} url={bannerIsImage ? restaurant.bannerUrl : ""} fallback="Sin banner" />
            <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
              <p>Menu: {publicRestaurantPath(restaurant.slug)}</p>
              <p className="mt-2">Cocina: /cocina/{restaurant.slug}</p>
              <p className="mt-2">Caja: /caja/{restaurant.slug}</p>
            </div>
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "estilo" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle title="Apariencia del menu" description="Colores, fondo y tamano del banner publico." />
            <div className="md:col-span-2" />
            <Select defaultValue={restaurant.publicBannerSize} name="publicBannerSize">
              <option value="compact">Banner compacto</option>
              <option value="standard">Banner medio</option>
              <option value="large">Banner grande</option>
            </Select>
            <div className="md:col-span-2">
              <CompressedImageInput help="Opcional. Recomendado: 1600 x 1200 px, liviana y sin texto importante." label="Imagen de fondo del menu" name="menuBackgroundImageFile" />
            </div>
            <div className="md:col-span-2 rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
              El banner compacto deja ver antes las categorias y productos, especialmente en celular.
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Vista publica" description="Aproximacion del estilo aplicado." />
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-[var(--text)]">
              <div className="flex items-center justify-between rounded-2xl bg-[var(--primary)] px-3 py-2 text-sm font-black text-[var(--color-on-primary)]">
                <span>{restaurant.name}</span>
                <span>Carrito</span>
              </div>
              <div className="mt-3 h-24 overflow-hidden rounded-2xl bg-[var(--color-neutral-100)]">
                {bannerIsImage ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={restaurant.name} className="h-full w-full object-cover" src={restaurant.bannerUrl} />
                ) : null}
              </div>
              <div className="mt-3 flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center overflow-hidden rounded-2xl bg-[var(--primary)] text-sm font-black text-[var(--color-on-primary)]">
                  {logoIsImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img alt={restaurant.name} className="h-full w-full object-cover" src={restaurant.logoUrl} />
                  ) : (
                    restaurant.name.slice(0, 2).toUpperCase()
                  )}
                </div>
                <div>
                  <p className="font-black">{restaurant.name}</p>
                  <p className="text-sm font-semibold text-[var(--muted)]">Productos, combos y destacados.</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "pagos" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle title="Pagos y factura" description="QR real del restaurante, datos de cuenta y solicitud de factura publica." />
            {!canManagePayments ? (
              <div className="md:col-span-2 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm font-bold leading-6 text-[var(--color-warning-strong)]">
                Solo el dueno de la cuenta puede cambiar QR, datos de cobro y solicitud de factura. El equipo de la sucursal puede consultarlos.
              </div>
            ) : null}
            <div className="md:col-span-2" />
            <input name="currency" type="hidden" value={settings?.currency ?? "BOB"} />
            <input name="qrAccountType" type="hidden" value={settings?.qrAccountType ?? ""} />
            <input name="qrCurrency" type="hidden" value={settings?.qrCurrency ?? settings?.currency ?? "BOB"} />
            <div className="md:col-span-2">
              <ModuleToggle disabled={!canManagePayments} enabled={settings?.invoiceEnabled ?? false} label="Mostrar solicitud de factura en pedidos publicos" name="invoiceEnabled" />
            </div>
            <Input defaultValue={settings?.qrAccountName} disabled={!canManagePayments} name="qrAccountName" placeholder="Titular de cuenta QR" />
            <Input defaultValue={settings?.qrAccountDocument} disabled={!canManagePayments} name="qrAccountDocument" placeholder="CI / NIT del titular" />
            <Input defaultValue={settings?.qrBankName} disabled={!canManagePayments} name="qrBankName" placeholder="Banco" />
            <div className="md:col-span-2">
              {canManagePayments ? (
                <CompressedImageInput help="Recomendado: QR cuadrado, nitido y sin bordes cortados. Se subira como WebP." label="QR de pago" name="qrPaymentFile" previewClassName="aspect-square" />
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                  El QR actual se muestra al costado. Para cambiarlo debe ingresar el dueno desde su cuenta.
                </div>
              )}
            </div>
            <div className="md:col-span-2 rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
              Este QR se muestra en el pedido publico y en mesa para que el cliente pague y luego suba su comprobante.
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="QR actual" description="El equipo y los clientes veran este QR al elegir pago QR." />
            {qrIsImage ? (
              <QrPaymentViewer
                downloadFileName={`${restaurant.slug}-qr-pago.png`}
                imageClassName="h-40 w-40"
                subtitle="QR visible para pedidos publicos, mesas y POS."
                title="QR de pago"
                url={settings?.qrPaymentUrl ?? ""}
              />
            ) : (
              <PreviewMedia label="QR de pago" title="QR de pago" url="" fallback="Sin QR" square />
            )}
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "facturas" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="space-y-4">
            <SectionTitle title="Solicitudes de factura" description="Pedidos donde el cliente pidio factura. Marca emitido cuando ya generaste la factura para no duplicar." />
            <div className="grid gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 lg:grid-cols-[1fr_1fr_1fr_auto] lg:items-end">
              <FieldSelect label="Estado">
                <Select onChange={(event) => setInvoiceStatusFilter(event.target.value as "all" | "pending" | "issued")} value={invoiceStatusFilter}>
                  <option value="all">Todas</option>
                  <option value="pending">Pendientes</option>
                  <option value="issued">Emitidas</option>
                </Select>
              </FieldSelect>
              <FieldSelect label="Desde">
                <Input max={invoiceDateToFilter || undefined} onChange={(event) => setInvoiceDateFromFilter(event.target.value)} type="date" value={invoiceDateFromFilter} />
              </FieldSelect>
              <FieldSelect label="Hasta">
                <Input min={invoiceDateFromFilter || undefined} onChange={(event) => setInvoiceDateToFilter(event.target.value)} type="date" value={invoiceDateToFilter} />
              </FieldSelect>
              <div className="flex flex-wrap gap-2">
                <Link className={buttonClasses("primary", "min-h-11 flex-1 px-5 lg:flex-none")} href={invoiceFilterHref}>
                  <Filter className="h-4 w-4" />
                  Filtrar
                </Link>
                <Link className={buttonClasses("secondary", "min-h-11 flex-1 px-5 lg:flex-none")} href={invoiceResetHref}>
                  <RotateCcw className="h-4 w-4" />
                  Limpiar
                </Link>
              </div>
            </div>
            {invoiceRequests.length ? (
              <div className="space-y-3">
                {invoiceRequests.map((order) => {
                  const issued = Boolean(order.invoiceIssuedAt);
                  return (
                    <div className={cn("rounded-2xl border p-4", issued ? "border-[var(--border)] bg-[var(--color-surface)]" : "border-[var(--color-warning)] bg-[var(--color-warning-soft)]")} key={order.id}>
                      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-base font-black text-[var(--color-heading)]">Pedido {order.orderNumber}</p>
                            <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", issued ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning)] text-[var(--color-on-primary)]")}>
                              {issued ? "Facturada" : "Pendiente"}
                            </span>
                          </div>
                          <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">{formatDateTime(order.createdAt)} · Bs {order.total.toFixed(2)}</p>
                          <div className="mt-3 grid gap-2 text-sm font-semibold text-[var(--color-body)] sm:grid-cols-2">
                            <p><span className="text-[var(--color-secondary-text)]">Nombre/Razon:</span> {order.invoiceName || "Sin dato"}</p>
                            <p><span className="text-[var(--color-secondary-text)]">Documento:</span> {order.invoiceDocumentNumber || "Sin dato"}</p>
                            <p><span className="text-[var(--color-secondary-text)]">Tipo:</span> {(order.invoiceDocumentType || "nit").toUpperCase()}</p>
                            <p><span className="text-[var(--color-secondary-text)]">WhatsApp:</span> {order.customerPhone || "Sin telefono"}</p>
                          </div>
                          {issued ? (
                            <p className="mt-3 text-xs font-bold text-[var(--color-success-strong)]">
                              Emitida {order.invoiceIssuedAt ? formatDateTime(order.invoiceIssuedAt) : ""}{order.invoiceNumber ? ` · Nro ${order.invoiceNumber}` : ""}
                            </p>
                          ) : null}
                        </div>
                      </div>

                      {!issued ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
                          <Input name={`invoiceNumber_${order.id}`} placeholder="Numero de factura o codigo" />
                          <Input name={`invoiceNotes_${order.id}`} placeholder="Notas internas opcionales" />
                          <SettingsSubmitButton className="min-h-11" name="settingsIntent" pendingLabel="Marcando..." value={`mark-invoice-issued:${order.id}`}>
                            <CheckCircle2 className="h-4 w-4" />
                            Marcar emitida
                          </SettingsSubmitButton>
                        </div>
                      ) : order.invoiceNotes ? (
                        <p className="mt-3 rounded-2xl bg-[var(--surface)] p-3 text-xs font-semibold text-[var(--color-secondary-text)]">{order.invoiceNotes}</p>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-secondary-text)]">
                Todavia no hay pedidos con solicitud de factura.
              </div>
            )}
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Control rapido" description="Resumen para evitar duplicados." />
            <InfoMetric label="Pendientes" value={String(pendingInvoiceRequests.length)} />
            <InfoMetric label="Emitidas" value={String(invoiceRequests.length - pendingInvoiceRequests.length)} />
            <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
              La solicitud de factura nace desde el pedido publico o QR de mesa. Esta vista solo controla si ya se genero para evitar hacerla dos veces.
            </div>
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "impresion" ? "block" : "hidden")}>
        <div className="space-y-6">
          <Card className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
            <div className="grid gap-4">
              <SectionTitle title="Impresion de cocina" description="Formato que usan los botones de ticket y la impresion al aprobar pedidos." />
              <FieldSelect label="Formato por defecto">
                <Select defaultValue={settings?.printFormat ?? "thermal_80"} name="printFormat">
                  <option value="thermal_58">Ticket termico 58 mm</option>
                  <option value="thermal_80">Ticket termico 80 mm</option>
                  <option value="large">Hoja normal / formato grande</option>
                </Select>
              </FieldSelect>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm font-semibold text-[var(--color-body)]">
                <span>
                  <span className="block font-black text-[var(--color-heading)]">Abrir ticket al aprobar</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">Cuando caja aprueba y cobra, se abre el ticket de cocina con el dialogo de impresion del navegador.</span>
                </span>
                <input defaultChecked={settings?.autoPrintKitchen ?? false} name="autoPrintKitchen" type="checkbox" />
              </label>
              <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm font-semibold text-[var(--color-body)]">
                <span>
                  <span className="block font-black text-[var(--color-heading)]">Mostrar logo en ticket</span>
                  <span className="mt-1 block text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">Usa el logo guardado en la sucursal cuando sea una imagen valida.</span>
                </span>
                <input defaultChecked={settings?.printLogo ?? true} name="printLogo" type="checkbox" />
              </label>
            </div>

            <div className="space-y-3 rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
              <p className="font-black text-[var(--color-heading)]">Operacion sin pantalla</p>
              <p>58/80 mm esta pensado para impresoras termicas de rollo. Formato grande sirve para impresora normal.</p>
              <p>La impresion web abre una ventana de ticket y ejecuta imprimir. Para impresion silenciosa directa se necesita un puente local o impresora de red configurada fuera del navegador.</p>
            </div>
          </Card>

          <PrintConnectorSettingsCard connector={printConnectorLink} restaurant={restaurant} />
        </div>
      </div>

      <div className={cn(activeTab === "ubicacion" ? "block" : "hidden")}>
        <Card className="grid gap-4 md:grid-cols-2">
          <SectionTitle title="Ubicacion" description="Direccion del local, referencia y punto de Google Maps para recojo y calculo de distancia." />
          <div className="md:col-span-2" />
          <Input className="md:col-span-2" defaultValue={restaurant.address} name="address" placeholder="Direccion del local" />
          <Input className="md:col-span-2" defaultValue={restaurant.addressReference} name="addressReference" placeholder="Referencia, piso, zona o indicaciones" />
          <GoogleLocationFields
            defaultLatitude={restaurant.latitude}
            defaultLongitude={restaurant.longitude}
            defaultMapsUrl={restaurant.mapsUrl}
            hideCoordinateInputs
            hideMapsUrlInput
            label={restaurant.name}
            showMapByDefault
          />
        </Card>
      </div>

      <div className={cn(activeTab === "delivery" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Card className="grid gap-4 md:grid-cols-2">
              <SectionTitle title="Estado y costos" description="Activa delivery, define costo base, pedido minimo y envio gratis por subtotal." />
              {!canManageDeliverySettings ? (
                <div className="md:col-span-2 rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm font-bold leading-6 text-[var(--color-warning-strong)]">
                  Solo el dueno de la cuenta puede cambiar costos y reglas de delivery.
                </div>
              ) : null}
              <div className="md:col-span-2">
                <ModuleToggle disabled={!canManageDeliverySettings} enabled={settings?.deliveryEnabled ?? true} label="Aceptar pedidos delivery" name="deliveryEnabled" />
              </div>
              <FieldSelect label="Costo base">
                <Input defaultValue={settings?.deliveryFee ?? 0} disabled={!canManageDeliverySettings} min="0" name="deliveryFee" placeholder="Bs 0 para delivery gratis" step="0.01" type="number" />
              </FieldSelect>
              <FieldSelect label="Pedido minimo">
                <Input defaultValue={settings?.minOrderAmount ?? 0} disabled={!canManageDeliverySettings} min="0" name="minOrderAmount" placeholder="Pedido minimo para delivery" step="0.01" type="number" />
              </FieldSelect>
              <FieldSelect label="Envio gratis desde">
                <Input defaultValue={settings?.freeDeliveryFrom || ""} disabled={!canManageDeliverySettings} min="0" name="freeDeliveryFrom" placeholder="Opcional por subtotal" step="0.01" type="number" />
              </FieldSelect>
              <div className="md:col-span-2 rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
                Para delivery gratis deja el costo base en 0. Si una zona coincide con el cliente, el sistema usa el costo y minimo de esa zona.
              </div>
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
              <SectionTitle title="Seguridad del pedido" description="Reduce pedidos falsos pidiendo pago anticipado por QR cuando la distancia sea alta." />
              <div className="md:col-span-2">
                <ModuleToggle disabled={!canManageDeliverySettings} enabled={settings?.deliveryQrPrepaymentEnabled ?? true} label="Pedir QR obligatorio por distancia" name="deliveryQrPrepaymentEnabled" />
              </div>
              <FieldSelect label="Aplicar desde">
                <Input defaultValue={settings?.farDeliveryDistanceKm ?? 5} disabled={!canManageDeliverySettings} min="1" name="farDeliveryDistanceKm" placeholder="5 km" step="0.5" type="number" />
              </FieldSelect>
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
                Default del sistema: 5 km. Si esta regla esta apagada, el cliente podra elegir efectivo aunque viva lejos.
              </div>
            </Card>

            <Card className="space-y-4">
              <SectionTitle title="Registro de riders" description="Link unico y reutilizable para afiliar motos de confianza a esta sucursal." />
              {riderInviteUrl ? (
                <>
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
                    <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Link para WhatsApp</p>
                    <p className="mt-2 break-all text-sm font-black text-[var(--color-heading)]">{riderInviteUrl}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button className={buttonClasses("secondary")} onClick={copyRiderInviteUrl} type="button">
                      <Copy className="h-4 w-4" />
                      {riderInviteCopied ? "Copiado" : "Copiar link"}
                    </button>
                    <a className={buttonClasses("primary")} href={riderInviteUrl} rel="noreferrer" target="_blank">
                      <ExternalLink className="h-4 w-4" />
                      Abrir formulario
                    </a>
                  </div>
                  <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
                    Puedes mandar este mismo link a un grupo. Cada rider que lo llene crea una solicitud independiente para revision de superadmin.
                  </div>
                </>
              ) : (
                <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                  El link se genera para el dueno de la cuenta o superadmin cuando esta configuracion esta habilitada.
                </div>
              )}
            </Card>
          </div>

          <Card className="space-y-4">
            <SectionTitle title="Zona con precio especial" description="Crea excepciones al costo base: por ejemplo 3 km gratis y otra zona mas amplia con costo." />
            {canManageDeliverySettings ? (
              <>
                <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
                  Si el cliente cae dentro de una zona activa, se aplica el costo de esa zona. Usa costo 0 para cobertura gratis.
                </div>
                <Input name="zoneName" placeholder="Nombre visible, ej: Centro / Norte / Zona Muyurina" />
                <Input defaultValue={restaurant.city} name="zoneCity" placeholder="Ciudad de esta zona" />
                <GoogleLocationFields
                  hideCoordinateInputs
                  hideMapsUrlInput
                  label="Centro de zona"
                  latitudeName="zoneLatitude"
                  longitudeName="zoneLongitude"
                  mapHeightClassName="h-64"
                  mapsUrlName="zoneMapsUrl"
                  showMapByDefault
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <Input defaultValue="3" min="0.1" name="zoneRadiusKm" placeholder="Cobertura en km" step="0.1" type="number" />
                  <Input defaultValue={settings?.deliveryFee ?? 0} min="0" name="zoneDeliveryFee" placeholder="Costo envio Bs" step="0.01" type="number" />
                  <Input defaultValue={settings?.minOrderAmount ?? 0} min="0" name="zoneMinOrderAmount" placeholder="Minimo pedido Bs" step="0.01" type="number" />
                </div>
                <SettingsSubmitButton name="settingsIntent" pendingLabel="Guardando zona..." value="save-delivery-zone">
                  <MapPin className="h-4 w-4" />
                  Guardar zona
                </SettingsSubmitButton>
              </>
            ) : (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
                Las zonas estan visibles para operacion, pero solo el dueno puede crear, pausar o eliminar cobertura.
              </div>
            )}
          </Card>

          <Card className="space-y-4 xl:col-span-2">
            <SectionTitle title="Zonas delivery" description="Cada tarjeta muestra radio de cobertura, precio de envio y minimo requerido para esa zona." />
            {deliveryZones.length ? (
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {deliveryZones.map((zone) => (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" key={zone.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-[var(--color-heading)]">{zone.name}</p>
                        <p className="mt-1 text-xs font-semibold text-[var(--color-secondary-text)]">{zone.city || restaurant.city || "Sin ciudad"}</p>
                      </div>
                      <span className={cn("rounded-full px-2.5 py-1 text-[10px] font-black", zone.isActive ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]")}>
                        {zone.isActive ? "Activa" : "Pausada"}
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs font-bold text-[var(--color-body)]">
                      <span className="rounded-xl bg-[var(--color-surface)] p-2">Radio {zone.radiusKm} km</span>
                      <span className="rounded-xl bg-[var(--color-surface)] p-2">{zone.deliveryFee > 0 ? `Envio Bs ${zone.deliveryFee}` : "Envio gratis"}</span>
                      <span className="rounded-xl bg-[var(--color-surface)] p-2">Minimo Bs {zone.minOrderAmount}</span>
                    </div>
                    {canManageDeliverySettings ? (
                      <div className="mt-3 flex gap-2">
                        <SettingsSubmitButton className="min-h-10 flex-1 text-xs" name="settingsIntent" pendingLabel="Actualizando..." value={`toggle-delivery-zone:${zone.id}`} variant="secondary">
                          {zone.isActive ? "Pausar" : "Activar"}
                        </SettingsSubmitButton>
                        <SettingsSubmitButton className="min-h-10 flex-1 text-xs" name="settingsIntent" pendingLabel="Eliminando..." value={`delete-delivery-zone:${zone.id}`} variant="secondary">
                          Eliminar
                        </SettingsSubmitButton>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-secondary-text)]">
                Todavia no hay zonas. Puedes empezar con una zona general por ciudad y despues separar barrios o radios.
              </div>
            )}
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "operacion" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="grid gap-4">
            <SectionTitle title="Flujo de pedidos" description="Define si esta sucursal trabaja con cocina/preparacion o si entrega directo desde caja." />
            {!canManageOperationSettings ? (
              <div className="rounded-2xl border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm font-bold leading-6 text-[var(--color-warning-strong)]">
                Solo el dueno de la cuenta puede prender o apagar el flujo de cocina de esta sucursal.
              </div>
            ) : null}
            <ModuleToggle
              disabled={!canManageOperationSettings}
              enabled={settings?.kitchenEnabled ?? true}
              label="Usar flujo de cocina/preparacion"
              name="kitchenEnabled"
            />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
                <p className="font-black text-[var(--color-heading)]">Encendido</p>
                <p className="mt-1">Los pedidos aprobados pasan por cocina o preparacion antes de quedar listos para caja/despacho.</p>
              </div>
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
                <p className="font-black text-[var(--color-heading)]">Apagado</p>
                <p className="mt-1">Ideal para heladeria, galleteria o tienda: caja aprueba/cobra y el pedido queda listo sin tablero de cocina.</p>
              </div>
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Estado actual" description="Resumen rapido de como operara esta sucursal." />
            <InfoMetric label="Cocina" value={(settings?.kitchenEnabled ?? true) ? "Activa" : "Sin cocina"} />
            <InfoMetric label="Caja" value={(settings?.cashEnabled ?? true) ? "Activa" : "Inactiva"} />
            <InfoMetric label="Inventario" value={(settings?.inventoryEnabled ?? true) ? "Activo" : "Inactivo"} />
            <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
              Este cambio afecta caja, pedidos y cocina. No borra pedidos ni productos; solo cambia el flujo operativo.
            </div>
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "notificaciones" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card className="grid gap-4">
            <SectionTitle title="Sonido de pedidos" description="Activa el aviso sonoro de pedidos nuevos en este navegador." />
            <OrderNotificationSoundSettings restaurantId={restaurant.id} />
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Estado actual" description="El sonido se guarda por sucursal y dispositivo." />
            <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
              El audio solo se dispara cuando llega un pedido nuevo pendiente. Al abrir la notificacion o entrar a revisar pedidos, se detiene.
            </div>
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "horarios" ? "block" : "hidden")}>
        <Card>
          <SectionTitle title="Horarios" description="Horario operativo asociado al restaurante." />
          <div className="mt-4 grid gap-3">
            {days.map((day, dayOfWeek) => {
              const hour = hoursByDay.get(dayOfWeek);

              return <BusinessHourEditorRow day={day} dayOfWeek={dayOfWeek} hour={hour} key={day} />;
            })}
          </div>
        </Card>
      </div>

      <div className={cn(activeTab === "avisos" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <div className="space-y-6">
            <Card className="grid gap-4 md:grid-cols-2">
              <SectionTitle title="Cerrar temporalmente" description="Para feriados, mantenimiento, remodelacion o falta de stock." />
              <div className="md:col-span-2 rounded-2xl bg-[var(--color-warning-soft)] p-4 text-sm font-semibold leading-6 text-[var(--color-warning-strong)]">
                El restaurante seguira visible en el home, pero aparecera como cerrado y no permitira pedidos mientras el cierre este activo.
              </div>
              <Input defaultValue="Cerrado por hoy" name="closureTitle" placeholder="Titulo del cierre" />
              <Input defaultValue={endOfTodayInputValue} name="closurePreviewEndsAt" readOnly type="datetime-local" />
              <Textarea className="md:col-span-2" defaultValue="No recibiremos pedidos hasta el proximo horario disponible." name="closureBody" placeholder="Mensaje para clientes" />
              <div className="md:col-span-2 flex justify-end">
                <SettingsSubmitButton name="settingsIntent" pendingLabel="Publicando cierre..." value="close-today">
                  <Power className="h-4 w-4" />
                  Cerrar por hoy
                </SettingsSubmitButton>
              </div>
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
              <SectionTitle title="Comunicado programado" description="Publica una alerta por rango de fechas con imagen opcional." />
              <div className="md:col-span-2" />
              <Select defaultValue="announcement" name="announcementType">
                <option value="announcement">Comunicado informativo</option>
                <option value="closure">Cierre temporal</option>
              </Select>
              <Input name="announcementTitle" placeholder="Ej: Cerrado por remodelacion" />
              <Input defaultValue={nowInputValue} name="announcementStartsAt" type="datetime-local" />
              <Input name="announcementEndsAt" type="datetime-local" />
              <Textarea className="md:col-span-2" name="announcementBody" placeholder="Detalle visible para los clientes" />
              <div className="md:col-span-2">
                <CompressedImageInput help="Opcional. Recomendado: 1200 x 700 px, sin texto pequeno." label="Imagen del comunicado" name="announcementImageFile" />
              </div>
              <div className="md:col-span-2 flex justify-end">
                <SettingsSubmitButton name="settingsIntent" pendingLabel="Publicando aviso..." value="create-announcement">
                  <Megaphone className="h-4 w-4" />
                  Publicar aviso
                </SettingsSubmitButton>
              </div>
            </Card>
          </div>

          <Card className="space-y-4">
            <SectionTitle title="Avisos recientes" description="Se muestran en el menu publico y en el directorio si estan vigentes." />
            {announcements.length ? (
              <div className="space-y-3">
                {announcements.map((announcement) => (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3" key={announcement.id}>
                    {announcement.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img alt={announcement.title} className="mb-3 h-28 w-full rounded-xl object-cover" src={announcement.imageUrl} />
                    ) : null}
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-1 text-xs font-black",
                            announcement.type === "closure" ? "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]" : "bg-[var(--primary-light)] text-[var(--primary)]",
                          )}
                        >
                          {announcement.type === "closure" ? "Cierre" : "Comunicado"}
                        </span>
                        <h3 className="mt-2 line-clamp-2 text-sm font-black text-[var(--color-heading)]">{announcement.title}</h3>
                        <p className="mt-1 line-clamp-2 text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">{announcement.body || "Sin detalle adicional."}</p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full px-2 py-1 text-[10px] font-black",
                          announcement.isActive ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]",
                        )}
                      >
                        {announcement.isActive ? "Activo" : "Inactivo"}
                      </span>
                    </div>
                    <p className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-secondary-text)]">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {formatDateTime(announcement.startsAt)} - {announcement.endsAt ? formatDateTime(announcement.endsAt) : "sin fin"}
                    </p>
                    <details className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
                      <summary className="cursor-pointer text-sm font-black text-[var(--primary)]">Editar aviso</summary>
                      <div className="mt-3 grid gap-3">
                        <Select defaultValue={announcement.type} name={`announcementType_${announcement.id}`}>
                          <option value="announcement">Comunicado informativo</option>
                          <option value="closure">Cierre temporal</option>
                        </Select>
                        <Input defaultValue={announcement.title} name={`announcementTitle_${announcement.id}`} placeholder="Titulo del aviso" />
                        <Textarea defaultValue={announcement.body} name={`announcementBody_${announcement.id}`} placeholder="Detalle visible para clientes" />
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Input defaultValue={toDateTimeLocalInput(new Date(announcement.startsAt))} name={`announcementStartsAt_${announcement.id}`} type="datetime-local" />
                          <Input defaultValue={announcement.endsAt ? toDateTimeLocalInput(new Date(announcement.endsAt)) : ""} name={`announcementEndsAt_${announcement.id}`} type="datetime-local" />
                        </div>
                        <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm font-semibold text-[var(--color-body)]">
                          Aviso activo
                          <input defaultChecked={announcement.isActive} name={`announcementIsActive_${announcement.id}`} type="checkbox" />
                        </label>
                        <CompressedImageInput help="Opcional. Si no subes imagen nueva, se conserva la actual." label="Cambiar imagen" name={`announcementImageFile_${announcement.id}`} />
                        <SettingsSubmitButton className="w-full" name="settingsIntent" pendingLabel="Guardando aviso..." value={`update-announcement:${announcement.id}`} variant="secondary">
                          Guardar cambios
                        </SettingsSubmitButton>
                      </div>
                    </details>
                    {announcement.isActive ? (
                      <SettingsSubmitButton className="mt-3 w-full" name="settingsIntent" pendingLabel="Desactivando..." value={`deactivate-announcement:${announcement.id}`} variant="secondary">
                        Desactivar aviso
                      </SettingsSubmitButton>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-secondary-text)]">Todavia no hay avisos publicados para este restaurante.</div>
            )}
          </Card>
        </div>
      </div>

      {showStickySave ? (
        <div className="sticky bottom-4 z-10 flex justify-end">
          <SettingsSubmitButton pendingLabel="Guardando configuracion...">Guardar configuracion</SettingsSubmitButton>
        </div>
      ) : null}
    </form>
  );
}

function SettingsSubmitButton({
  children,
  disabled,
  pendingLabel = "Guardando...",
  variant = "primary",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  pendingLabel?: string;
  variant?: "primary" | "secondary" | "ghost" | "danger";
}) {
  const { pending } = useFormStatus();

  return (
    <Button disabled={pending || disabled} type="submit" variant={variant} {...props}>
      {pending ? pendingLabel : children}
    </Button>
  );
}

function OrderNotificationSoundSettings({ restaurantId }: { restaurantId: string }) {
  const [enabled, setEnabled] = useState(() => readOrderAlertSoundEnabled(restaurantId));
  const [blocked, setBlocked] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  function ensureAudio() {
    if (!audioRef.current) {
      audioRef.current = new Audio(ORDER_ALERT_AUDIO_SRC);
      audioRef.current.loop = false;
      audioRef.current.preload = "auto";
      audioRef.current.volume = 0.78;
    }

    return audioRef.current;
  }

  useEffect(() => {
    const syncSoundPreference = (event: Event) => {
      const detail = (event as CustomEvent<{ restaurantId?: string; enabled?: boolean }>).detail;
      if (detail?.restaurantId !== restaurantId || typeof detail.enabled !== "boolean") {
        return;
      }

      setEnabled(detail.enabled);
      if (!detail.enabled) {
        setBlocked(false);
      }
    };

    window.addEventListener(ORDER_ALERT_SOUND_CHANGE_EVENT, syncSoundPreference);
    return () => window.removeEventListener(ORDER_ALERT_SOUND_CHANGE_EVENT, syncSoundPreference);
  }, [restaurantId]);

  async function enableSound() {
    const audio = ensureAudio();
    const previousVolume = audio.volume;

    audio.pause();
    audio.currentTime = 0;
    audio.volume = 0;

    try {
      await audio.play();
      audio.pause();
      audio.currentTime = 0;
      audio.volume = previousVolume;
      writeOrderAlertSoundEnabled(restaurantId, true);
      setBlocked(false);
    } catch {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = previousVolume;
      writeOrderAlertSoundEnabled(restaurantId, false);
      setBlocked(true);
    }
  }

  function disableSound() {
    const audio = audioRef.current;
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }

    writeOrderAlertSoundEnabled(restaurantId, false);
    setBlocked(false);
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 rounded-2xl border border-[var(--border)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="text-sm font-black text-[var(--color-heading)]">Aviso sonoro de pedidos nuevos</p>
          <p className="mt-1 text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">
            {enabled ? "Activo en este navegador." : blocked ? "El navegador no permitio activar el audio. Vuelve a tocar activar." : "Desactivado en este navegador."}
          </p>
        </div>
        {enabled ? (
          <button className={buttonClasses("secondary", "shrink-0")} onClick={disableSound} type="button">
            <VolumeX className="h-4 w-4" />
            Desactivar sonido
          </button>
        ) : (
          <button className={buttonClasses("primary", "shrink-0")} onClick={enableSound} type="button">
            <Volume2 className="h-4 w-4" />
            Activar sonido
          </button>
        )}
      </div>
      <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
        No se reproduce una prueba audible al activarlo. El proximo pedido nuevo hara sonar el audio completo una sola vez.
      </div>
    </div>
  );
}

function PrintConnectorSettingsCard({
  connector,
  restaurant,
}: {
  connector: RestaurantPrintConnector | null;
  restaurant: Restaurant;
}) {
  const connectorIsOnline = connector?.status === "linked";
  const statusLabel = connectorIsOnline ? "Conector en linea" : connector ? (connector.status === "linked" ? "Conector vinculado" : "Token activo") : "Sin vincular";
  const statusClassName = connectorIsOnline || connector?.status === "linked"
    ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
    : connector
      ? "bg-[var(--color-info-soft)] text-[var(--color-info-strong)]"
      : "bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]";
  const panelUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000";

  async function copyPairingPayload() {
    if (!connector || !navigator.clipboard) {
      return;
    }

    const runtimePanelUrl = window.location.origin || panelUrl;
    const runtimeBootstrapUrl = `${runtimePanelUrl}/api/print-connector/bootstrap`;
    await navigator.clipboard.writeText(
      [
        `panelUrl=${runtimePanelUrl}`,
        `bootstrapUrl=${runtimeBootstrapUrl}`,
        `restaurantId=${restaurant.id}`,
        `restaurantName=${restaurant.name}`,
        `token=${connector.token}`,
      ].join("\n"),
    );
  }

  return (
    <Card className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="grid gap-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <SectionTitle
            title="Impresion directa Windows"
            description="Permite imprimir automaticamente al aprobar pedidos usando un conector local .exe."
          />
          <span className={cn("inline-flex w-fit items-center gap-2 rounded-full px-3 py-1.5 text-xs font-black", statusClassName)}>
            <Link2 className="h-3.5 w-3.5" />
            {statusLabel}
          </span>
        </div>

        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label className="space-y-2">
            <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">Token o codigo de vinculacion</span>
            <Input
              aria-label="Token o codigo de vinculacion para el conector Windows"
              className="font-mono text-xs"
              readOnly
              value={connector?.token ?? "Sin token generado"}
            />
          </label>
          <div className="flex flex-col justify-end gap-2 sm:flex-row md:flex-col">
            <SettingsSubmitButton name="settingsIntent" pendingLabel="Generando..." value="generate-print-connector-token" variant={connector ? "secondary" : "primary"}>
              <KeyRound className="h-4 w-4" />
              {connector ? "Regenerar token" : "Generar token"}
            </SettingsSubmitButton>
            {connector ? (
              <SettingsSubmitButton name="settingsIntent" pendingLabel="Revocando..." value="revoke-print-connector-token" variant="danger">
                <Unlink className="h-4 w-4" />
                Revocar token
              </SettingsSubmitButton>
            ) : null}
          </div>
        </div>

        <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
          El formato, logo y reglas de impresion se siguen configurando aqui en la web.
        </div>

        {connector ? (
          <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm font-black text-[var(--color-heading)]">Datos para copiar al conector</p>
              <button className={buttonClasses("secondary", "shrink-0")} onClick={copyPairingPayload} type="button">
                <Copy className="h-4 w-4" />
                Copiar datos
              </button>
            </div>
            <div className="grid gap-2 text-xs font-semibold leading-5 text-[var(--color-secondary-text)]">
              <p>
                URL panel: <span className="font-mono text-[var(--color-heading)]">{panelUrl}</span>
              </p>
              <p>
                Restaurante ID: <span className="font-mono text-[var(--color-heading)]">{restaurant.id}</span>
              </p>
              <p>
                Sucursal: <span className="font-mono text-[var(--color-heading)]">{restaurant.name}</span>
              </p>
              <p>
                Token: <span className="break-all font-mono text-[var(--color-heading)]">{connector.token}</span>
              </p>
            </div>
          </div>
        ) : null}
      </div>

      <div className="space-y-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold leading-6 text-[var(--color-body)]">
        <p className="font-black text-[var(--color-heading)]">Conector local</p>
        <p>Instala el conector en la computadora Windows conectada a la impresora y pegale el token de vinculacion.</p>
        <Link className={buttonClasses("primary", "w-full")} href="/api/print-connector/windows/download">
          <Download className="h-4 w-4" />
          Descargar conector
        </Link>
      </div>
    </Card>
  );
}

function SettingsSavingOverlay() {
  const { pending } = useFormStatus();

  if (!pending) {
    return null;
  }

  return <BrandLoadingOverlay title="Guardando cambios" description="Aplicando configuracion." zIndexClassName="z-50" />;
}

function SettingsSavedModal({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 px-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Cambios guardados">
      <div className="w-full max-w-sm rounded-[1.35rem] border border-[var(--border)] bg-[var(--surface)] p-6 text-center shadow-[var(--shadow-panel)]">
        <div
          className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
          style={{ animation: "settings-check-pop 420ms cubic-bezier(0.2, 0.9, 0.2, 1) both" }}
        >
          <CheckCircle2 className="h-9 w-9" />
        </div>
        <h2 className="mt-4 text-xl font-black text-[var(--color-heading)]">Cambios guardados</h2>
        <p className="mt-2 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">{message}</p>
        <button
          className="mt-5 inline-flex min-h-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] px-5 text-sm font-black text-[var(--text)] shadow-sm transition hover:bg-[var(--primary-light)]"
          onClick={onClose}
          type="button"
        >
          Entendido
        </button>
      </div>
    </div>
  );
}

function Banner({ children, tone }: { children: string; tone: "success" | "danger" }) {
  const className =
    tone === "success"
      ? "rounded-2xl bg-[var(--color-success-soft)] p-3 text-sm font-bold text-[var(--color-success-strong)]"
      : "rounded-2xl bg-[var(--color-danger-soft)] p-3 text-sm font-bold text-[var(--color-danger-strong)]";

  return <div className={className}>{children}</div>;
}

function InfoMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{label}</p>
      <p className="mt-2 text-sm font-black text-[var(--color-heading)]">{value}</p>
    </div>
  );
}

function FieldSelect({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--muted)]">{label}</p>
      {children}
    </div>
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
      <p className="text-sm font-black text-[var(--color-body)]">{label}</p>
      <div className={cn("overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--color-surface)]", square ? "aspect-square max-w-[180px]" : "aspect-[16/9]")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={title} className="h-full w-full object-cover" src={url} />
        ) : (
          <div className="grid h-full w-full place-items-center p-4 text-center text-sm font-semibold text-[var(--color-secondary-text)]">
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
