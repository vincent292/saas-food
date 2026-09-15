"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { CheckCircle2, Copy, ExternalLink, KeyRound, Mail, UserPlus } from "lucide-react";
import { createOwnerClientAction, type CreateOwnerFormState } from "@/app/admin/actions";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";
import { Button, buttonClasses } from "@/components/ui/Button";
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
  const [copied, setCopied] = useState(false);
  const values = state.values ?? {};
  const errorMessage = state.error?.startsWith("owner-create:")
    ? `No se pudo crear el usuario: ${state.error.replace("owner-create:", "")}`
    : state.error
      ? (errorMessages[state.error] ?? `No se pudo crear el dueno. Error: ${state.error}`)
      : "";

  if (state.success && state.temporaryPassword) {
    const credentials = `Acceso a Yopido\nUsuario: ${state.success}\nContrasena temporal: ${state.temporaryPassword}\nIngresar en: https://www.yopido.shop/admin/login\nAl ingresar deberas crear una contrasena nueva.`;

    return (
      <Card className="mt-6 space-y-5 border-[var(--color-success-soft)] bg-[var(--color-success-soft)]">
        <div className="flex items-start gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/80 text-[var(--color-success-strong)]">
            <CheckCircle2 className="h-6 w-6" />
          </span>
          <div>
            <h2 className="text-xl font-black text-[var(--color-success-strong)]">Dueno y acceso creados</h2>
            <p className="mt-1 text-sm font-semibold leading-6 text-[var(--color-success-strong)]">
              Entrega estas credenciales al dueno. La contrasena se muestra una sola vez y debera cambiarla en su primer ingreso.
            </p>
          </div>
        </div>

        <div className="grid gap-3 rounded-2xl bg-white/85 p-4 text-[var(--color-heading)]">
          <div className="grid gap-1">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">
              <Mail className="h-4 w-4" />
              Usuario / correo
            </span>
            <code className="select-all break-all text-base font-black">{state.success}</code>
          </div>
          <div className="grid gap-1 border-t border-[var(--border)] pt-3">
            <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">
              <KeyRound className="h-4 w-4" />
              Contrasena temporal
            </span>
            <code className="select-all break-all text-lg font-black">{state.temporaryPassword}</code>
          </div>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
          <Button
            className="w-full sm:w-auto"
            onClick={async () => {
              await navigator.clipboard?.writeText(credentials);
              setCopied(true);
            }}
            type="button"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Datos copiados" : "Copiar datos de acceso"}
          </Button>
          <a className={buttonClasses("secondary", "w-full sm:w-auto")} href="/admin/login" rel="noreferrer" target="_blank">
            <ExternalLink className="h-4 w-4" />
            Abrir inicio de sesion
          </a>
          <Link className={buttonClasses("secondary", "w-full sm:w-auto")} href="/admin/restaurantes">
            Volver a duenos
          </Link>
        </div>
      </Card>
    );
  }

  return (
    <form action={formAction} data-navigation-feedback="off">
      {state.error ? (
        <div className="mt-6 rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-4 text-sm font-semibold text-[var(--color-danger-strong)]" role="alert">
          {errorMessage}
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
