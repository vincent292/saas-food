"use client";

import { useActionState, useMemo, useState } from "react";
import { CheckCircle2, KeyRound, XCircle } from "lucide-react";
import { changeInitialPasswordAction, type ChangeInitialPasswordFormState } from "@/app/admin/actions";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";
import { Button } from "@/components/ui/Button";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { cn } from "@/lib/utils/cn";

const errorMessages: Record<string, string> = {
  invalid: "La contrasena debe tener minimo 12 caracteres, una mayuscula, una minuscula, un numero y ambas contrasenas deben coincidir.",
  update: "No se pudo actualizar la contrasena. Intenta nuevamente.",
};

const initialState: ChangeInitialPasswordFormState = {};

export function InitialPasswordChangeFormClient() {
  const [state, formAction, pending] = useActionState(changeInitialPasswordAction, initialState);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const rules = useMemo(
    () => [
      { label: "Minimo 12 caracteres", valid: password.length >= 12 },
      { label: "Una mayuscula", valid: /[A-Z]/.test(password) },
      { label: "Una minuscula", valid: /[a-z]/.test(password) },
      { label: "Un numero", valid: /[0-9]/.test(password) },
      { label: "Ambas contrasenas coinciden", valid: Boolean(confirmPassword) && password === confirmPassword },
    ],
    [confirmPassword, password],
  );
  const canSubmit = rules.every((rule) => rule.valid);

  return (
    <form action={formAction} className="mt-6 space-y-3" data-navigation-feedback="off">
      {state.error ? (
        <div className="rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger-strong)]" role="alert">
          {errorMessages[state.error] ?? "No se pudo actualizar la contrasena."}
        </div>
      ) : null}
      <PasswordInput autoComplete="new-password" minLength={12} name="password" onChange={(event) => setPassword(event.currentTarget.value)} placeholder="Nueva contrasena" required value={password} />
      <PasswordInput autoComplete="new-password" minLength={12} name="confirmPassword" onChange={(event) => setConfirmPassword(event.currentTarget.value)} placeholder="Repite la nueva contrasena" required value={confirmPassword} />
      <div className="grid gap-2 rounded-2xl border border-[var(--border)] bg-[var(--color-surface)] p-3" aria-live="polite">
        {rules.map((rule) => (
          <div className={cn("flex items-center gap-2 text-xs font-black", rule.valid ? "text-[var(--color-success-strong)]" : "text-[var(--color-danger-strong)]")} key={rule.label}>
            {rule.valid ? <CheckCircle2 className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            <span>{rule.label}</span>
          </div>
        ))}
      </div>
      <Button className="w-full" disabled={pending || !canSubmit}>
        {pending ? null : <KeyRound className="h-4 w-4" />}
        {pending ? "Actualizando..." : "Guardar y continuar"}
      </Button>
      {pending ? <BrandLoadingOverlay title="Actualizando contrasena" description="Preparando tu primer acceso." /> : null}
    </form>
  );
}
