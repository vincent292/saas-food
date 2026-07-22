import Link from "next/link";
import { CheckCircle2, Clock3, LifeBuoy, MessageCircle, Plus, XCircle } from "lucide-react";
import { requestOwnerBranchCapacityAction } from "@/app/admin/actions";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input, Textarea } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { listOwnerBranchCapacityRequests } from "@/lib/services/owner-dashboard.service";

const requestErrors: Record<string, string> = {
  "invalid-branch-request": "Revisa la cantidad solicitada.",
  "branch-request-pending": "Ya tienes una solicitud pendiente. El superadmin debe resolverla antes de crear otra.",
  "owner-required": "No encontramos una sucursal principal asociada a tu cuenta.",
};

export default async function OwnerSupportPage({ searchParams }: { searchParams: Promise<{ requested?: string; error?: string }> }) {
  const [{ requested, error }, { ownerMemberships, profile }] = await Promise.all([searchParams, getOwnerLayoutContext()]);
  const firstRestaurantId = ownerMemberships[0]?.restaurant.id;
  const requests = await listOwnerBranchCapacityRequests(profile.id);
  const hasPendingRequest = requests.some((request) => request.status === "pending");

  return (
    <OwnerLayout active="/dueno/soporte" memberships={ownerMemberships} title="Soporte">
      <div className="space-y-6">
        <Card className="grid gap-4 sm:grid-cols-[auto_1fr_auto] sm:items-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            <LifeBuoy className="h-5 w-5" />
          </span>
          <div>
            <h2 className="text-2xl font-black">Soporte del negocio</h2>
            <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">
              Para incidencias operativas se abre ticket desde una sucursal. Para cupos o plan puedes iniciar desde aqui.
            </p>
          </div>
          {firstRestaurantId ? (
            <Link className={buttonClasses("primary")} href={`/admin/restaurantes/${firstRestaurantId}/soporte`}>
              <MessageCircle className="h-4 w-4" />
              Abrir ticket
            </Link>
          ) : null}
        </Card>

        <SectionTitle description="Acciones frecuentes para duenos." title="Solicitudes" />

        {requested ? <div className="rounded-2xl bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)]">Solicitud enviada. Te mostraremos aqui cuando sea aprobada o rechazada.</div> : null}
        {error ? <div className="rounded-2xl bg-[var(--color-danger-soft)] p-4 text-sm font-bold text-[var(--color-danger-strong)]">{requestErrors[error] ?? "No se pudo enviar la solicitud."}</div> : null}

        <div className="grid gap-3 md:grid-cols-2">
          <Card className="space-y-4">
            <Plus className="h-6 w-6 text-[var(--primary)]" />
            <p className="mt-3 text-lg font-black">Pedir mas sucursales</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              El superadmin habilita cupos adicionales segun tu plan o acuerdo comercial.
            </p>
            {firstRestaurantId ? (
              <form action={requestOwnerBranchCapacityAction} className="space-y-3">
                <input name="restaurantId" type="hidden" value={firstRestaurantId} />
                <Input disabled={hasPendingRequest} max={20} min={1} name="requestedAdditional" placeholder="Cantidad adicional" required type="number" defaultValue={1} />
                <Textarea disabled={hasPendingRequest} name="reason" placeholder="Motivo o comentario para el superadmin" />
                <button className={buttonClasses("primary", "w-full")} disabled={hasPendingRequest} type="submit">
                  {hasPendingRequest ? "Solicitud pendiente" : "Enviar solicitud"}
                </button>
              </form>
            ) : null}
          </Card>
          <Card>
            <MessageCircle className="h-6 w-6 text-[var(--primary)]" />
            <p className="mt-3 text-lg font-black">Problemas de acceso</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              Revisa responsables, correos y sucursales antes de escalar una incidencia.
            </p>
          </Card>
        </div>

        <SectionTitle description="Seguimiento de las solicitudes enviadas." title="Historial de cupos" />
        <div className="grid gap-3">
          {requests.map((request) => {
            const icon = request.status === "approved" ? <CheckCircle2 className="h-5 w-5 text-[var(--color-success-strong)]" /> : request.status === "rejected" ? <XCircle className="h-5 w-5 text-[var(--color-danger-strong)]" /> : <Clock3 className="h-5 w-5 text-[var(--color-warning-strong)]" />;
            return (
              <Card className="grid gap-3 sm:grid-cols-[auto_1fr_auto] sm:items-center" key={request.id}>
                {icon}
                <div>
                  <p className="font-black">{request.requestedAdditional} sucursal{request.requestedAdditional === 1 ? "" : "es"} adicional{request.requestedAdditional === 1 ? "" : "es"}</p>
                  <p className="mt-1 text-sm font-semibold text-[var(--color-secondary-text)]">{request.reason || "Sin comentario"}</p>
                </div>
                <span className="text-xs font-black uppercase text-[var(--color-secondary-text)]">{request.status === "approved" ? `Aprobada: ${request.approvedLimit}` : request.status === "rejected" ? "Rechazada" : "Pendiente"}</span>
              </Card>
            );
          })}
          {!requests.length ? <Card className="border-dashed text-sm font-semibold text-[var(--color-secondary-text)]">Todavia no enviaste solicitudes de cupo.</Card> : null}
        </div>
      </div>
    </OwnerLayout>
  );
}
