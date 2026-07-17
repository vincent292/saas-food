"use client";

import {
  CalendarClock,
  Clock3,
  CreditCard,
  ExternalLink,
  ImageIcon,
  Megaphone,
  MapPin,
  Power,
  Printer,
  Settings2,
  ShieldCheck,
  Store,
  Upload,
  UserRound,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import {
  approveOwnerChangeRequestAction,
  closeRestaurantTodayAction,
  createOwnerChangeRequestAction,
  deleteDeliveryZoneAction,
  createRestaurantAnnouncementAction,
  deactivateRestaurantAnnouncementAction,
  markPlatformPaymentPaidAction,
  rejectOwnerChangeRequestAction,
  saveDeliveryZoneAction,
  submitPlatformPaymentProofAction,
  toggleDeliveryZoneAction,
  updatePlatformBillingSettingsAction,
  updateRestaurantConfigurationAction,
  verifyPlatformPaymentProofAction,
} from "@/app/admin/actions";
import { GoogleLocationFields } from "@/components/location/GoogleLocationFields";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { ModuleToggle } from "@/components/settings/ModuleToggle";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Select, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import {
  businessCatalogLabelTitle,
  businessTypeSupportsKitchen,
  businessTypeSupportsTableQr,
  categoriesForBusinessType,
  restaurantBusinessTypeOptions,
  restaurantLocationOptions,
} from "@/lib/restaurant-directory-options";
import { cn } from "@/lib/utils/cn";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type {
  BusinessHour,
  ModuleKey,
  OwnerChangePolicy,
  PlatformBilling,
  Restaurant,
  RestaurantDeliveryZone,
  RestaurantAnnouncement,
  RestaurantOwnerChangeRequest,
  RestaurantSettings,
  SubscriptionPlan,
} from "@/types/restaurant.types";

const days = ["Domingo", "Lunes", "Martes", "Miercoles", "Jueves", "Viernes", "Sabado"];

const tabs = [
  { key: "general", label: "General", icon: Store },
  { key: "estilo", label: "Imagenes", icon: ImageIcon },
  { key: "pagos", label: "Pagos", icon: CreditCard },
  { key: "plataforma", label: "Plataforma", icon: ShieldCheck },
  { key: "operacion", label: "Operacion", icon: Settings2 },
  { key: "impresion", label: "Impresion", icon: Printer },
  { key: "ubicacion", label: "Ubicacion", icon: MapPin },
  { key: "horarios", label: "Horarios", icon: Clock3 },
  { key: "avisos", label: "Avisos", icon: Megaphone },
  { key: "responsable", label: "Responsable", icon: UserRound },
] as const;

const saveableTabs = new Set<(typeof tabs)[number]["key"]>(["general", "estilo", "pagos", "operacion", "impresion", "ubicacion", "horarios"]);

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos obligatorios.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para completar esta operacion.",
  "owner-email-required": "Debes indicar un correo para actualizar el acceso principal.",
  "owner-not-found": "No se pudo encontrar o crear el usuario responsable.",
  "restaurant-not-found": "No se encontro el restaurante para guardar la configuracion.",
  "admin-required": "Solo el responsable principal o superadmin puede guardar esta configuracion.",
  "superadmin-required": "Solo superadmin puede cambiar plan, modulos, estado o facturacion de plataforma.",
  "invalid-platform-billing": "Revisa la fecha de renovacion y los datos de la facturacion de plataforma.",
  "invalid-platform-proof": "No se pudo procesar el comprobante de plataforma.",
  "platform-billing-not-configured": "Aun no hay QR o fecha de renovacion configurados para la plataforma.",
  "platform-cycle-mismatch": "La fecha del ciclo ya cambio. Recarga la vista y vuelve a subir el comprobante.",
  "platform-proof-required": "Debes subir un comprobante para registrar el pago de plataforma.",
  "platform-cycle-paid": "Ese ciclo ya fue marcado como pagado.",
  "platform-proof-upload": "No se pudo subir el comprobante de plataforma.",
  "platform-proof-missing": "Todavia no hay comprobante cargado para verificar.",
  "platform-cycle-missing": "No se encontro el ciclo de facturacion a actualizar.",
  "invalid-platform-cycle": "No se pudo resolver el ciclo de pago de plataforma.",
  "invalid-owner-request": "Revisa el nombre y correo del nuevo responsable.",
  "owner-change-pending": "Ya existe una solicitud pendiente de cambio de responsable.",
  "owner-change-cooldown": "Todavia no se puede pedir otro cambio de responsable por la ventana de seguridad.",
  "invalid-owner-resolution": "No se pudo resolver la solicitud de cambio de responsable.",
  "owner-request-missing": "La solicitud ya no existe o ya fue resuelta.",
  "invalid-zone": "Revisa los datos de la zona de delivery.",
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

function toDateInput(date: Date) {
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 10);
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", {
    dateStyle: "medium",
  }).format(new Date(`${value}T00:00:00`));
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

