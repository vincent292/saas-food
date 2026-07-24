"use client";

import { Copy, KeyRound, Power, RotateCcw, Save } from "lucide-react";
import { useActionState } from "react";
import { manageResponsibleAccessAction, type ResponsibleAccessFormState } from "@/app/admin/actions";
import { buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";

const initialState: ResponsibleAccessFormState = {};

const errorMessages: Record<string, string> = {
  invalid: "Revisa los datos del responsable.",
  "invalid-profile": "Nombre y correo son obligatorios.",
  "owner-protected": "No puedes modificar tu propio usuario desde aqui.",
  "owner-required": "Solo el dueno de esta sucursal puede modificar este acceso.",
  "password-reset": "No se pudo generar la nueva clave.",
  "responsible-account-required": "Este usuario no pertenece al responsable directo de la sucursal.",
  "responsible-email-exists": "Ese correo ya esta usado por otro usuario.",
  "responsible-profile-auth": "No se pudo cambiar el correo en Auth.",
  "responsible-profile-update": "No se pudo actualizar el perfil.",
  "service-role-required": "Falta la clave de servicio para administrar usuarios.",
};

export function ResponsibleAccessActionsClient({
  email,
  fullName,
  restaurantId,
  targetUserId,
  isActive,
}: {
  email: string;
  fullName: string;
  restaurantId: string;
  targetUserId: string;
  isActive: boolean;
}) {
  const [state, formAction, pending] = useActionState(manageResponsibleAccessAction, initialState);

  return (
    <div className="space-y-3">
      {state.error ? (
        <p className="rounded-[var(--radius-control)] bg-[var(--color-danger-soft)] p-3 text-xs font-bold text-[var(--color-danger-strong)]">
          {errorMessages[state.error] ?? "No se pudo actualizar este acceso."}
        </p>
      ) : null}
      {state.success === "profile-updated" ? <p className="rounded-[var(--radius-control)] bg-[var(--color-success-soft)] p-3 text-xs font-bold text-[var(--color-success-strong)]">Datos actualizados.</p> : null}
      {state.success === "password-reset" && state.temporaryPassword ? (
        <div className="rounded-[var(--radius-control)] bg-[var(--color-success-soft)] p-3 text-xs font-bold text-[var(--color-success-strong)]">
          <p>Nueva contrasena temporal</p>
          <div className="mt-2 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <code className="block select-all break-all rounded-[0.75rem] bg-white/80 p-2 text-sm text-[var(--color-heading)]">{state.temporaryPassword}</code>
            <button
              className={buttonClasses("secondary", "min-h-9 px-3 text-xs")}
              onClick={() => navigator.clipboard?.writeText(state.temporaryPassword ?? "")}
              type="button"
            >
              <Copy className="h-4 w-4" />
              Copiar
            </button>
          </div>
        </div>
      ) : null}
      {state.success === "deactivated" ? <p className="text-xs font-bold text-[var(--color-warning-strong)]">Acceso desactivado.</p> : null}
      {state.success === "reactivated" ? <p className="text-xs font-bold text-[var(--color-success-strong)]">Acceso reactivado.</p> : null}

      <form action={formAction} className="grid gap-2 rounded-[var(--radius-card)] border border-[var(--border)] bg-[var(--color-surface)] p-3">
        <input name="restaurantId" type="hidden" value={restaurantId} />
        <input name="targetUserId" type="hidden" value={targetUserId} />
        <input name="intent" type="hidden" value="update-profile" />
        <input name="email" type="hidden" value={email.includes("@") ? email : ""} />
        <label className="grid gap-1.5">
          <span className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Nombre de usuario</span>
          <Input defaultValue={fullName} name="fullName" required />
        </label>
        <div className="rounded-[var(--radius-control)] border border-[var(--border)] bg-[var(--surface)] px-4 py-3">
          <p className="text-xs font-black uppercase tracking-[0.12em] text-[var(--color-secondary-text)]">Usuario / correo de acceso</p>
          <p className="mt-1 break-all text-sm font-black text-[var(--color-heading)]">{email}</p>
        </div>
        <button className={buttonClasses("primary", "w-full")} disabled={pending} type="submit">
          <Save className="h-4 w-4" />
          Guardar nombre
        </button>
      </form>

      <form action={formAction} className="flex flex-wrap justify-end gap-2">
        <input name="restaurantId" type="hidden" value={restaurantId} />
        <input name="targetUserId" type="hidden" value={targetUserId} />
        <button className={buttonClasses("secondary")} disabled={pending || !isActive} name="intent" type="submit" value="reset-password">
          <KeyRound className="h-4 w-4" />
          Nueva clave
        </button>
        <button className={buttonClasses(isActive ? "secondary" : "primary")} disabled={pending} name="intent" type="submit" value={isActive ? "deactivate" : "reactivate"}>
          {isActive ? <Power className="h-4 w-4" /> : <RotateCcw className="h-4 w-4" />}
          {isActive ? "Desactivar" : "Reactivar"}
        </button>
      </form>
    </div>
  );
}
