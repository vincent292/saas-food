"use client";

import Link from "next/link";
import {
  CalendarClock,
  CheckCircle2,
  Clock3,
  CreditCard,
  Filter,
  ImageIcon,
  Bike,
  Megaphone,
  MapPin,
  Power,
  Printer,
  ReceiptText,
  RotateCcw,
  Store,
  UserRound,
} from "lucide-react";
import { useEffect, useMemo, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
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
  businessCatalogLabelTitle,
  categoriesForBusinessType,
  restaurantBusinessTypeOptions,
  restaurantLocationOptions,
} from "@/lib/restaurant-directory-options";
import { cn } from "@/lib/utils/cn";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type {
  BusinessHour,
  OwnerChangePolicy,
  Restaurant,
  RestaurantDeliveryZone,
  RestaurantAnnouncement,
  RestaurantOwnerChangeRequest,
  RestaurantSettings,
} from "@/types/restaurant.types";
import type { Order } from "@/types/order.types";

const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

const tabs = [
  { key: "general", label: "General", icon: Store },
  { key: "estilo", label: "Imagenes", icon: ImageIcon },
  { key: "pagos", label: "Pagos", icon: CreditCard },
  { key: "facturas", label: "Facturas", icon: ReceiptText },
  { key: "impresion", label: "Impresion", icon: Printer },
  { key: "ubicacion", label: "Ubicacion", icon: MapPin },
  { key: "delivery", label: "Delivery", icon: Bike },
  { key: "horarios", label: "Horarios", icon: Clock3 },
  { key: "avisos", label: "Avisos", icon: Megaphone },
  { key: "responsable", label: "Responsable", icon: UserRound },
] as const;

const saveableTabs = new Set<(typeof tabs)[number]["key"]>(["general", "estilo", "pagos", "impresion", "ubicacion", "delivery", "horarios"]);

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para completar esta operacion.",
  "owner-email-required": "Debes indicar un correo para actualizar el acceso principal.",
  "owner-not-found": "No se pudo encontrar o crear el usuario responsable.",
  "restaurant-not-found": "No se encontro el restaurante para guardar la configuracion.",
  "admin-required": "Solo el responsable principal o superadmin puede guardar esta configuracion.",
  "owner-required": "Solo el dueno de la cuenta puede cambiar esta configuracion sensible.",
  "superadmin-required": "Solo superadmin puede cambiar esta configuracion sensible.",
  "invalid-owner-request": "Revisa el nombre y correo del nuevo responsable.",
  "owner-change-pending": "Ya existe una solicitud pendiente de cambio de responsable.",
  "owner-change-cooldown": "Todavia no se puede pedir otro cambio de responsable por la ventana de seguridad.",
  "invalid-owner-resolution": "No se pudo resolver la solicitud de cambio de responsable.",
  "owner-request-missing": "La solicitud ya no existe o ya fue resuelta.",
  "invalid-zone": "Revisa los datos de la zona de delivery.",
  "invalid-invoice": "No se pudo marcar la factura.",
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

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function ownerRequestStatusLabel(status: RestaurantOwnerChangeRequest["status"]) {
  switch (status) {
    case "approved":
      return "Aprobada";
    case "rejected":
      return "Rechazada";
    case "cancelled":
      return "Cancelada";
    default:
      return "Pendiente";
  }
}

function ownerRequestStatusClass(status: RestaurantOwnerChangeRequest["status"]) {
  switch (status) {
    case "approved":
      return "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]";
    case "rejected":
      return "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]";
    case "cancelled":
      return "bg-[var(--color-neutral-100)] text-[var(--color-secondary-text)]";
    default:
      return "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";
  }
}

function ownerPolicyMessage(policy: OwnerChangePolicy) {
  if (policy.canRequestNow) {
    return policy.approvedCount === 0
      ? "Aun no hubo cambios aprobados, asi que la primera solicitud puede enviarse de inmediato."
      : `Ya hubo ${policy.approvedCount} cambio${policy.approvedCount === 1 ? "" : "s"} aprobado${policy.approvedCount === 1 ? "" : "s"}. La siguiente solicitud ya esta habilitada.`;
  }

  if (policy.nextAllowedAt) {
    return `La siguiente solicitud podra enviarse desde ${formatDateTime(policy.nextAllowedAt)}.`;
  }

  return "Hay una solicitud pendiente o una ventana de seguridad activa.";
}

