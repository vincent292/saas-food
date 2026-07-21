import { Mail, UserRound } from "lucide-react";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { Card } from "@/components/ui/Card";

export default async function OwnerAccountPage() {
  const { profile, ownerMemberships } = await getOwnerLayoutContext();

  return (
    <OwnerLayout active="/dueno/cuenta" memberships={ownerMemberships} title="Cuenta">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            <UserRound className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-bold text-[var(--color-secondary-text)]">Nombre</p>
          <h2 className="mt-1 text-2xl font-black">{profile.fullName || "Dueno"}</h2>
        </Card>
        <Card>
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            <Mail className="h-5 w-5" />
          </span>
          <p className="mt-4 text-sm font-bold text-[var(--color-secondary-text)]">Correo de acceso</p>
          <h2 className="mt-1 break-words text-2xl font-black">{profile.email}</h2>
        </Card>
      </div>
    </OwnerLayout>
  );
}
