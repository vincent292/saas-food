"use client";

import { useActionState } from "react";
import { Copy, UserPlus } from "lucide-react";
import { createOwnerClientAction, type CreateOwnerFormState } from "@/app/admin/actions";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { BirthDateInput } from "@/components/ui/DateInput";
import { Input } from "@/components/ui/Input";
import { SectionTitle } from "@/components/ui/SectionTitle";

const errorMessages: Record<string, string> = {
  invalid: "Revisa nombre, correo, telefono, carnet y fecha de nacimiento del dueno.",
  "owner-email-exists": "Ese correo ya existe. Usa otro correo para crear un nuevo dueno.",
  "owner-create": "No se pudo crear el usuario. Revisa Supabase Auth e intenta nuevamente.",
  "profile-create": "El usuario se creo, pero no se pudo guardar el perfil. Revisa la tabla profiles.",
  "owner-entitlement": "El usuario se creo, pero no se pudo guardar las sucursales habilitadas.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para crear usuarios desde el panel.",
};

const initialState: CreateOwnerFormState = {};

export function NewOwnerFormClient() {
  const [state, formAction, pending] = useActionState(createOwnerClientAction, initialState);
  const values = state.values ?? {};
  const errorMessage = state.error?.startsWith("owner-create:")
    ? `No se pudo crear el usuario: ${state.error.replace("owner-create:", "")}`
    : state.error
      ? (errorMessages[state.error] ?? `No se pudo crear el dueno. Error: ${state.error}`)
      : "";

  return (
    <form action={formAction} data-navigation-feedback="off">
      {state.error ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)]" role="alert">
          {errorMessage}
        </div>
      ) : null}

      {state.success ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-success-soft)] bg-[var(--color-success-soft)] p-4 text-sm font-semibold text-[var(--color-success-strong)]" role="status">
          <p>Dueno creado: {state.success}. Debe entrar a /admin/login con esta contrasena temporal.</p>
          {state.temporaryPassword ? (
            <div className="mt-3 grid gap-2 rounded-2xl bg-white/80 p-3 text-[var(--color-heading)] sm:grid-cols-[1fr_auto] sm:items-center">
              <code className="break-all text-base font-black">{state.temporaryPassword}</code>
              <button
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-4 text-sm font-bold text-[var(--color-on-primary)]"
                onClick={() => navigator.clipboard?.writeText(state.temporaryPassword ?? "")}
                type="button"
              >
                <Copy className="h-4 w-4" />
                Copiar
              </button>
            </div>
          ) : null}
          <p className="mt-2 text-xs font-bold">En su primer ingreso se le pedira crear una contrasena nueva.</p>
        </div>
      ) : null}

      <Card className="mt-6 grid gap-4 md:grid-cols-2">
        <SectionTitle
          className="md:col-span-2"
          description="Primero se crea el acceso del dueno y sus sucursales habilitadas. Logo, banner, ubicacion, rubro y datos publicos se completan despues desde su panel."
          title="Acceso del dueno"
        />
        <Input defaultValue={values.ownerName} name="ownerName" placeholder="Nombre del dueno" required />
        <Input defaultValue={values.ownerEmail} name="ownerEmail" placeholder="correo@negocio.com" required type="email" />
        <Input defaultValue={values.ownerPhone} name="ownerPhone" placeholder="Telefono o WhatsApp" required />
        <Input defaultValue={values.ownerDocumentNumber} name="ownerDocumentNumber" placeholder="Carnet / documento" required />
        <label className="grid gap-1.5">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Fecha de nacimiento</span>
          <BirthDateInput defaultValue={values.ownerBirthDate} name="ownerBirthDate" required />
          <span className="text-xs font-semibold text-[var(--color-secondary-text)]">
            Dato obligatorio para validar identidad del titular. Debe ser mayor de edad.
          </span>
        </label>
        <label className="grid gap-1.5">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Sucursales habilitadas</span>
          <Input defaultValue={values.branchLimit ?? "1"} min={1} name="branchLimit" required type="number" />
          <span className="text-xs font-semibold text-[var(--color-secondary-text)]">
            Es el maximo de sucursales que este dueno podra crear. Usa 1 para solo su primera sucursal.
          </span>
        </label>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-4 text-sm font-semibold text-[var(--color-body)] md:col-span-2">
          El sistema generara una contrasena segura temporal. El restaurante no aparecera en el directorio hasta que el dueno lo cree y complete sus datos desde su propio panel.
          La primera sucursal usa la tarifa principal; las demas se cobran como sucursales adicionales.
        </div>

        <div className="md:col-span-2">
          <Button disabled={pending}>
            {pending ? null : <UserPlus className="h-4 w-4" />}
            {pending ? "Creando dueno..." : "Crear dueno"}
          </Button>
        </div>
      </Card>
      {pending ? <BrandLoadingOverlay title="Creando dueno" description="Generando acceso y contrasena temporal." /> : null}
    </form>
  );
}
