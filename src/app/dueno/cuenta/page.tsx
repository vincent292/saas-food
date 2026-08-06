import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, IdCard, Mail, Phone, UserRound } from "lucide-react";
import { updateOwnerProfileAction } from "@/app/admin/actions";
import { OwnerLayout, getOwnerLayoutContext } from "@/components/layout/OwnerLayout";
import { Card } from "@/components/ui/Card";
import { BirthDateInput } from "@/components/ui/DateInput";
import { FormSubmitButton } from "@/components/ui/FormSubmitButton";
import { Input } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";

const accountErrors: Record<string, string> = {
  "invalid-profile": "Revisa nombre, telefono, carnet y fecha de nacimiento. El titular debe ser mayor de edad.",
  "owner-profile-update": "No se pudo guardar la cuenta. Intenta nuevamente.",
  "service-role-required": "Falta la clave de servicio para actualizar datos seguros del perfil.",
};

export default async function OwnerAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; required?: string; saved?: string }>;
}) {
  const [{ error, required, saved }, { profile, ownerMemberships }] = await Promise.all([
    searchParams,
    getOwnerLayoutContext({ active: "/dueno/cuenta" }),
  ]);
  const accountComplete = profile.ownerProfileComplete;

  return (
    <OwnerLayout active="/dueno/cuenta" memberships={ownerMemberships} title="Cuenta">
      <div className="space-y-6">
        {required ? (
          <div className="flex gap-3 rounded-[var(--radius-card)] border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-4 text-sm font-bold text-[var(--color-warning-strong)]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            Completa los datos del titular para habilitar el panel operativo y las sucursales.
          </div>
        ) : null}

        {saved ? (
          <div className="flex gap-3 rounded-[var(--radius-card)] border border-[var(--color-success)] bg-[var(--color-success-soft)] p-4 text-sm font-bold text-[var(--color-success-strong)]">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" />
            Datos de cuenta actualizados correctamente.
          </div>
        ) : null}

        {error ? (
          <div className="flex gap-3 rounded-[var(--radius-card)] border border-[var(--color-danger)] bg-[var(--color-danger-soft)] p-4 text-sm font-bold text-[var(--color-danger-strong)]">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
            {accountErrors[error] ?? "No se pudo procesar la cuenta."}
          </div>
        ) : null}

        <Card className="grid gap-4 lg:grid-cols-[auto_1fr_auto] lg:items-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">
            {accountComplete ? <CheckCircle2 className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
          </span>
          <div>
            <p className="text-sm font-bold text-[var(--color-secondary-text)]">Estado de cuenta</p>
            <h2 className="mt-1 text-2xl font-black text-[var(--color-heading)]">
              {accountComplete ? "Cuenta verificada" : "Datos pendientes"}
            </h2>
            <p className="mt-2 text-sm text-[var(--color-secondary-text)]">
              {accountComplete
                ? "El titular tiene los datos minimos requeridos para operar."
                : "Mientras falten datos, el panel queda limitado a Cuenta, Plan y Soporte."}
            </p>
          </div>
          <span
            className={
              accountComplete
                ? "rounded-full bg-[var(--color-success-soft)] px-3 py-1 text-xs font-black uppercase text-[var(--color-success-strong)]"
                : "rounded-full bg-[var(--color-warning-soft)] px-3 py-1 text-xs font-black uppercase text-[var(--color-warning-strong)]"
            }
          >
            {accountComplete ? "Completa" : "Pendiente"}
          </span>
        </Card>

        <div className="grid gap-4 lg:grid-cols-2">
          <AccountInfoCard icon={<UserRound className="h-5 w-5" />} label="Nombre" value={profile.fullName || "Dueno"} />
          <AccountInfoCard icon={<Mail className="h-5 w-5" />} label="Correo de acceso" value={profile.email} />
          <AccountInfoCard icon={<Phone className="h-5 w-5" />} label="Telefono" value={profile.phone || "Pendiente"} />
          <AccountInfoCard icon={<IdCard className="h-5 w-5" />} label="Carnet / documento" value={profile.documentNumber || "Pendiente"} />
        </div>

        <form action={updateOwnerProfileAction} data-navigation-feedback="off">
          <Card className="grid gap-4 md:grid-cols-2">
            <SectionTitle
              className="md:col-span-2"
              description="Estos datos identifican al titular de cobro y administracion. La fecha valida mayoria de edad."
              title="Datos del titular"
            />

            <Input defaultValue={profile.fullName} name="fullName" placeholder="Nombre completo" required />
            <Input defaultValue={profile.phone ?? ""} name="phone" placeholder="Telefono o WhatsApp" required />
            <Input defaultValue={profile.documentNumber ?? ""} name="documentNumber" placeholder="Carnet / documento" required />

            <label className="grid gap-1 text-sm font-bold text-[var(--color-secondary-text)]">
              Fecha de nacimiento
              <BirthDateInput defaultValue={profile.birthDate ?? ""} name="birthDate" required />
            </label>

            <div className="rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-neutral-50)] p-4 text-sm text-[var(--color-secondary-text)] md:col-span-2">
              <p className="font-black text-[var(--color-heading)]">Seguridad</p>
              <p className="mt-1">
                El correo se mantiene como credencial de acceso. Para cambiarlo o resolver datos sensibles, usa Soporte.
              </p>
            </div>

            <div className="md:col-span-2">
              <FormSubmitButton
                className="w-full sm:w-auto"
                label="Guardar cuenta"
                overlayDescription="Validando datos del titular y actualizando el panel."
                overlayTitle="Actualizando cuenta"
                pendingLabel="Guardando..."
              />
            </div>
          </Card>
        </form>
      </div>
    </OwnerLayout>
  );
}

function AccountInfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <Card>
      <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary)]">{icon}</span>
      <p className="mt-4 text-sm font-bold text-[var(--color-secondary-text)]">{label}</p>
      <h2 className="mt-1 break-words text-2xl font-black text-[var(--color-heading)]">{value}</h2>
    </Card>
  );
}
