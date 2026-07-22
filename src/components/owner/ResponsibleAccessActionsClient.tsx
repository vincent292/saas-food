"use client";

import { KeyRound, Power, RotateCcw } from "lucide-react";
import { useActionState } from "react";
import { manageResponsibleAccessAction, type ResponsibleAccessFormState } from "@/app/admin/actions";
import { buttonClasses } from "@/components/ui/Button";

const initialState: ResponsibleAccessFormState = {};

export function ResponsibleAccessActionsClient({ restaurantId, targetUserId, isActive }: { restaurantId: string; targetUserId: string; isActive: boolean }) {
  const [state, formAction, pending] = useActionState(manageResponsibleAccessAction, initialState);

  return (
    <div className="space-y-2">
      {state.error ? <p className="rounded-xl bg-[var(--color-danger-soft)] p-2 text-xs font-bold text-[var(--color-danger-strong)]">No se pudo actualizar este acceso.</p> : null}
      {state.success === "password-reset" && state.temporaryPassword ? (
        <div className="rounded-xl bg-[var(--color-success-soft)] p-3 text-xs font-bold text-[var(--color-success-strong)]">
          <p>Nueva contrasena temporal</p>
          <code className="mt-1 block select-all break-all text-sm text-[var(--color-heading)]">{state.temporaryPassword}</code>
        </div>
      ) : null}
      {state.success === "deactivated" ? <p className="text-xs font-bold text-[var(--color-warning-strong)]">Acceso desactivado.</p> : null}
      {state.success === "reactivated" ? <p className="text-xs font-bold text-[var(--color-success-strong)]">Acceso reactivado.</p> : null}
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
