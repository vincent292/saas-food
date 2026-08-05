import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CreditCard, ExternalLink, ReceiptText, ShieldCheck, Store, WalletCards } from "lucide-react";
import { approveOwnerBillingPaymentAction, resolveOwnerBranchCapacityAction, setOwnerAccountStatusAction, updateOwnerBillingSettingsAction, updateOwnerBranchEntitlementAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { QrPaymentViewer } from "@/components/payments/QrPaymentViewer";
import { CompressedImageInput } from "@/components/settings/CompressedImageInput";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { Input, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { authService } from "@/lib/services/auth.service";
import { clientAccountService } from "@/lib/services/client-account.service";
import { modulesForAdminLayout } from "@/lib/modules";
import type { OwnerBillingCycle } from "@/lib/services/owner-billing.service";
import { listOwnerBranchCapacityRequests } from "@/lib/services/owner-dashboard.service";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type { RestaurantStatus } from "@/types/restaurant.types";

const errorMessages: Record<string, string> = {
  "invalid-entitlement": "Revisa el numero de sucursales habilitadas.",
  "invalid-branch-request": "Revisa la solicitud y el nuevo limite aprobado.",
  "invalid-owner-account-status": "No se pudo cambiar el estado de la cuenta.",
  "invalid-owner-billing-cycle": "No se pudo resolver el ciclo de pago.",
  "invalid-owner-billing-settings": "Revisa fecha, moneda y recordatorio del cobro mensual.",
  "owner-account-empty": "Esta cuenta no tiene sucursales activas o inactivas para suspender.",
  "owner-billing-qr-upload": "No se pudo subir el QR de cobro mensual.",
  "owner-billing-settings-save": "No se pudo guardar la configuracion de cobro.",
  "owner-billing-cycle-missing": "No encontramos el ciclo mensual para aprobar.",
  "service-role-required": "Falta la clave de servicio para esta operacion.",
  P0002: "La solicitud ya fue resuelta o no existe.",
};

export default async function ClientAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ account?: string; billingSaved?: string; paymentPaid?: string; saved?: string; error?: string }>;
}) {
  const [{ restaurantId }, { account: accountStatus, billingSaved, paymentPaid, saved, error }, profile] = await Promise.all([params, searchParams, authService.getCurrentProfile()]);

  if (profile?.globalRole !== "superadmin") {
    redirect("/admin?error=superadmin-required");
  }

  const account = await clientAccountService.getByRestaurantId(restaurantId);

  if (!account) {
    notFound();
  }

  const baseRestaurant = account.baseRestaurant;
  const branchRequests = account.owner.userId ? await listOwnerBranchCapacityRequests(account.owner.userId) : [];
  const pendingBranchRequests = branchRequests.filter((request) => request.status === "pending");
  const accountSuspended = account.branches.length > 0 && account.branches.every(({ restaurant }) => restaurant.status === "suspended");
  const suspendedBranches = account.branches.filter(({ restaurant }) => restaurant.status === "suspended").length;
  const nextAccountStatus = accountSuspended ? "active" : "suspended";
  const ownerBilling = account.billing;

  return (
    <AdminLayout
      active="/admin/restaurantes"
      enabledModules={modulesForAdminLayout(baseRestaurant)}
      restaurantId={baseRestaurant.id}
      restaurantName={baseRestaurant.name}
      restaurantStatus={baseRestaurant.status}
      title="Cuenta del cliente"
    >
      <div className="space-y-6">
        <SectionTitle
          action={
            <div className="flex flex-wrap gap-2">
              <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${baseRestaurant.id}`}>
                Ficha
              </Link>
              <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${baseRestaurant.id}/configuracion?tab=plataforma`}>
                Pagos
              </Link>
              <Link className={buttonClasses("primary")} href={`/admin/restaurantes/${baseRestaurant.id}/dashboard`}>
                Operar sucursal
              </Link>
            </div>
          }
          description="Control comercial del cliente: sucursales habilitadas, tarifa y pagos de plataforma."
          title={account.owner.name}
        />

        {saved ? (
          <div className="rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)]">
            Cuenta actualizada correctamente.
          </div>
        ) : null}
        {accountStatus ? (
          <div className="rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)]">
            {accountStatus === "active" ? "Cuenta reactivada correctamente." : "Cuenta suspendida correctamente."}
          </div>
        ) : null}
        {billingSaved ? (
          <div className="rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)]">
            Configuracion de cobro mensual actualizada.
          </div>
        ) : null}
        {paymentPaid ? (
          <div className="rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)]">
            Pago aprobado. Cuenta y sucursales reactivadas.
          </div>
        ) : null}
        {error ? (
          <div className="rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-bold text-[var(--color-danger-strong)]">
            {errorMessages[error] ?? "No se pudo guardar la cuenta del cliente."}
          </div>
        ) : null}

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Card className="overflow-hidden p-0">
            <div className="relative h-44 bg-[var(--primary)]">
              {isImageUrl(baseRestaurant.bannerUrl) ? (
                <Image alt={baseRestaurant.name} className="object-cover" fill priority sizes="(min-width: 1280px) 780px, 100vw" src={baseRestaurant.bannerUrl} />
              ) : (
                <div className="grid h-full place-items-center bg-[linear-gradient(135deg,#082441_0%,#12355B_60%,#071E36_100%)] text-white">
                  <Store className="h-12 w-12 opacity-70" />
                </div>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/55 to-transparent" />
              <div className="absolute bottom-4 left-4 flex items-end gap-3">
                <LogoBox restaurant={baseRestaurant} />
                <div className="text-white">
                  <p className="text-2xl font-black">{baseRestaurant.name}</p>
                  <p className="text-sm font-bold text-white/78">{publicRestaurantPath(baseRestaurant.slug)}</p>
                </div>
              </div>
            </div>
            <div className="grid gap-4 p-5 md:grid-cols-3">
              <InfoMetric icon={<ShieldCheck className="h-5 w-5" />} label="Dueno" value={account.owner.email} />
              <InfoMetric icon={<WalletCards className="h-5 w-5" />} label="Tarifa" value={account.pricing.planName} />
              <InfoMetric icon={<CreditCard className="h-5 w-5" />} label="Total mensual" value={formatMoney(ownerBilling?.monthlyTotal ?? account.pricing.monthlyTotal)} />
            </div>
          </Card>

          <div className="grid gap-4">
            <Card className="space-y-4">
              <SectionTitle
                title="Estado de cuenta"
                description="Suspende o reactiva todas las sucursales no archivadas de este dueno."
              />
              <div className="grid grid-cols-2 gap-2">
                <SmallStat label="Suspendidas" value={`${suspendedBranches}/${account.branches.length}`} />
                <SmallStat label="Estado" value={accountSuspended ? "Pausada" : "Activa"} />
              </div>
              <form action={setOwnerAccountStatusAction}>
                <input name="restaurantId" type="hidden" value={baseRestaurant.id} />
                <input name="returnTo" type="hidden" value={`/admin/restaurantes/${baseRestaurant.id}/cuenta`} />
                {account.owner.userId ? <input name="ownerUserId" type="hidden" value={account.owner.userId} /> : null}
                <input name="status" type="hidden" value={nextAccountStatus} />
                <FormSubmitButton
                  className="w-full"
                  disabled={!account.owner.userId || !account.branches.length}
                  label={nextAccountStatus === "active" ? "Reactivar cuenta" : "Suspender cuenta"}
                  overlayDescription="Actualizando el estado de la cuenta, sucursal principal y sucursales asociadas."
                  overlayTitle={nextAccountStatus === "active" ? "Reactivando cuenta" : "Suspendiendo cuenta"}
                  pendingLabel={nextAccountStatus === "active" ? "Reactivando..." : "Suspendiendo..."}
                  variant={nextAccountStatus === "active" ? "primary" : "danger"}
                />
              </form>
              <p className="text-xs font-bold leading-5 text-[var(--color-secondary-text)]">
                Al suspender, el dueno y responsables quedan sin acceso operativo hasta la reactivacion.
              </p>
            </Card>

            <Card className="space-y-4">
              <SectionTitle title="Sucursales habilitadas" description="Solo superadmin puede habilitar o reducir nuevas sucursales para este cliente." />
              <div className="grid grid-cols-3 gap-2">
                <SmallStat label="Usadas" value={String(account.capacity.used)} />
                <SmallStat label="Habilitadas" value={String(account.capacity.limit)} />
                <SmallStat label="Libres" value={String(account.capacity.available)} />
              </div>
              <form action={updateOwnerBranchEntitlementAction} className="space-y-3">
                <input name="restaurantId" type="hidden" value={baseRestaurant.id} />
                {account.owner.userId ? <input name="ownerUserId" type="hidden" value={account.owner.userId} /> : null}
                <Input defaultValue={account.capacity.limit} disabled={!account.owner.userId} min={1} name="branchLimit" placeholder="Sucursales habilitadas" required type="number" />
                <button className={buttonClasses("primary", "w-full")} disabled={!account.owner.userId} type="submit">
                  Guardar habilitacion
                </button>
              </form>
              {!account.owner.userId ? (
                <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs font-bold text-[var(--color-warning-strong)]">
                  Este cliente no tiene owner_user_id. Primero asigna un dueno real desde Configuracion.
                </p>
              ) : null}
            </Card>

            <Card className="space-y-4">
              <SectionTitle title="Cobro mensual" description="Pago unico por cuenta: principal + sucursales no archivadas." />
              {ownerBilling ? (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <SmallStat label="Vence" value={formatDate(ownerBilling.currentCycle.dueDate)} />
                    <SmallStat label="Monto" value={formatMoney(ownerBilling.currentCycle.amountDue, ownerBilling.currentCycle.currency)} />
                  </div>
                  <OwnerBillingStatusBadge cycle={ownerBilling.currentCycle} overdue={ownerBilling.isOverdue} />
                  {ownerBilling.currentCycle.proofUrl ? (
                    <a className="inline-flex items-center gap-2 text-sm font-black text-[var(--primary)]" href={ownerBilling.currentCycle.proofUrl} rel="noreferrer" target="_blank">
                      <ReceiptText className="h-4 w-4" />
                      Ver comprobante
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : (
                    <p className="text-sm font-semibold text-[var(--color-secondary-text)]">Sin comprobante cargado para este ciclo.</p>
                  )}
                  <form action={approveOwnerBillingPaymentAction} className="space-y-3">
                    {account.owner.userId ? <input name="ownerUserId" type="hidden" value={account.owner.userId} /> : null}
                    <input name="restaurantId" type="hidden" value={baseRestaurant.id} />
                    <input name="cycleId" type="hidden" value={ownerBilling.currentCycle.id} />
                    <Textarea name="ownerBillingResolutionNotes" placeholder="Nota de aprobacion o referencia interna" />
                    <FormSubmitButton
                      className="w-full"
                      disabled={!account.owner.userId || !ownerBilling.currentCycle.proofUrl || Boolean(ownerBilling.currentCycle.paidAt)}
                      label="Aprobar pago"
                      overlayDescription="Marcando el ciclo como pagado y reactivando sucursales."
                      overlayTitle="Aprobando pago"
                      pendingLabel="Aprobando..."
                    />
                  </form>

                  <form action={updateOwnerBillingSettingsAction} className="grid gap-3 border-t border-[var(--border)] pt-4">
                    {account.owner.userId ? <input name="ownerUserId" type="hidden" value={account.owner.userId} /> : null}
                    <input name="restaurantId" type="hidden" value={baseRestaurant.id} />
                    {ownerBilling.settings.platformQrUrl ? <input name="currentOwnerBillingQrUrl" type="hidden" value={ownerBilling.settings.platformQrUrl} /> : null}
                    <label className="grid gap-1 text-sm font-bold text-[var(--color-secondary-text)]">
                      Proximo vencimiento
                      <Input defaultValue={ownerBilling.settings.nextDueDate} name="ownerBillingNextDueDate" required type="date" />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Input defaultValue={ownerBilling.settings.reminderDays} max={15} min={0} name="ownerBillingReminderDays" placeholder="Recordatorio dias" type="number" />
                      <Input defaultValue={ownerBilling.settings.currency} maxLength={3} minLength={3} name="ownerBillingCurrency" placeholder="Moneda" />
                    </div>
                    <CompressedImageInput help="QR que el dueno usara para pagar la mensualidad de la plataforma." label="QR mensual" name="ownerBillingQrFile" previewClassName="aspect-square" />
                    {ownerBilling.settings.platformQrUrl ? (
                      <QrPaymentViewer
                        alt="QR mensual actual"
                        downloadFileName={`${baseRestaurant.slug}-qr-mensual.png`}
                        imageClassName="h-32 w-32"
                        subtitle="QR guardado para el cobro mensual de esta cuenta."
                        title="QR mensual actual"
                        url={ownerBilling.settings.platformQrUrl}
                      />
                    ) : null}
                    <Textarea defaultValue={ownerBilling.settings.platformQrNote ?? ""} name="ownerBillingQrNote" placeholder="Instrucciones de pago para el dueno" />
                    <FormSubmitButton
                      className="w-full"
                      disabled={!account.owner.userId}
                      label="Guardar cobro"
                      overlayDescription="Actualizando QR, fecha y recordatorio de la cuenta."
                      overlayTitle="Guardando cobro"
                      pendingLabel="Guardando..."
                    />
                  </form>
                </>
              ) : (
                <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-sm font-bold text-[var(--color-warning-strong)]">
                  No se pudo preparar el cobro mensual. Revisa la configuracion de servicio.
                </p>
              )}
            </Card>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <Card>
            <p className="text-sm font-bold text-[var(--color-secondary-text)]">Primera sucursal</p>
            <p className="mt-1 text-2xl font-black">{formatMoney(account.pricing.primaryPriceMonthly)}</p>
            <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">mensual</p>
          </Card>
          <Card>
            <p className="text-sm font-bold text-[var(--color-secondary-text)]">Sucursal adicional</p>
            <p className="mt-1 text-2xl font-black">{formatMoney(account.pricing.additionalPriceMonthly)}</p>
            <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">mensual por cada extra</p>
          </Card>
          <Card>
            <p className="text-sm font-bold text-[var(--color-secondary-text)]">Control del SaaS</p>
            <p className="mt-1 text-2xl font-black">Superadmin</p>
            <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">el cliente solicita sucursales con comprobante</p>
          </Card>
        </section>

        {ownerBilling?.recentCycles.length ? (
          <section className="space-y-3">
            <SectionTitle description="Cada mes queda separado con vencimiento, monto, comprobante y aprobacion." title="Historial de mensualidades" />
            <DataTable
              emptyMessage="No hay mensualidades registradas."
              headers={["Mes", "Monto", "Estado", "Comprobante"]}
              rows={ownerBilling.recentCycles.map((cycle) => [
                <div key={`${cycle.id}-period`}>
                  <p className="font-black">{monthLabel(cycle.periodKey)}</p>
                  <p className="text-xs font-bold text-[var(--color-secondary-text)]">Vence {formatDate(cycle.dueDate)}</p>
                </div>,
                formatMoney(cycle.amountDue, cycle.currency),
                <OwnerBillingStatusBadge cycle={cycle} key={`${cycle.id}-status`} overdue={cycle.status === "overdue"} />,
                cycle.proofUrl ? (
                  <a className="inline-flex items-center gap-1 text-sm font-black text-[var(--primary)]" href={cycle.proofUrl} key={`${cycle.id}-proof`} rel="noreferrer" target="_blank">
                    Abrir
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                ) : (
                  <span className="text-sm font-bold text-[var(--color-secondary-text)]" key={`${cycle.id}-proof-empty`}>Sin comprobante</span>
                ),
              ])}
            />
          </section>
        ) : null}

        <section className="space-y-3">
          <SectionTitle description="El dueno paga, sube su comprobante y solo el superadmin habilita las sucursales solicitadas." title="Solicitudes de sucursales" />
          <div className="grid gap-3">
            {pendingBranchRequests.map((request) => (
              <Card className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" key={request.id}>
                <div>
                  <p className="text-lg font-black">Solicita {request.requestedAdditional} sucursal{request.requestedAdditional === 1 ? "" : "es"}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
                    Habilitadas al solicitar: {request.currentLimit}. Total pagado: {formatMoney(request.paymentAmount, request.paymentCurrency)}. {request.reason || "Sin comentario adicional."}
                  </p>
                  {request.paymentProofUrl ? (
                    <a className="mt-2 inline-flex items-center gap-1 text-sm font-black text-[var(--primary)]" href={request.paymentProofUrl} rel="noreferrer" target="_blank">
                      Ver comprobante
                      <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <form action={resolveOwnerBranchCapacityAction} className="space-y-2">
                    <input name="requestId" type="hidden" value={request.id} />
                    <input name="restaurantId" type="hidden" value={baseRestaurant.id} />
                    <input name="decision" type="hidden" value="approve" />
                    <Input defaultValue={request.currentLimit + request.requestedAdditional} min={request.currentLimit} name="approvedLimit" required type="number" />
                    <Textarea name="resolutionNotes" placeholder="Nota de aprobacion opcional" />
                    <button className={buttonClasses("primary", "w-full")} type="submit">Aprobar y habilitar</button>
                  </form>
                  <form action={resolveOwnerBranchCapacityAction}>
                    <input name="requestId" type="hidden" value={request.id} />
                    <input name="restaurantId" type="hidden" value={baseRestaurant.id} />
                    <input name="decision" type="hidden" value="reject" />
                    <button className={buttonClasses("secondary", "w-full")} type="submit">Rechazar</button>
                  </form>
                </div>
              </Card>
            ))}
            {!pendingBranchRequests.length ? <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">No hay solicitudes pendientes para esta cuenta.</Card> : null}
          </div>
        </section>

        <section className="space-y-3">
          <SectionTitle description="Cada sucursal mantiene pedidos, caja, inventario y usuarios separados. El cobro se aprueba como mensualidad unica de la cuenta." title="Sucursales del cliente" />
          <DataTable
            emptyMessage="Este cliente todavia no tiene sucursales."
            headers={["Sucursal", "Estado", "Tarifa", "Acciones"]}
            rows={account.branches.map(({ restaurant }, index) => [
              <div className="flex items-center gap-3" key={`${restaurant.id}-branch`}>
                <LogoBox restaurant={restaurant} small />
                <div>
                  <p className="font-black">{restaurant.name}</p>
                  <p className="text-xs text-[var(--color-secondary-text)]">{publicRestaurantPath(restaurant.slug)}</p>
                </div>
              </div>,
              <StatusBadge key={`${restaurant.id}-status`} status={restaurant.status} />,
              index === 0 ? formatMoney(account.pricing.primaryPriceMonthly) : formatMoney(account.pricing.additionalPriceMonthly),
              <div className="flex flex-wrap gap-2" key={`${restaurant.id}-actions`}>
                <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}`}>
                  Ficha
                </Link>
                <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}/configuracion`}>
                  Configurar
                </Link>
                <Link className={buttonClasses("primary")} href={`/admin/restaurantes/${restaurant.id}/dashboard`}>
                  Entrar
                </Link>
              </div>,
            ])}
          />
        </section>
      </div>
    </AdminLayout>
  );
}

function isImageUrl(value?: string | null) {
  return Boolean(value && (value.startsWith("http") || value.startsWith("/")));
}

function LogoBox({ restaurant, small = false }: { restaurant: { name: string; logoUrl?: string }; small?: boolean }) {
  const size = small ? "h-11 w-11 rounded-2xl" : "h-20 w-20 rounded-[1.4rem]";
  const logoIsImage = isImageUrl(restaurant.logoUrl);

  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden border border-white/40 bg-white text-[var(--primary)] shadow-sm ${size}`}>
      {logoIsImage ? (
        <Image alt={restaurant.name} className="h-full w-full object-cover" height={small ? 44 : 80} src={restaurant.logoUrl ?? ""} width={small ? 44 : 80} />
      ) : (
        <span className={small ? "text-sm font-black" : "text-xl font-black"}>{restaurant.logoUrl || restaurant.name.slice(0, 2).toUpperCase()}</span>
      )}
    </span>
  );
}

function InfoMetric({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3">
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{label}</p>
        <p className="truncate text-sm font-black text-[var(--color-heading)]">{value}</p>
      </div>
    </div>
  );
}

function SmallStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[var(--color-surface)] p-3 text-center">
      <p className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{label}</p>
      <p className="mt-1 text-2xl font-black text-[var(--color-heading)]">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: RestaurantStatus }) {
  const label = status === "active" ? "Activo" : status === "suspended" ? "Suspendido" : "Inactivo";
  const className =
    status === "active"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "suspended"
        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
        : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";

  return <Badge className={className}>{label}</Badge>;
}

function OwnerBillingStatusBadge({ cycle, overdue }: { cycle: OwnerBillingCycle; overdue: boolean }) {
  const status = cycle.paidAt ? "paid" : overdue ? "overdue" : cycle.status;
  const label =
    status === "paid"
      ? "Pagado"
      : status === "proof_uploaded"
        ? "En revision"
        : status === "verified"
          ? "Verificado"
          : status === "overdue"
            ? "Vencido"
            : "Pendiente";
  const className =
    status === "paid"
      ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
      : status === "overdue"
        ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
        : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";

  return <Badge className={className}>{label}</Badge>;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("es-BO", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(`${value}T00:00:00`));
}

function monthLabel(periodKey: string) {
  return new Intl.DateTimeFormat("es-BO", { month: "long", year: "numeric" }).format(new Date(`${periodKey}-01T00:00:00`));
}
