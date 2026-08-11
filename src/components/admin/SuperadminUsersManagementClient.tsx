"use client";

import { Copy, KeyRound, MessageCircle, Search, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useActionState } from "react";
import { resetSuperadminUserPasswordAction, type SuperadminUserPasswordFormState } from "@/app/admin/actions";
import { Badge } from "@/components/ui/Badge";
import { buttonClasses } from "@/components/ui/Button";
import { DataTable } from "@/components/ui/DataTable";
import { Input } from "@/components/ui/Input";
import { formatShortDate } from "@/lib/utils/dates";
import type { SuperadminUserGroup, SuperadminUserRecord } from "@/lib/services/superadmin-users.service";

const initialState: SuperadminUserPasswordFormState = {};

const errorMessages: Record<string, string> = {
  invalid: "Revisa el usuario y la contrasena.",
  "password-reset": "No se pudo actualizar la contrasena.",
  "self-protected": "No puedes resetear tu propia cuenta desde este modulo.",
  "service-role-required": "Falta SUPABASE_SERVICE_ROLE_KEY para administrar usuarios.",
  "user-not-found": "No existe el usuario en Auth.",
};

const accountTypeLabels: Record<SuperadminUserRecord["accountType"], string> = {
  auth: "Auth",
  business: "Admin",
  customer: "Cliente",
};

function whatsappHref(phone: string, fullName: string, password: string) {
  const phoneDigits = phone.replace(/\D/g, "");
  if (!phoneDigits || !password) return "";

  const text = `Hola ${fullName || "usuario"}, tu contrasena temporal de Yopido es: ${password}. Ingresa con esa clave y el sistema te pedira cambiarla.`;
  return `https://wa.me/${phoneDigits}?text=${encodeURIComponent(text)}`;
}

function groupHref(group: SuperadminUserGroup, search: string) {
  const params = new URLSearchParams({ tipo: group });
  if (search) params.set("q", search);
  return `/admin/usuarios?${params.toString()}`;
}

export function SuperadminUsersManagementClient({
  activeGroup,
  search,
  users,
}: {
  activeGroup: SuperadminUserGroup;
  search: string;
  users: SuperadminUserRecord[];
}) {
  const emptyMessage = search
    ? `No encontramos ${activeGroup === "clientes" ? "clientes" : "usuarios operativos"} con esa busqueda.`
    : activeGroup === "clientes"
      ? "Todavia no hay clientes registrados."
      : "Todavia no hay usuarios operativos registrados.";

  return (
    <div className="space-y-5">
      <div className="flex gap-2 overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-2 shadow-sm">
        <Link
          className={activeGroup === "operativos" ? buttonClasses("primary") : buttonClasses("ghost")}
          href={groupHref("operativos", search)}
          prefetch={false}
        >
          Operativos
        </Link>
        <Link
          className={activeGroup === "clientes" ? buttonClasses("primary") : buttonClasses("ghost")}
          href={groupHref("clientes", search)}
          prefetch={false}
        >
          Clientes
        </Link>
      </div>

      <form action="/admin/usuarios" className="grid gap-3 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--surface)] p-4 shadow-[var(--shadow-card)] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <input name="tipo" type="hidden" value={activeGroup} />
        <label className="grid gap-1.5">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">
            Buscar {activeGroup === "clientes" ? "cliente" : "usuario operativo"}
          </span>
          <Input defaultValue={search} name="q" placeholder="Nombre, correo, telefono o carnet" />
        </label>
        <button className={buttonClasses("primary", "sm:self-end")} type="submit">
          <Search className="h-4 w-4" />
          Buscar
        </button>
      </form>

      <DataTable
        emptyMessage={emptyMessage}
        headers={["Usuario", "Contacto", "Carnet", "Tipo", "Estado", "Registro", "Clave"]}
        rows={users.map((user) => [
          <div className="flex items-center gap-3" key={`${user.id}-name`}>
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-[var(--primary-light)] text-[var(--primary-dark)]">
              <UserRound className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <p className="truncate font-black">{user.fullName}</p>
              <p className="truncate text-xs font-semibold text-[var(--color-secondary-text)]">{user.id}</p>
            </div>
          </div>,
          <div className="grid gap-1" key={`${user.id}-contact`}>
            <p className="break-all font-bold">{user.email || "Sin correo"}</p>
            <p className="text-xs font-semibold text-[var(--color-secondary-text)]">{user.phone || "Sin telefono"}</p>
          </div>,
          <span className="font-semibold" key={`${user.id}-document`}>{user.documentNumber || "Sin carnet"}</span>,
          <div className="grid gap-1" key={`${user.id}-type`}>
            <Badge>{accountTypeLabels[user.accountType]}</Badge>
            <span className="text-xs font-bold text-[var(--color-secondary-text)]">{user.roleLabel}</span>
          </div>,
          <div className="grid gap-1" key={`${user.id}-status`}>
            <Badge className={user.statusLabel === "Activo" ? "bg-[var(--color-success-soft)] text-[var(--color-success-strong)]" : "bg-[var(--color-warning-soft)] text-[var(--color-warning-strong)]"}>
              {user.statusLabel}
            </Badge>
            {user.mustChangePassword ? (
              <span className="inline-flex items-center gap-1 text-xs font-black text-[var(--color-warning-strong)]">
                <ShieldCheck className="h-3.5 w-3.5" />
                Cambio pendiente
              </span>
            ) : null}
          </div>,
          <div className="text-xs font-semibold text-[var(--color-secondary-text)]" key={`${user.id}-dates`}>
            <p>{formatShortDate(user.createdAt)}</p>
            <p>Ultimo: {user.lastSignInAt ? formatShortDate(user.lastSignInAt) : "sin registro"}</p>
          </div>,
          <PasswordResetPanel key={`${user.id}-password`} user={user} />,
        ])}
      />
    </div>
  );
}

