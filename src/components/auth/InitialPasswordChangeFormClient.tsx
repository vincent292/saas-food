"use client";

import { useActionState } from "react";
import { KeyRound, Loader2 } from "lucide-react";
import { changeInitialPasswordAction, type ChangeInitialPasswordFormState } from "@/app/admin/actions";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";

const errorMessages: Record<string, string> = {
  invalid: "La contrasena debe tener minimo 12 caracteres, una mayuscula, una minuscula, un numero y ambas contrasenas deben coincidir.",
  update: "No se pudo actualizar la contrasena. Intenta nuevamente.",
};

const initialState: ChangeInitialPasswordFormState = {};

export function InitialPasswordChangeFormClient() {
  const [state, formAction, pending] = useActionState(changeInitialPasswordAction, initialState);

  return (
    <form action={formAction} className="mt-6 space-y-3">
      {state.error ? (
        <div className="rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger-strong)]" role="alert">
          {errorMessages[state.error] ?? "No se pudo actualizar la contrasena."}
        </div>
      ) : null}
      <PasswordInput autoComplete="new-password" minLength={12} name="password" placeholder="Nueva contrasena" required />
      <PasswordInput autoComplete="new-password" minLength={12} name="confirmPassword" placeholder="Repite la nueva contrasena" required />
      <Button className="w-full" disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        {pending ? "Actualizando..." : "Guardar y continuar"}
      </Button>
    </form>
  );
}
