import Link from "next/link";
import { LifeBuoy, MessageCircle, Plus } from "lucide-react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { buttonClasses } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";

export default async function OwnerSupportPage() {
  const { ownerMemberships } = await getOwnerLayoutContext();
  const firstRestaurantId = ownerMemberships[0]?.restaurant.id;

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

        <div className="grid gap-3 md:grid-cols-2">
          <Card>
            <Plus className="h-6 w-6 text-[var(--primary)]" />
            <p className="mt-3 text-lg font-black">Pedir mas sucursales</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              El superadmin habilita cupos adicionales segun tu plan o acuerdo comercial.
            </p>
          </Card>
          <Card>
            <MessageCircle className="h-6 w-6 text-[var(--primary)]" />
            <p className="mt-3 text-lg font-black">Problemas de acceso</p>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-secondary-text)]">
              Revisa responsables, correos y sucursales antes de escalar una incidencia.
            </p>
          </Card>
        </div>
      </div>
    </OwnerLayout>
  );
}