function PasswordResetPanel({ user }: { user: SuperadminUserRecord }) {
  const [state, formAction, pending] = useActionState(resetSuperadminUserPasswordAction, initialState);
  const temporaryPassword = state.targetUserId === user.id ? state.temporaryPassword : "";
  const href = temporaryPassword ? whatsappHref(user.phone, user.fullName, temporaryPassword) : "";

  return (
    <div className="grid min-w-[18rem] gap-2">
      {state.targetUserId === user.id && state.error ? (
        <p className="rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] p-2 text-xs font-bold text-[var(--color-danger-strong)]">
          {errorMessages[state.error] ?? "No se pudo actualizar la contrasena."}
        </p>
      ) : null}
      {temporaryPassword ? (
        <div className="rounded-[var(--radius-control)] bg-[var(--color-success-soft)] p-2 text-xs font-bold text-[var(--color-success-strong)]">
          <p>Contrasena temporal</p>
          <code className="mt-1 block select-all break-all rounded-[0.65rem] bg-white/80 p-2 text-sm text-[var(--color-heading)]">{temporaryPassword}</code>
          <div className="mt-2 flex flex-wrap gap-2">
            <button className={buttonClasses("secondary", "min-h-9 px-3 text-xs")} onClick={() => navigator.clipboard?.writeText(temporaryPassword)} type="button">
              <Copy className="h-4 w-4" />
              Copiar
            </button>
            {href ? (
              <a className={buttonClasses("primary", "min-h-9 px-3 text-xs")} href={href} rel="noreferrer" target="_blank">
                <MessageCircle className="h-4 w-4" />
                WhatsApp
              </a>
            ) : null}
          </div>
        </div>
      ) : null}

      <form action={formAction} className="grid gap-2">
        <input name="targetUserId" type="hidden" value={user.id} />
        <Input autoComplete="new-password" minLength={8} name="password" placeholder="Clave manual opcional" type="text" />
        <button className={buttonClasses("secondary", "w-full")} disabled={pending} type="submit">
          <KeyRound className="h-4 w-4" />
          {pending ? "Actualizando..." : "Aplicar / generar"}
        </button>
      </form>
    </div>
  );
}
