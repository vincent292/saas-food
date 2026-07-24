"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useFormStatus } from "react-dom";
import { signInAction } from "@/app/admin/actions";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { cn } from "@/lib/utils/cn";

export function AdminLoginFormClient() {
  return (
    <form action={signInAction} className="mt-6 space-y-3">
      <LoginFields />
    </form>
  );
}

function LoginFields() {
  const { pending } = useFormStatus();

  return (
    <>
      <fieldset className="space-y-3 disabled:pointer-events-none disabled:opacity-70" disabled={pending}>
        <Input autoComplete="email" name="email" placeholder="correo@restaurante.com" required type="email" />
        <PasswordInput autoComplete="current-password" name="password" placeholder="Contrasena" required />
      </fieldset>

      <Button className="min-h-12 w-full" disabled={pending} type="submit">
        {pending ? null : <LogIn className="h-4 w-4" />}
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>

      <Link className={cn(buttonClasses("secondary", "w-full"), pending && "pointer-events-none opacity-60")} aria-disabled={pending} href="/">
        Volver al inicio
      </Link>

      {pending ? <BrandLoadingOverlay title="Ingresando al panel" description="Validando tu acceso." /> : null}
    </>
  );
}