function savedMessage({
  saved,
  announcementCreated,
  closureCreated,
  announcementDisabled,
  ownerRequest,
  ownerApproved,
  ownerRejected,
  zoneSaved,
  invoiceMarked,
}: {
  saved?: string;
  announcementCreated?: string;
  closureCreated?: string;
  announcementDisabled?: string;
  ownerRequest?: string;
  ownerApproved?: string;
  ownerRejected?: string;
  zoneSaved?: string;
  invoiceMarked?: string;
}) {
  if (saved) return "Configuracion general guardada.";
  if (announcementCreated === "updated") return "Aviso actualizado.";
  if (announcementCreated) return "Comunicado publicado.";
  if (closureCreated) return "Cierre temporal publicado para hoy.";
  if (announcementDisabled) return "Aviso desactivado.";
  if (ownerRequest) return "Solicitud de cambio de responsable enviada.";
  if (ownerApproved) return "Cambio de responsable aprobado.";
  if (ownerRejected) return "Solicitud de responsable rechazada.";
  if (zoneSaved) return "Zona de delivery actualizada.";
  if (invoiceMarked) return "Factura marcada como emitida.";
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
  ownerRequest,
  ownerApproved,
  ownerRejected,
  zoneSaved,
  invoiceMarked,
  deliveryZones,
  invoiceRequests,
  initialTab,
  canManagePlan,
  canManageDeliverySettings,
  canManagePayments,
  invoiceFilters,
  ownerChangePolicy,
  ownerChangeRequests,
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
  ownerRequest?: string;
  ownerApproved?: string;
  ownerRejected?: string;
  zoneSaved?: string;
  invoiceMarked?: string;
  deliveryZones: RestaurantDeliveryZone[];
  invoiceRequests: Order[];
  initialTab?: string;
  canManagePlan: boolean;
  canManageDeliverySettings: boolean;
  canManagePayments: boolean;
  invoiceFilters: {
    dateFrom: string;
    dateTo: string;
    status: "all" | "pending" | "issued";
  };
  ownerChangePolicy: OwnerChangePolicy;
  ownerChangeRequests: RestaurantOwnerChangeRequest[];
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => normalizeTab(initialTab));
  const [invoiceDateFromFilter, setInvoiceDateFromFilter] = useState(invoiceFilters.dateFrom);
  const [invoiceDateToFilter, setInvoiceDateToFilter] = useState(invoiceFilters.dateTo);
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState(invoiceFilters.status);
  const successMessage = savedMessage({
    saved,
    announcementCreated,
    closureCreated,
    announcementDisabled,
    ownerRequest,
    ownerApproved,
    ownerRejected,
    zoneSaved,
    invoiceMarked,
  });
  const [showSuccessModal, setShowSuccessModal] = useState(Boolean(successMessage));

  const pendingOwnerRequest = useMemo(() => ownerChangeRequests.find((request) => request.status === "pending") ?? null, [ownerChangeRequests]);
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
    (activeTab !== "delivery" || canManageDeliverySettings);
  const showStickySave = canSaveActiveTab;
  const invoiceFilterHref = useMemo(() => {
    const params = new URLSearchParams({ tab: "facturas" });
    if (invoiceDateFromFilter) params.set("invoiceFrom", invoiceDateFromFilter);
    if (invoiceDateToFilter) params.set("invoiceTo", invoiceDateToFilter);
    if (invoiceStatusFilter !== "all") params.set("invoiceStatus", invoiceStatusFilter);
    return `/admin/restaurantes/${restaurant.id}/configuracion?${params.toString()}`;
  }, [invoiceDateFromFilter, invoiceDateToFilter, invoiceStatusFilter, restaurant.id]);
  const invoiceResetHref = `/admin/restaurantes/${restaurant.id}/configuracion?tab=facturas`;

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
      {moduleReadState.kitchenEnabled ? <input name="kitchenEnabled" type="hidden" value="on" /> : null}

      {saved ? <Banner tone="success">Configuracion general guardada.</Banner> : null}
      {announcementCreated ? <Banner tone="success">{announcementCreated === "updated" ? "Aviso actualizado." : "Comunicado publicado."}</Banner> : null}
      {closureCreated ? <Banner tone="success">Cierre temporal publicado para hoy.</Banner> : null}
      {announcementDisabled ? <Banner tone="success">Aviso desactivado.</Banner> : null}
      {ownerRequest ? <Banner tone="success">Solicitud de cambio de responsable enviada.</Banner> : null}
      {ownerApproved ? <Banner tone="success">Solicitud aprobada. El acceso principal ya fue actualizado.</Banner> : null}
      {ownerRejected ? <Banner tone="success">Solicitud rechazada.</Banner> : null}
      {zoneSaved ? <Banner tone="success">Zona de delivery actualizada.</Banner> : null}
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
        <Card className="grid gap-4 md:grid-cols-2">
          <SectionTitle title="Impresion" description="Tamano y formato por defecto para pedidos de caja y cocina." />
          <div className="md:col-span-2" />
          <Select defaultValue={settings?.printFormat ?? "thermal_80"} name="printFormat">
            <option value="thermal_58">Ticket termico 58 mm</option>
            <option value="thermal_80">Ticket termico 80 mm</option>
            <option value="large">Hoja normal / formato grande</option>
          </Select>
          <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
            Usa 58/80 mm para impresora termica y hoja normal para impresion A4 o carta.
          </div>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm font-semibold text-[var(--color-body)]">
            Imprimir automaticamente en cocina
            <input defaultChecked={settings?.autoPrintKitchen ?? false} name="autoPrintKitchen" type="checkbox" />
          </label>
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] p-4 text-sm font-semibold text-[var(--color-body)]">
            Mostrar logo en ticket
            <input defaultChecked={settings?.printLogo ?? true} name="printLogo" type="checkbox" />
          </label>
        </Card>
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

      <div className={cn(activeTab === "horarios" ? "block" : "hidden")}>
        <Card>
          <SectionTitle title="Horarios" description="Horario operativo asociado al restaurante." />
          <div className="mt-4 grid gap-3">
            {days.map((day, dayOfWeek) => {
              const hour = hoursByDay.get(dayOfWeek);

              return (
                <div className="grid gap-3 rounded-2xl border border-[var(--border)] p-3 md:grid-cols-[140px_1fr_1fr_120px]" key={day}>
                  <p className="font-bold text-[var(--color-heading)]">{day}</p>
                  <Input defaultValue={hour?.opensAt || "09:00"} name={`day_${dayOfWeek}_opensAt`} type="time" />
                  <Input defaultValue={hour?.closesAt || "22:00"} name={`day_${dayOfWeek}_closesAt`} type="time" />
                  <label className="flex items-center gap-2 text-sm font-semibold text-[var(--color-body)]">
                    <input defaultChecked={hour?.isClosed ?? false} name={`day_${dayOfWeek}_isClosed`} type="checkbox" />
                    Cerrado
                  </label>
                </div>
              );
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

      <div className={cn(activeTab === "responsable" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card className="space-y-4">
              <SectionTitle title="Responsable actual" description="Referencia rapida del acceso principal asignado hoy." />
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">Nombre</p>
                <p className="mt-1 text-lg font-black text-[var(--color-heading)]">{restaurant.ownerName || "Sin responsable"}</p>
                <p className="mt-4 text-xs font-black uppercase text-[var(--color-secondary-text)]">Correo</p>
                <p className="mt-1 break-all text-lg font-black text-[var(--color-heading)]">{restaurant.ownerEmail || "Sin correo"}</p>
              </div>
            </Card>

            <Card className="grid gap-4 md:grid-cols-2">
              <SectionTitle title="Solicitar cambio" description="El cambio ya no se hace directo desde el restaurante: queda como solicitud con aprobacion." />
              <div className="md:col-span-2 rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                <p>{ownerPolicyMessage(ownerChangePolicy)}</p>
                <p className="mt-2">Escala de espera: primera vez inmediata, segunda 3 dias, tercera 1 semana y luego 1 mes adicional por cada cambio aprobado.</p>
              </div>
              <Input defaultValue="" name="requestedOwnerName" placeholder="Nombre del nuevo responsable" />
              <Input defaultValue="" name="requestedOwnerEmail" placeholder="correo@restaurante.com" type="email" />
              <Textarea className="md:col-span-2" defaultValue="" name="ownerChangeReason" placeholder="Motivo del cambio o contexto para validacion" />
              {pendingOwnerRequest ? (
                <div className="md:col-span-2 rounded-2xl bg-[var(--color-warning-soft)] p-4 text-sm font-semibold text-[var(--color-warning-strong)]">
                  Ya hay una solicitud pendiente para {pendingOwnerRequest.requestedOwnerName} ({pendingOwnerRequest.requestedOwnerEmail}).
                </div>
              ) : null}
              <div className="md:col-span-2 flex justify-end">
                <SettingsSubmitButton disabled={!ownerChangePolicy.canRequestNow || Boolean(pendingOwnerRequest)} name="settingsIntent" pendingLabel="Enviando solicitud..." value="create-owner-request">
                  <UserRound className="h-4 w-4" />
                  Enviar solicitud
                </SettingsSubmitButton>
              </div>
            </Card>

            {canManagePlan && pendingOwnerRequest ? (
              <Card className="grid gap-4 md:grid-cols-2">
                <SectionTitle title="Resolver solicitud pendiente" description="Solo superadmin puede aprobar o rechazar el cambio de responsable." />
                <div className="md:col-span-2" />
                <input name="requestId" type="hidden" value={pendingOwnerRequest.id} />
                <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                  <p>Solicita: {pendingOwnerRequest.requestedOwnerName}</p>
                  <p className="mt-2 break-all">Correo nuevo: {pendingOwnerRequest.requestedOwnerEmail}</p>
                  <p className="mt-2">Enviada: {formatDateTime(pendingOwnerRequest.createdAt)}</p>
                  {pendingOwnerRequest.reason ? <p className="mt-2">Motivo: {pendingOwnerRequest.reason}</p> : null}
                </div>
                <Textarea className="md:col-span-2" defaultValue={pendingOwnerRequest.resolutionNotes ?? ""} name="ownerResolutionNotes" placeholder="Notas internas de aprobacion o rechazo" />
                <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <SettingsSubmitButton name="settingsIntent" pendingLabel="Rechazando..." value="reject-owner-request" variant="secondary">
                    Rechazar solicitud
                  </SettingsSubmitButton>
                  <SettingsSubmitButton name="settingsIntent" pendingLabel="Aprobando..." value="approve-owner-request">
                    Aprobar cambio
                  </SettingsSubmitButton>
                </div>
              </Card>
            ) : null}
          </div>

          <Card className="space-y-4">
            <SectionTitle title="Historial" description="Bitacora de solicitudes de cambio del responsable principal." />
            {ownerChangeRequests.length ? (
              <div className="space-y-3">
                {ownerChangeRequests.map((request) => (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4" key={request.id}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-black text-[var(--color-heading)]">{request.requestedOwnerName}</p>
                        <p className="mt-1 break-all text-sm font-semibold text-[var(--color-secondary-text)]">{request.requestedOwnerEmail}</p>
                      </div>
                      <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black", ownerRequestStatusClass(request.status))}>{ownerRequestStatusLabel(request.status)}</span>
                    </div>
                    {request.currentOwnerEmail ? <p className="mt-3 text-xs font-semibold text-[var(--color-secondary-text)]">Desde: {request.currentOwnerEmail}</p> : null}
                    <p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">Enviada: {formatDateTime(request.createdAt)}</p>
                    {request.approvedAt ? <p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">Aprobada: {formatDateTime(request.approvedAt)}</p> : null}
                    {request.rejectedAt ? <p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">Rechazada: {formatDateTime(request.rejectedAt)}</p> : null}
                    {request.reason ? <p className="mt-3 text-sm font-semibold text-[var(--color-body)]">{request.reason}</p> : null}
                    {request.resolutionNotes ? <p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">Notas: {request.resolutionNotes}</p> : null}
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-secondary-text)]">Todavia no hay solicitudes registradas.</div>
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