function platformStateLabel(billing: PlatformBilling | null) {
  if (!billing) {
    return "Sin configurar";
  }
  if (billing.currentCycle?.paidAt) {
    return "Pagado";
  }
  if (billing.currentCycle?.proofVerifiedAt) {
    return "Verificado";
  }
  if (billing.currentCycle?.proofUploadedAt) {
    return "Comprobante subido";
  }
  if (billing.isOverdue) {
    return "Vencido";
  }
  return "Pendiente";
}

function billingCountdownLabel(billing: PlatformBilling | null) {
  if (!billing || billing.daysUntilDue === undefined) {
    return "Sin vencimiento definido";
  }
  if (billing.currentCycle?.paidAt) {
    return "Ciclo actual pagado";
  }
  if (billing.daysUntilDue < 0) {
    const overdueDays = Math.abs(billing.daysUntilDue);
    return overdueDays === 1 ? "Vencio hace 1 dia" : `Vencio hace ${overdueDays} dias`;
  }
  if (billing.daysUntilDue === 0) {
    return "Vence hoy";
  }
  return billing.daysUntilDue === 1 ? "Vence en 1 dia" : `Vence en ${billing.daysUntilDue} dias`;
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

export function RestaurantSettingsFormClient({
  restaurant,
  settings,
  businessHours,
  announcements,
  plans,
  billing,
  saved,
  error,
  announcementCreated,
  closureCreated,
  announcementDisabled,
  billingSaved,
  paymentUploaded,
  paymentVerified,
  paymentPaid,
  ownerRequest,
  ownerApproved,
  ownerRejected,
  zoneSaved,
  deliveryZones,
  initialTab,
  canManagePlan,
  ownerChangePolicy,
  ownerChangeRequests,
}: {
  restaurant: Restaurant;
  settings: RestaurantSettings | null;
  businessHours: BusinessHour[];
  announcements: RestaurantAnnouncement[];
  plans: SubscriptionPlan[];
  billing: PlatformBilling | null;
  saved?: string;
  error?: string;
  announcementCreated?: string;
  closureCreated?: string;
  announcementDisabled?: string;
  billingSaved?: string;
  paymentUploaded?: string;
  paymentVerified?: string;
  paymentPaid?: string;
  ownerRequest?: string;
  ownerApproved?: string;
  ownerRejected?: string;
  zoneSaved?: string;
  deliveryZones: RestaurantDeliveryZone[];
  initialTab?: string;
  canManagePlan: boolean;
  ownerChangePolicy: OwnerChangePolicy;
  ownerChangeRequests: RestaurantOwnerChangeRequest[];
}) {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => normalizeTab(initialTab));
  const [selectedPlanKey, setSelectedPlanKey] = useState(() => restaurant.planKey ?? plans[0]?.key ?? "basic");

  const selectedPlan = useMemo(() => plans.find((plan) => plan.key === selectedPlanKey), [plans, selectedPlanKey]);
  const planModules = useMemo(() => new Set<ModuleKey>(selectedPlan?.modules ?? []), [selectedPlan]);
  const pendingOwnerRequest = useMemo(() => ownerChangeRequests.find((request) => request.status === "pending") ?? null, [ownerChangeRequests]);
  const hoursByDay = new Map(businessHours.map((hour) => [hour.dayOfWeek, hour]));
  const logoIsImage = isImageUrl(restaurant.logoUrl);
  const bannerIsImage = isImageUrl(restaurant.bannerUrl);
  const qrIsImage = isImageUrl(settings?.qrPaymentUrl);
  const platformQrIsImage = isImageUrl(billing?.platformQrUrl);
  const canUseModule = (moduleKey: ModuleKey) => planModules.has(moduleKey);
  const nowInputValue = toDateTimeLocalInput(new Date());
  const endOfTodayInputValue = toDateTimeLocalInput(endOfToday());
  const defaultBillingDate = billing?.nextDueDate ?? toDateInput(new Date());
  const showStickySave = saveableTabs.has(activeTab);
  const catalogLabelTitle = businessCatalogLabelTitle(restaurant.businessType);
  const supportsKitchen = businessTypeSupportsKitchen(restaurant.businessType);
  const supportsTableQr = businessTypeSupportsTableQr(restaurant.businessType);

  return (
    <form action={updateRestaurantConfigurationAction} className="space-y-6">
      <input name="restaurantId" type="hidden" value={restaurant.id} />
      <input name="currentSlug" type="hidden" value={restaurant.slug} />
      <input name="restaurantSlug" type="hidden" value={restaurant.slug} />
      <input name="currentQrPaymentUrl" type="hidden" value={settings?.qrPaymentUrl ?? ""} />
      <input name="currentPlatformQrUrl" type="hidden" value={billing?.platformQrUrl ?? ""} />
      <input name="currentMenuBackgroundImageUrl" type="hidden" value={restaurant.menuBackgroundImageUrl} />
      <input name="tab" type="hidden" value={activeTab} />

      {saved ? <Banner tone="success">Configuracion general guardada.</Banner> : null}
      {announcementCreated ? <Banner tone="success">Comunicado publicado.</Banner> : null}
      {closureCreated ? <Banner tone="success">Cierre temporal publicado para hoy.</Banner> : null}
      {announcementDisabled ? <Banner tone="success">Aviso desactivado.</Banner> : null}
      {billingSaved ? <Banner tone="success">Facturacion de plataforma actualizada.</Banner> : null}
      {paymentUploaded ? <Banner tone="success">Comprobante de plataforma subido. Ahora queda pendiente de verificacion.</Banner> : null}
      {paymentVerified ? <Banner tone="success">Comprobante verificado por la plataforma.</Banner> : null}
      {paymentPaid ? <Banner tone="success">Pago confirmado. Si estaba suspendido por mora, el restaurante ya puede volver a operar.</Banner> : null}
      {ownerRequest ? <Banner tone="success">Solicitud de cambio de responsable enviada.</Banner> : null}
      {ownerApproved ? <Banner tone="success">Solicitud aprobada. El acceso principal ya fue actualizado.</Banner> : null}
      {ownerRejected ? <Banner tone="success">Solicitud rechazada.</Banner> : null}
      {zoneSaved ? <Banner tone="success">Zona de delivery actualizada.</Banner> : null}
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
            <Select defaultValue={restaurant.status} disabled={!canManagePlan} name="status">
              <option value="active">Activo</option>
              <option value="inactive">Inactivo</option>
              <option value="suspended">Suspendido</option>
            </Select>
            <Select
              disabled={!canManagePlan}
              name="planKey"
              onChange={(event) => setSelectedPlanKey(event.target.value as typeof selectedPlanKey)}
              value={selectedPlanKey}
            >
              {plans.map((plan) => (
                <option key={plan.key} value={plan.key}>
                  {plan.name} - Bs {plan.priceMonthly}/mes
                </option>
              ))}
            </Select>
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
              <ModuleToggle enabled={settings?.invoiceEnabled ?? false} label="Mostrar solicitud de factura en pedidos publicos" name="invoiceEnabled" />
            </div>
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
              <CompressedImageInput help="Recomendado: QR cuadrado, nitido y sin bordes cortados. Se subira como WebP." label="QR de pago" name="qrPaymentFile" previewClassName="aspect-square" />
            </div>
            <div className="md:col-span-2 rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
              Este QR se muestra en el pedido publico y en mesa para que el cliente pague y luego suba su comprobante.
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="QR actual" description="El equipo y los clientes veran este QR al elegir pago QR." />
            <PreviewMedia label="QR de pago" title="QR de pago" url={qrIsImage ? settings?.qrPaymentUrl ?? "" : ""} fallback="Sin QR" square />
          </Card>
        </div>
      </div>

      <div className={cn(activeTab === "plataforma" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            <Card className="space-y-5">
              <SectionTitle title="Cobro de plataforma" description="Renovacion mensual, control del comprobante y suspension automatica por mora." />
              <div className="grid gap-3 md:grid-cols-3">
                <InfoMetric label="Estado" value={platformStateLabel(billing)} />
                <InfoMetric label="Renovacion" value={billing ? formatDate(billing.nextDueDate) : "Sin fecha"} />
                <InfoMetric label="Seguimiento" value={billingCountdownLabel(billing)} />
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <BillingStep completed={Boolean(billing?.currentCycle?.proofUploadedAt)} detail={billing?.currentCycle?.proofUploadedAt ? formatDateTime(billing.currentCycle.proofUploadedAt) : "Sin carga"} label="Subido" />
                <BillingStep completed={Boolean(billing?.currentCycle?.proofVerifiedAt)} detail={billing?.currentCycle?.proofVerifiedAt ? formatDateTime(billing.currentCycle.proofVerifiedAt) : "Pendiente"} label="Verificado" />
                <BillingStep completed={Boolean(billing?.currentCycle?.paidAt)} detail={billing?.currentCycle?.paidAt ? formatDateTime(billing.currentCycle.paidAt) : "Pendiente"} label="Pagado" />
              </div>
              <div className={cn("rounded-2xl p-4 text-sm font-semibold", billing?.isSuspendedForBilling ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]" : "bg-[var(--color-surface)] text-[var(--color-body)]")}>
                {billing?.isSuspendedForBilling
                  ? "La plataforma esta suspendida por vencimiento. El restaurante conserva acceso a esta configuracion para subir el comprobante y esperar la validacion."
                  : "Cuatro dias antes del vencimiento aparece el aviso dentro del panel para que el restaurante suba el comprobante a tiempo."}
              </div>
            </Card>

            {canManagePlan ? (
              <Card className="grid gap-4 md:grid-cols-2">
                <SectionTitle title="Configurar facturacion" description="Solo superadmin define la fecha de renovacion, recordatorio y QR de la plataforma." />
                <div className="md:col-span-2" />
                <Input defaultValue={defaultBillingDate} name="platformNextDueDate" type="date" />
                <Input defaultValue={billing?.reminderDays ?? 4} max="15" min="0" name="platformReminderDays" placeholder="Dias de recordatorio" type="number" />
                <div className="md:col-span-2">
                  <CompressedImageInput help="Este QR es el que usa el restaurante para pagarte la mensualidad de la plataforma." label="QR de la plataforma" name="platformQrFile" previewClassName="aspect-square" />
                </div>
                <Textarea className="md:col-span-2" defaultValue={billing?.platformQrNote ?? ""} name="platformQrNote" placeholder="Indicaciones de pago, alias, cuenta o condiciones de validacion" />
                <div className="md:col-span-2 flex justify-end">
                  <Button formAction={updatePlatformBillingSettingsAction} type="submit">
                    <ShieldCheck className="h-4 w-4" />
                    Guardar facturacion
                  </Button>
                </div>
              </Card>
            ) : null}

            <Card className="grid gap-4 md:grid-cols-2">
              <SectionTitle title="Subir comprobante" description="El restaurante carga aqui la evidencia del pago mensual a la plataforma." />
              <div className="md:col-span-2 rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                {billing?.isConfigured
                  ? `Vencimiento actual: ${formatDate(billing.nextDueDate)}. Si el cliente no esta dentro del local, el sistema igual conserva su acceso a esta seccion para regularizar el pago.`
                  : "Aun falta que la plataforma configure la fecha de renovacion y el QR para poder subir un comprobante."}
              </div>
              <Input defaultValue={billing?.nextDueDate ?? ""} name="platformDueDate" readOnly type="date" />
              <Input defaultValue={billing?.planPriceMonthly ? `Bs ${billing.planPriceMonthly}` : "Segun plan"} disabled />
              <div className="md:col-span-2">
                <CompressedImageInput acceptPdf help="Puedes subir imagen o PDF del comprobante. Se guarda como evidencia del ciclo mensual." label="Comprobante de pago" name="platformPaymentProofFile" />
              </div>
              <Textarea className="md:col-span-2" defaultValue={billing?.currentCycle?.notes ?? ""} name="platformPaymentNotes" placeholder="Referencia, banco, numero de transaccion o detalle para validacion" />
              <div className="md:col-span-2 flex justify-end">
                <Button disabled={!billing?.isConfigured || Boolean(billing?.currentCycle?.paidAt)} formAction={submitPlatformPaymentProofAction} type="submit">
                  <Upload className="h-4 w-4" />
                  Subir comprobante
                </Button>
              </div>
            </Card>

            {canManagePlan && billing?.currentCycle ? (
              <Card className="grid gap-4 md:grid-cols-2">
                <SectionTitle title="Validar ciclo actual" description="Verificacion manual del comprobante y reactivacion despues del pago." />
                <div className="md:col-span-2" />
                <input name="cycleId" type="hidden" value={billing.currentCycle.id} />
                <div className="md:col-span-2 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                  <p>Ciclo: {formatDate(billing.currentCycle.dueDate)}</p>
                  <p className="mt-2">Estado actual: {platformStateLabel(billing)}</p>
                  {billing.currentCycle.proofUrl ? (
                    <a className="mt-3 inline-flex items-center gap-2 font-black text-[var(--primary)]" href={billing.currentCycle.proofUrl} rel="noreferrer" target="_blank">
                      Abrir comprobante
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  ) : (
                    <p className="mt-2 text-[var(--color-secondary-text)]">Aun no hay comprobante para revisar.</p>
                  )}
                </div>
                <Textarea className="md:col-span-2" defaultValue={billing.currentCycle.notes ?? ""} name="platformResolutionNotes" placeholder="Notas internas de verificacion o confirmacion de pago" />
                <div className="md:col-span-2 flex flex-col gap-3 sm:flex-row sm:justify-end">
                  <Button disabled={!billing.currentCycle.proofUrl || Boolean(billing.currentCycle.proofVerifiedAt)} formAction={verifyPlatformPaymentProofAction} type="submit" variant="secondary">
                    Verificar comprobante
                  </Button>
                  <Button disabled={!billing.currentCycle.proofUrl || Boolean(billing.currentCycle.paidAt)} formAction={markPlatformPaymentPaidAction} type="submit">
                    Marcar como pagado
                  </Button>
                </div>
              </Card>
            ) : null}
          </div>

          <div className="space-y-6">
            <Card className="space-y-4">
              <SectionTitle title="QR de la plataforma" description="El restaurante usa este QR para pagar su mensualidad." />
              <PreviewMedia label="QR" title="QR de la plataforma" url={platformQrIsImage ? billing?.platformQrUrl ?? "" : ""} fallback="Sin QR" square />
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                {billing?.platformQrNote || "Sin instrucciones adicionales todavia."}
              </div>
            </Card>

            <Card className="space-y-4">
              <SectionTitle title="Regla de suspension" description="Como se comporta el panel cuando se vence la renovacion." />
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                <p>1. Cuatro dias antes del vencimiento aparece una alerta modal.</p>
                <p className="mt-2">2. Si no hay pago al llegar la fecha, el restaurante pasa a suspendido.</p>
                <p className="mt-2">3. Los modulos operativos se bloquean hasta que superadmin verifique y marque el ciclo como pagado.</p>
              </div>
            </Card>
          </div>
        </div>
      </div>

      <div className={cn(activeTab === "operacion" ? "block" : "hidden")}>
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <Card>
            <SectionTitle title="Modulos" description="El plan define el techo funcional, y solo superadmin puede activar o desactivar cada modulo." />
            <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4">
              <p className="text-sm font-black text-[var(--color-heading)]">{selectedPlan?.name ?? "Sin plan"}</p>
              <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">{selectedPlan?.description ?? "Selecciona un plan activo."}</p>
              <p className="mt-2 text-xs font-black uppercase text-[var(--color-success-strong)]">{selectedPlan?.modules.length ?? 0} modulos incluidos</p>
            </div>
            {!supportsKitchen || !supportsTableQr ? (
              <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                Este rubro usa catalogo, POS, delivery y seguimiento de pedidos. Mesas QR y cocina solo se habilitan para negocios gastronomicos.
              </div>
            ) : null}
            <div className="mt-4 space-y-3">
              <ModuleToggle disabled={!canManagePlan} enabled={settings?.deliveryEnabled ?? true} label="Envio a domicilio" name="deliveryEnabled" />
              <ModuleToggle disabled={!canManagePlan} enabled={settings?.pickupEnabled ?? true} label="Recojo" name="pickupEnabled" />
              <ModuleToggle
                disabled={!canManagePlan || !canUseModule("table_qr") || !supportsTableQr}
                enabled={(settings?.tableOrdersEnabled ?? true) && canUseModule("table_qr") && supportsTableQr}
                key={`table_qr-${selectedPlanKey}`}
                label="Pedidos en mesa"
                name="tableOrdersEnabled"
              />
              <ModuleToggle
                disabled={!canManagePlan || !canUseModule("inventory")}
                enabled={(settings?.inventoryEnabled ?? true) && canUseModule("inventory")}
                key={`inventory-${selectedPlanKey}`}
                label="Inventario"
                name="inventoryEnabled"
              />
              <ModuleToggle
                disabled={!canManagePlan || !canUseModule("cash")}
                enabled={(settings?.cashEnabled ?? true) && canUseModule("cash")}
                key={`cash-${selectedPlanKey}`}
                label="Caja / POS"
                name="cashEnabled"
              />
              <ModuleToggle
                disabled={!canManagePlan || !canUseModule("kitchen") || !supportsKitchen}
                enabled={(settings?.kitchenEnabled ?? true) && canUseModule("kitchen") && supportsKitchen}
                key={`kitchen-${selectedPlanKey}`}
                label="Cocina / preparacion"
                name="kitchenEnabled"
              />
            </div>
          </Card>

          <div className="space-y-6">
            <Card className="space-y-4">
              <SectionTitle title="Estado operativo" description="Visibilidad y publicacion del restaurante." />
              <div className="rounded-2xl bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                {restaurant.status === "active"
                  ? `El ${catalogLabelTitle.toLowerCase()} publico esta habilitado y puede recibir pedidos.`
                  : `El ${catalogLabelTitle.toLowerCase()} publico esta cerrado porque el negocio no esta activo.`}
              </div>
              <div className={cn("inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-black", canManagePlan ? "bg-[var(--primary-light)] text-[var(--primary)]" : "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]")}>
                <ShieldCheck className="h-4 w-4" />
                {canManagePlan ? "Aqui puedes administrar plan, modulos y estado." : "El plan, los modulos y el estado general solo los cambia superadmin."}
              </div>
            </Card>

            <Card className="space-y-3">
              <SectionTitle title="Resumen rapido" description="Atajos mentales para el equipo operativo." />
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-sm font-semibold text-[var(--color-body)]">
                <p>Plan actual: {selectedPlan?.name ?? "Sin plan"}</p>
                <p className="mt-2">Responsable: {restaurant.ownerEmail || "Sin responsable"}</p>
                <p className="mt-2">Ciudad: {restaurant.city || "Sin ciudad"}</p>
                <p className="mt-2">Rubro: {restaurantBusinessTypeOptions.find((item) => item.value === restaurant.businessType)?.label ?? "Sin rubro"}</p>
                <p className="mt-2">Estado de plataforma: {platformStateLabel(billing)}</p>
              </div>
            </Card>
          </div>
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
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle title="Ubicacion" description="Direccion del local, referencia y punto de Google Maps para recojo y calculos futuros." />
            <div className="md:col-span-2" />
            <Input className="md:col-span-2" defaultValue={restaurant.address} name="address" placeholder="Direccion del local" />
            <Input className="md:col-span-2" defaultValue={restaurant.addressReference} name="addressReference" placeholder="Referencia, piso, zona o indicaciones" />
            <GoogleLocationFields defaultLatitude={restaurant.latitude} defaultLongitude={restaurant.longitude} defaultMapsUrl={restaurant.mapsUrl} label={restaurant.name} />
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Nueva zona" description="Define ciudad, radio aproximado y costo operativo de delivery." />
            <Input name="zoneName" placeholder="Nombre de zona, ej: Centro" />
            <Input defaultValue={restaurant.city} name="zoneCity" placeholder="Ciudad" />
            <div className="grid gap-3 sm:grid-cols-2">
              <Input name="zoneLatitude" placeholder="Latitud centro" step="0.0000001" type="number" />
              <Input name="zoneLongitude" placeholder="Longitud centro" step="0.0000001" type="number" />
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Input defaultValue="3" name="zoneRadiusKm" placeholder="Radio km" step="0.1" type="number" />
              <Input defaultValue={settings?.deliveryFee ?? 0} name="zoneDeliveryFee" placeholder="Costo envio" step="0.01" type="number" />
              <Input defaultValue={settings?.minOrderAmount ?? 0} name="zoneMinOrderAmount" placeholder="Pedido minimo" step="0.01" type="number" />
            </div>
            <Button formAction={saveDeliveryZoneAction} type="submit">
              <MapPin className="h-4 w-4" />
              Guardar zona
            </Button>
          </Card>

          <Card className="space-y-4 xl:col-span-2">
            <SectionTitle title="Zonas delivery" description="Base para segmentar cobertura y luego calcular costo por zona o distancia." />
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
                      <span className="rounded-xl bg-[var(--color-surface)] p-2">{zone.radiusKm} km</span>
                      <span className="rounded-xl bg-[var(--color-surface)] p-2">Bs {zone.deliveryFee}</span>
                      <span className="rounded-xl bg-[var(--color-surface)] p-2">Min {zone.minOrderAmount}</span>
                    </div>
                    <div className="mt-3 flex gap-2">
                      <Button className="min-h-10 flex-1 text-xs" formAction={toggleDeliveryZoneAction} name="zoneId" type="submit" value={zone.id} variant="secondary">
                        {zone.isActive ? "Pausar" : "Activar"}
                      </Button>
                      <Button className="min-h-10 flex-1 text-xs" formAction={deleteDeliveryZoneAction} name="zoneId" type="submit" value={zone.id} variant="secondary">
                        Eliminar
                      </Button>
                    </div>
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
                <Button formAction={closeRestaurantTodayAction} type="submit">
                  <Power className="h-4 w-4" />
                  Cerrar por hoy
                </Button>
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
                <Button formAction={createRestaurantAnnouncementAction} type="submit">
                  <Megaphone className="h-4 w-4" />
                  Publicar aviso
                </Button>
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
                    {announcement.isActive ? (
                      <Button className="mt-3 w-full" formAction={deactivateRestaurantAnnouncementAction} name="announcementId" type="submit" value={announcement.id} variant="secondary">
                        Desactivar aviso
                      </Button>
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
                <Button disabled={!ownerChangePolicy.canRequestNow || Boolean(pendingOwnerRequest)} formAction={createOwnerChangeRequestAction} type="submit">
                  <UserRound className="h-4 w-4" />
                  Enviar solicitud
                </Button>
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
                  <Button formAction={rejectOwnerChangeRequestAction} type="submit" variant="secondary">
                    Rechazar solicitud
                  </Button>
                  <Button formAction={approveOwnerChangeRequestAction} type="submit">
                    Aprobar cambio
                  </Button>
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
          <Button type="submit">Guardar configuracion</Button>
        </div>
      ) : null}
    </form>
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

function BillingStep({ label, detail, completed }: { label: string; detail: string; completed: boolean }) {
  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <div className="flex items-center gap-3">
        <span className={cn("h-3.5 w-3.5 rounded-full", completed ? "bg-[var(--color-success-strong)]" : "bg-[var(--color-danger-strong)]")} />
        <p className="text-sm font-black text-[var(--color-heading)]">{label}</p>
      </div>
      <p className="mt-2 text-xs font-semibold text-[var(--color-secondary-text)]">{detail}</p>
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
