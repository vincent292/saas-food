import { headers } from "next/headers";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { OwnerRidersClient } from "@/components/owner/OwnerRidersClient";
import { riderService } from "@/lib/services/rider.service";

const riderMessages: Record<string, string> = {
  "invalid-rider-renewal": "Revisa el rider y vuelve a intentar.",
  "invalid-rider-payment-proof": "El comprobante debe ser imagen o PDF de hasta 5 MB.",
  "rider-not-found": "No encontramos ese rider en tus sucursales.",
  "rider-payment-proof-upload": "No se pudo subir el comprobante. Intenta con otro archivo.",
  "rider-payment-settings": "Aun falta configurar el QR de riders desde superadmin.",
  "rider-renewal-pending": "Ese rider ya tiene una renovacion pendiente de revision.",
};

async function currentOrigin() {
  const headerStore = await headers();
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host") ?? "localhost:3000";
  const protocol = headerStore.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  return `${protocol}://${host}`;
}

export default async function OwnerRidersPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; renewal?: string }>;
}) {
  const [{ error, renewal }, { ownerMemberships, profile }] = await Promise.all([
    searchParams,
    getOwnerLayoutContext({ active: "/dueno/riders" }),
  ]);
  const origin = await currentOrigin();
  const [branches, payment] = await Promise.all([
    riderService.getOwnerRiderBranches(ownerMemberships, profile.id, origin),
    riderService.getPaymentSettings(),
  ]);

  return (
    <OwnerLayout active="/dueno/riders" memberships={ownerMemberships} title="Riders">
      <OwnerRidersClient
        branches={branches}
        errorMessage={error ? riderMessages[error] ?? "No se pudo completar la accion de riders." : ""}
        payment={payment}
        renewalSent={Boolean(renewal)}
      />
    </OwnerLayout>
  );
}
