"use client";

import Link from "next/link";
import { LogIn } from "lucide-react";
import { useState } from "react";
import { useFormStatus } from "react-dom";
import { signInAction } from "@/app/admin/actions";
import { BrandLoadingOverlay } from "@/components/ui/BrandLoadingOverlay";
import { Button, buttonClasses } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";

export function AdminLoginFormClient() {
  return (
    <form action={signInAction} className="mt-6 space-y-3" data-navigation-feedback="off">
      <LoginFields />
    </form>
  );
}

function LoginFields() {
  const { pending } = useFormStatus();
  const [googlePending, setGooglePending] = useState(false);
  const [googleError, setGoogleError] = useState("");

  async function signInWithGoogle() {
    setGooglePending(true);
    setGoogleError("");

    try {
      const supabase = createClient();
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/admin")}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo,
        },
      });

      if (error) {
        setGoogleError("No se pudo abrir Google. Revisa la configuracion de Supabase.");
        setGooglePending(false);
      }
    } catch {
      setGoogleError("No se pudo abrir Google. Intenta nuevamente.");
      setGooglePending(false);
    }
  }

  return (
    <>
      <button
        className="inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-full border border-[var(--border)] bg-[var(--surface)] px-4 text-sm font-black text-[var(--color-heading)] shadow-sm transition hover:border-[var(--primary-light)] hover:bg-[var(--primary-light)] active:scale-[0.99] disabled:pointer-events-none disabled:opacity-70"
        disabled={pending || googlePending}
        onClick={signInWithGoogle}
        type="button"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-white text-base font-black text-[#4285F4] shadow-sm ring-1 ring-black/10">G</span>
        {googlePending ? "Abriendo Google..." : "Ingresar con Google"}
      </button>

      {googleError ? (
        <p className="rounded-2xl border border-[var(--color-danger-soft)] bg-[var(--color-danger-soft)] p-3 text-sm font-semibold text-[var(--color-danger-strong)]">
          {googleError}
        </p>
      ) : null}

      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 text-xs font-black uppercase tracking-[0.16em] text-[var(--color-secondary-text)]">
        <span className="h-px bg-[var(--border)]" />
        O usa correo
        <span className="h-px bg-[var(--border)]" />
      </div>

      <fieldset className="space-y-3 disabled:pointer-events-none disabled:opacity-70" disabled={pending || googlePending}>
        <Input autoComplete="email" name="email" placeholder="correo@restaurante.com" required type="email" />
        <PasswordInput autoComplete="current-password" name="password" placeholder="Contrasena" required />
      </fieldset>

      <Button className="min-h-12 w-full" disabled={pending || googlePending} type="submit">
        {pending ? null : <LogIn className="h-4 w-4" />}
        {pending ? "Ingresando..." : "Ingresar"}
      </Button>

      <Link className={cn(buttonClasses("secondary", "w-full"), (pending || googlePending) && "pointer-events-none opacity-60")} aria-disabled={pending || googlePending} href="/">
        Volver al inicio
      </Link>

      {pending ? <BrandLoadingOverlay title="Ingresando al panel" description="Validando tu acceso." /> : null}
      {googlePending ? <BrandLoadingOverlay title="Abriendo Google" description="Redirigiendo al acceso seguro." /> : null}
    </>
  );
}
