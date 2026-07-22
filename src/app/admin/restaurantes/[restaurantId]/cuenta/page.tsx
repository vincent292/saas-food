import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { CreditCard, ExternalLink, ShieldCheck, Store, WalletCards } from "lucide-react";
import { resolveOwnerBranchCapacityAction, updateOwnerBranchEntitlementAction } from "@/app/admin/actions";
import { AdminLayout } from "@/components/layout/AdminLayout";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/DataTable";
import { Input, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { authService } from "@/lib/services/auth.service";
import { clientAccountService } from "@/lib/services/client-account.service";
import { modulesForAdminLayout } from "@/lib/modules";
import { listOwnerBranchCapacityRequests } from "@/lib/services/owner-dashboard.service";
import { formatMoney } from "@/lib/utils/money";
import { publicRestaurantPath } from "@/lib/utils/public-routes";
import type { PlatformBilling, RestaurantStatus } from "@/types/restaurant.types";

const errorMessages: Record<string, string> = {
  "invalid-entitlement": "Revisa el numero de sucursales habilitadas.",
  "invalid-branch-request": "Revisa la solicitud y el nuevo limite aprobado.",
  P0002: "La solicitud ya fue resuelta o no existe.",
};

export default async function ClientAccountPage({
  params,
  searchParams,
}: {
  params: Promise<{ restaurantId: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const [{ restaurantId }, { saved, error }, profile] = await Promise.all([params, searchParams, authService.getCurrentProfile()]);

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
          description="Control comercial del cliente: cupos, sucursales, tarifa y pagos de plataforma."
          title={account.owner.name}
        />

        {saved ? (
          <div className="rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)]">
            Cupos actualizados correctamente.
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
              <InfoMetric icon={<CreditCard className="h-5 w-5" />} label="Total mensual" value={formatMoney(account.pricing.monthlyTotal)} />
            </div>
          </Card>

          <Card className="space-y-4">
            <SectionTitle title="Cupos de sucursal" description="Solo superadmin puede habilitar o reducir cupos para este cliente." />
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
                Habilitar cupos
              </button>
            </form>
            {!account.owner.userId ? (
              <p className="rounded-2xl bg-[var(--color-warning-soft)] p-3 text-xs font-bold text-[var(--color-warning-strong)]">
                Este cliente no tiene owner_user_id. Primero asigna un dueno real desde Configuracion.
              </p>
            ) : null}
          </Card>
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
            <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">el cliente solo puede solicitar cupos</p>
          </Card>
        </section>

        <section className="space-y-3">
          <SectionTitle description="El dueno solicita; solo el superadmin aprueba y cambia el cupo disponible." title="Solicitudes de sucursales" />
          <div className="grid gap-3">
            {pendingBranchRequests.map((request) => (
              <Card className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]" key={request.id}>
                <div>
                  <p className="text-lg font-black">Solicita {request.requestedAdditional} sucursal{request.requestedAdditional === 1 ? "" : "es"} adicional{request.requestedAdditional === 1 ? "" : "es"}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">Cupo actual: {request.currentLimit}. {request.reason || "Sin comentario adicional."}</p>
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
          <SectionTitle description="Cada sucursal mantiene pedidos, caja, inventario, usuarios y pagos separados." title="Sucursales del cliente" />
          <DataTable
            emptyMessage="Este cliente todavia no tiene sucursales."
            headers={["Sucursal", "Estado", "Cobro", "Pago", "Acciones"]}
            rows={account.branches.map(({ restaurant, billing }, index) => [
              <div className="flex items-center gap-3" key={`${restaurant.id}-branch`}>
                <LogoBox restaurant={restaurant} small />
                <div>
                  <p className="font-black">{restaurant.name}</p>
                  <p className="text-xs text-[var(--color-secondary-text)]">{publicRestaurantPath(restaurant.slug)}</p>
                </div>
              </div>,
              <StatusBadge key={`${restaurant.id}-status`} status={restaurant.status} />,
              index === 0 ? formatMoney(account.pricing.primaryPriceMonthly) : formatMoney(account.pricing.additionalPriceMonthly),
              <BillingCell billing={billing} key={`${restaurant.id}-billing`} />,
              <div className="flex flex-wrap gap-2" key={`${restaurant.id}-actions`}>
                <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}`}>
                  Ficha
                </Link>
                <Link className={buttonClasses("secondary")} href={`/admin/restaurantes/${restaurant.id}/configuracion?tab=plataforma`}>
                  Pagos
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

function BillingCell({ billing }: { billing: PlatformBilling | null }) {
  if (!billing) {
    return <span className="text-sm font-bold text-[var(--color-secondary-text)]">Sin configurar</span>;
  }

  const paid = Boolean(billing.currentCycle?.paidAt);
  const label = paid ? "Pagado" : billing.isOverdue ? "Vencido" : billing.currentCycle?.proofUploadedAt ? "Comprobante" : "Pendiente";
  const className = paid
    ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]"
    : billing.isOverdue
      ? "bg-[var(--color-danger-soft)] text-[var(--color-danger-strong)]"
      : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]";

  return (
    <div>
      <span className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${className}`}>{label}</span>
      <p className="mt-1 text-xs font-bold text-[var(--color-secondary-text)]">Vence {billing.nextDueDate}</p>
      {billing.currentCycle?.proofUrl ? (
        <a className="mt-1 inline-flex items-center gap-1 text-xs font-black text-[var(--primary)]" href={billing.currentCycle.proofUrl} rel="noreferrer" target="_blank">
          Comprobante
          <ExternalLink className="h-3 w-3" />
        </a>
      ) : null}
    </div>
  );
}
